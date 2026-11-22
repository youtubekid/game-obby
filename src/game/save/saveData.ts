// Saved progress: best times per course and a run in progress to resume. Pure logic (no DOM, no
// Babylon): storage is injected, so it is unit-testable in Node and works where localStorage is
// missing or blocked (private windows, sandboxed iframes).

/** Bump when the stored shape changes, and teach `parseSave` to migrate the old shape. */
export const SAVE_VERSION = 1;
/** Storage key; one entry holds every course. */
export const SAVE_KEY = 'game1.save';

/** A run in progress, saved at each checkpoint (and death) so it can be resumed after a reload. */
export interface RunProgress {
  /** Last checkpoint reached (index in the course's checkpoint list). */
  readonly checkpoint: number;
  readonly deaths: number;
  /** Run time at the moment of saving (ms). */
  readonly elapsedMs: number;
  /** Cumulative split per stage so far (null = not completed). */
  readonly splits: readonly (number | null)[];
}

export interface CourseSave {
  readonly bestTotalMs: number | null;
  /** Best time spent in each stage (ms), from any run; null = none yet. */
  readonly bestStageMs: readonly (number | null)[];
  readonly progress: RunProgress | null;
}

export interface SaveData {
  readonly version: typeof SAVE_VERSION;
  /** Keyed by course name. */
  readonly courses: Readonly<Record<string, CourseSave>>;
}

/** The part of the Web Storage API the game uses. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EMPTY_SAVE: SaveData = { version: SAVE_VERSION, courses: {} };
export const EMPTY_COURSE: CourseSave = { bestTotalMs: null, bestStageMs: [], progress: null };

/**
 * Reads stored text into save data. Never throws: missing, corrupt or partly invalid data keeps
 * whatever is valid and drops the rest; data from an unknown (newer) version is ignored.
 */
export function parseSave(text: string | null): SaveData {
  if (text === null) return EMPTY_SAVE;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return EMPTY_SAVE;
  }
  if (!isRecord(raw) || raw.version !== SAVE_VERSION || !isRecord(raw.courses)) return EMPTY_SAVE;
  const courses: Record<string, CourseSave> = {};
  for (const [name, value] of Object.entries(raw.courses)) {
    const course = parseCourse(value);
    if (course) courses[name] = course;
  }
  return { version: SAVE_VERSION, courses };
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

/** Saved data for a course, by its key (`courseKey()`: name plus a fingerprint of its layout). */
export function courseSave(data: SaveData, course: string): CourseSave {
  return data.courses[course] ?? EMPTY_COURSE;
}

/**
 * Stores a course's data. Entries for older layouts of the same course (`name#otherHash`) are
 * dropped: their times and checkpoints no longer match the course.
 */
function withCourse(data: SaveData, course: string, save: CourseSave): SaveData {
  const name = course.split('#')[0] ?? course;
  const courses = Object.fromEntries(
    Object.entries(data.courses).filter(([key]) => key.split('#')[0] !== name),
  );
  return { ...data, courses: { ...courses, [course]: save } };
}

/** Stores (or clears, with null) the run in progress for a course. */
export function saveProgress(
  data: SaveData,
  course: string,
  progress: RunProgress | null,
): SaveData {
  return withCourse(data, course, { ...courseSave(data, course), progress });
}

/**
 * Records a finished run: keeps the best total and the best time per stage, clears the run in
 * progress, and reports which records are new.
 */
export function recordFinish(
  data: SaveData,
  course: string,
  totalMs: number,
  stageMs: readonly (number | null)[],
): { data: SaveData; newBestTotal: boolean; newBestStages: boolean[] } {
  const old = courseSave(data, course);
  const newBestTotal = old.bestTotalMs === null || totalMs < old.bestTotalMs;
  const newBestStages = stageMs.map((ms, i) => {
    const best = old.bestStageMs[i] ?? null;
    return ms !== null && (best === null || ms < best);
  });
  const bestStageMs = stageMs.map((ms, i) =>
    newBestStages[i] ? ms : (old.bestStageMs[i] ?? null),
  );
  return {
    data: withCourse(data, course, {
      bestTotalMs: newBestTotal ? totalMs : old.bestTotalMs,
      bestStageMs,
      progress: null,
    }),
    newBestTotal,
    newBestStages,
  };
}

/** Loads from storage; a storage that throws (blocked) reads as empty. */
export function loadSave(storage: SaveStorage): SaveData {
  try {
    return parseSave(storage.getItem(SAVE_KEY));
  } catch {
    return EMPTY_SAVE;
  }
}

/** Writes to storage; failures (quota, blocked) are ignored: saving is best effort. */
export function writeSave(storage: SaveStorage, data: SaveData): void {
  try {
    storage.setItem(SAVE_KEY, serializeSave(data));
  } catch {
    // Nothing else to do: the game keeps running without persistence.
  }
}

/** Storage that lives only in memory (tests, and browsers where localStorage is unavailable). */
export function memoryStorage(initial: Record<string, string> = {}): SaveStorage {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

/** The browser's localStorage when it works, otherwise memory storage. */
export function browserStorage(global: { localStorage?: SaveStorage } = globalThis): SaveStorage {
  try {
    const storage = global.localStorage;
    if (storage) {
      // Accessing or writing can throw in private windows and sandboxed iframes.
      storage.getItem(SAVE_KEY);
      return storage;
    }
  } catch {
    // Fall through to memory storage.
  }
  return memoryStorage();
}

function parseCourse(value: unknown): CourseSave | null {
  if (!isRecord(value)) return null;
  return {
    bestTotalMs: isTime(value.bestTotalMs) ? value.bestTotalMs : null,
    bestStageMs: Array.isArray(value.bestStageMs) ? value.bestStageMs.map(timeOrNull) : [],
    progress: parseProgress(value.progress),
  };
}

function parseProgress(value: unknown): RunProgress | null {
  if (!isRecord(value)) return null;
  const { checkpoint, deaths, elapsedMs, splits } = value;
  if (!isCount(checkpoint) || !isCount(deaths) || !isTime(elapsedMs) || !Array.isArray(splits)) {
    return null;
  }
  return { checkpoint, deaths, elapsedMs, splits: splits.map(timeOrNull) };
}

/** A non-negative whole number. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function timeOrNull(value: unknown): number | null {
  return isTime(value) ? value : null;
}

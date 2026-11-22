import { describe, expect, it } from 'vitest';
import { course1 } from '../../src/game/course/course1';
import { courseKey } from '../../src/game/course/fingerprint';
import { vec3 } from '../../src/game/course/types';
import { elapsedMs, resumeRun } from '../../src/game/run/runState';
import {
  browserStorage,
  courseSave,
  EMPTY_SAVE,
  loadSave,
  memoryStorage,
  parseSave,
  recordFinish,
  SAVE_KEY,
  SAVE_VERSION,
  saveProgress,
  serializeSave,
  writeSave,
  type SaveData,
  type SaveStorage,
} from '../../src/game/save/saveData';

const COURSE = 'Sky Islands';
const progress = { checkpoint: 1, deaths: 3, elapsedMs: 42_000, splits: [10_000, 30_000, null] };

describe('save data', () => {
  it('round-trips through storage', () => {
    let data = saveProgress(EMPTY_SAVE, COURSE, progress);
    data = recordFinish(data, 'Other course', 90_000, [40_000, 50_000]).data;
    const storage = memoryStorage();
    writeSave(storage, data);
    expect(loadSave(storage)).toEqual(data);
    expect(courseSave(loadSave(storage), COURSE).progress).toEqual(progress);
  });

  it('reads missing or corrupt data as empty, never throwing', () => {
    expect(parseSave(null)).toEqual(EMPTY_SAVE);
    expect(parseSave('')).toEqual(EMPTY_SAVE);
    expect(parseSave('{not json')).toEqual(EMPTY_SAVE);
    expect(parseSave('[1,2,3]')).toEqual(EMPTY_SAVE);
    expect(parseSave('null')).toEqual(EMPTY_SAVE);
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION }))).toEqual(EMPTY_SAVE);
  });

  it('keeps the valid parts of partly broken data', () => {
    const text = JSON.stringify({
      version: SAVE_VERSION,
      courses: {
        [COURSE]: {
          bestTotalMs: 'fast',
          bestStageMs: [1000, -5, 'x', null, 2500],
          progress: { checkpoint: 1.5, deaths: 0, elapsedMs: 1, splits: [] },
        },
        Broken: 42,
      },
    });
    const data = parseSave(text);
    expect(Object.keys(data.courses)).toEqual([COURSE]);
    expect(courseSave(data, COURSE)).toEqual({
      bestTotalMs: null,
      bestStageMs: [1000, null, null, null, 2500],
      progress: null,
    });
  });

  it('ignores data from another schema version (older or newer)', () => {
    const v1 = serializeSave(saveProgress(EMPTY_SAVE, COURSE, progress));
    const bumped = (version: number) => JSON.stringify({ ...JSON.parse(v1), version });
    expect(parseSave(bumped(SAVE_VERSION + 1))).toEqual(EMPTY_SAVE);
    expect(parseSave(bumped(0))).toEqual(EMPTY_SAVE);
    expect(parseSave(v1)).not.toEqual(EMPTY_SAVE);
  });
});

describe('course keys', () => {
  it('fingerprint the layout: stable for the same data, different after any change', () => {
    expect(courseKey(course1)).toBe(courseKey(structuredClone(course1)));
    expect(courseKey(course1)).toMatch(/^Sky Islands#[0-9a-f]{8}$/);
    expect(courseKey({ ...course1, killY: course1.killY - 1 })).not.toBe(courseKey(course1));
    expect(courseKey({ ...course1, stages: course1.stages.slice(0, -1) })).not.toBe(
      courseKey(course1),
    );
  });

  it('drops saves for older layouts of the same course when writing', () => {
    let data = recordFinish(EMPTY_SAVE, 'Sky#aaaaaaaa', 50_000, [50_000]).data;
    data = recordFinish(data, 'Other#cccccccc', 70_000, [70_000]).data;
    data = recordFinish(data, 'Sky#bbbbbbbb', 90_000, [90_000]).data;
    expect(Object.keys(data.courses).sort()).toEqual(['Other#cccccccc', 'Sky#bbbbbbbb']);
    // The new layout starts fresh: 90 s is its best, not the old layout's 50 s.
    expect(courseSave(data, 'Sky#bbbbbbbb').bestTotalMs).toBe(90_000);
  });
});

describe('best times', () => {
  it('keeps the best total and the best time per stage, and flags new ones', () => {
    const first = recordFinish(EMPTY_SAVE, COURSE, 60_000, [10_000, 20_000, 30_000]);
    expect(first.newBestTotal).toBe(true);
    expect(first.newBestStages).toEqual([true, true, true]);

    // Slower overall, but a faster second stage.
    const second = recordFinish(first.data, COURSE, 70_000, [12_000, 15_000, 43_000]);
    expect(second.newBestTotal).toBe(false);
    expect(second.newBestStages).toEqual([false, true, false]);
    expect(courseSave(second.data, COURSE)).toMatchObject({
      bestTotalMs: 60_000,
      bestStageMs: [10_000, 15_000, 30_000],
    });

    const third = recordFinish(second.data, COURSE, 55_000, [null, 25_000, 30_000]);
    expect(third.newBestTotal).toBe(true);
    // A stage without a split never counts as a new best, and keeps the old one.
    expect(third.newBestStages).toEqual([false, false, false]);
    expect(courseSave(third.data, COURSE).bestStageMs).toEqual([10_000, 15_000, 30_000]);
  });

  it('clears the run in progress at the finish', () => {
    const saved = saveProgress(EMPTY_SAVE, COURSE, progress);
    const done = recordFinish(saved, COURSE, 80_000, [10_000, 30_000, 40_000]).data;
    expect(courseSave(done, COURSE).progress).toBeNull();
  });
});

describe('storage', () => {
  const throwing: SaveStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };

  it('survives storage that throws (blocked, full)', () => {
    expect(loadSave(throwing)).toEqual(EMPTY_SAVE);
    expect(() => {
      writeSave(throwing, EMPTY_SAVE);
    }).not.toThrow();
  });

  it('falls back to memory storage where localStorage is missing or blocked', () => {
    for (const global of [{}, { localStorage: throwing }]) {
      const storage = browserStorage(global);
      storage.setItem(SAVE_KEY, 'x');
      expect(storage.getItem(SAVE_KEY)).toBe('x');
    }
    const local = memoryStorage();
    expect(browserStorage({ localStorage: local })).toBe(local);
  });
});

describe('resuming a saved run', () => {
  it('continues at the checkpoint with the saved time, deaths and splits', () => {
    const data: SaveData = saveProgress(EMPTY_SAVE, COURSE, progress);
    const saved = courseSave(data, COURSE).progress;
    if (!saved) throw new Error('No progress');
    const run = resumeRun(saved, vec3(0, 1.5, 44), 3, 5000);
    expect(run.checkpoint).toBe(1);
    expect(run.deaths).toBe(3);
    expect(run.respawn).toEqual(vec3(0, 1.5, 44));
    expect(run.splits).toEqual([10_000, 30_000, null]);
    // The timer runs on from the saved time.
    expect(elapsedMs(run, 5000)).toBe(42_000);
    expect(elapsedMs(run, 6000)).toBe(43_000);
  });
});

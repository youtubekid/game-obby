// In-game HUD (run timer, deaths), the results screen and the "continue?" prompt, as a DOM overlay
// above the canvas. It only displays what it is given; run logic lives in src/game/run/ and saving
// in src/game/save/.

import { formatRunTime } from '../game/run/runState';

export interface ResultsData {
  readonly totalMs: number;
  readonly deaths: number;
  /** Time spent in each stage (ms), null for a stage without a split. */
  readonly stageTimes: readonly (number | null)[];
  readonly stageNames: readonly string[];
  /** Best total after this run (it may be this run). */
  readonly bestTotalMs: number | null;
  readonly newBestTotal: boolean;
  /** Per stage: this run set a new best time. */
  readonly newBestStages: readonly boolean[];
}

export interface ResumeData {
  /** Name of the stage the player would continue in. */
  readonly stageName: string;
  readonly elapsedMs: number;
  readonly deaths: number;
}

export interface HudActions {
  onPlayAgain(): void;
  onContinue(): void;
  onNewRun(): void;
}

/**
 * Timer and death counter at the top of the screen; a results panel with "Play again"; and a
 * prompt offering to continue a saved run. Buttons work with mouse, touch and keyboard (the main
 * one takes focus); gamepad and touch jump are handled by the game (a fresh jump press chooses
 * "Play again" / "Continue").
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly time: HTMLSpanElement;
  private readonly deaths: HTMLSpanElement;
  private readonly results: HTMLDivElement;
  private readonly resultsBody: HTMLDivElement;
  private readonly playAgain: HTMLButtonElement;
  private readonly resume: HTMLDivElement;
  private readonly resumeBody: HTMLParagraphElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly newRunButton: HTMLButtonElement;
  private shownTime = '';
  private shownDeaths = -1;

  constructor(
    doc: Document,
    private readonly actions: HudActions,
  ) {
    this.root = el(doc, 'div', { id: 'hud' });
    const bar = el(doc, 'div', { className: 'hud-bar' });
    this.time = el(doc, 'span', { className: 'hud-time', textContent: formatRunTime(0) });
    this.deaths = el(doc, 'span', { className: 'hud-deaths' });
    bar.append(this.time, this.deaths);

    this.results = dialog(doc, 'results', 'Finished!');
    this.resultsBody = el(doc, 'div', { className: 'results-body' });
    this.playAgain = button(doc, 'Play again', 'results-again', this.onPlayAgain);
    this.results.append(this.resultsBody, this.playAgain);

    this.resume = dialog(doc, 'resume', 'Continue your run?');
    this.resumeBody = el(doc, 'p', { className: 'resume-body' });
    this.continueButton = button(doc, 'Continue', 'results-again', this.onContinue);
    this.newRunButton = button(doc, 'New run', 'results-secondary', this.onNewRun);
    const buttons = el(doc, 'div', { className: 'results-buttons' });
    buttons.append(this.continueButton, this.newRunButton);
    this.resume.append(this.resumeBody, buttons);

    this.root.append(bar, this.results, this.resume);
    doc.body.append(this.root);
    this.update(0, 0);
  }

  /** Shows the running time and deaths; only touches the DOM when the text changes. */
  update(elapsedMs: number, deaths: number): void {
    const time = formatRunTime(elapsedMs);
    if (time !== this.shownTime) {
      this.time.textContent = time;
      this.shownTime = time;
    }
    if (deaths !== this.shownDeaths) {
      this.deaths.textContent = `Deaths ${deaths}`;
      this.shownDeaths = deaths;
    }
  }

  showResults(data: ResultsData): void {
    const doc = this.root.ownerDocument;
    const summary = el(doc, 'p', { className: 'results-total' });
    summary.append(
      el(doc, 'span', { textContent: formatRunTime(data.totalMs) }),
      el(doc, 'span', { textContent: `${data.deaths} ${data.deaths === 1 ? 'death' : 'deaths'}` }),
    );
    const best = el(doc, 'p', {
      className: data.newBestTotal ? 'results-best new-best' : 'results-best',
      textContent: data.newBestTotal
        ? 'New best time!'
        : `Best ${data.bestTotalMs === null ? '–' : formatRunTime(data.bestTotalMs)}`,
    });
    const table = el(doc, 'table', { className: 'results-splits' });
    data.stageTimes.forEach((ms, i) => {
      const row = el(doc, 'tr', { className: data.newBestStages[i] ? 'new-best' : '' });
      const time = ms === null ? '–' : formatRunTime(ms);
      row.append(
        el(doc, 'th', { textContent: data.stageNames[i] ?? `Stage ${i + 1}` }),
        el(doc, 'td', { textContent: data.newBestStages[i] ? `★ ${time}` : time }),
      );
      table.append(row);
    });
    this.resultsBody.replaceChildren(summary, best, table);
    this.results.hidden = false;
    this.playAgain.focus({ preventScroll: true });
  }

  hideResults(): void {
    this.results.hidden = true;
  }

  get resultsVisible(): boolean {
    return !this.results.hidden;
  }

  showResume(data: ResumeData): void {
    const deaths = `${data.deaths} ${data.deaths === 1 ? 'death' : 'deaths'}`;
    this.resumeBody.textContent = `${data.stageName} · ${formatRunTime(data.elapsedMs)} · ${deaths}`;
    this.resume.hidden = false;
    this.continueButton.focus({ preventScroll: true });
  }

  hideResume(): void {
    this.resume.hidden = true;
  }

  get resumeVisible(): boolean {
    return !this.resume.hidden;
  }

  /**
   * If one of the HUD's visible buttons has focus, presses it and returns true. Lets a jump press
   * (Space, gamepad A) choose the button the player has tabbed to, not always the default one.
   */
  activateFocused(): boolean {
    const focused = this.root.ownerDocument.activeElement;
    for (const b of [this.playAgain, this.continueButton, this.newRunButton]) {
      if (b === focused && b.closest('[hidden]') === null) {
        b.click();
        return true;
      }
    }
    return false;
  }

  dispose(): void {
    this.playAgain.removeEventListener('click', this.onPlayAgain);
    this.continueButton.removeEventListener('click', this.onContinue);
    this.newRunButton.removeEventListener('click', this.onNewRun);
    this.root.remove();
  }

  private readonly onPlayAgain = (): void => {
    this.actions.onPlayAgain();
  };

  private readonly onContinue = (): void => {
    this.actions.onContinue();
  };

  private readonly onNewRun = (): void => {
    this.actions.onNewRun();
  };
}

/** A hidden, non-modal dialog (no focus trap: the game behind it stays reachable) with a title. */
function dialog(doc: Document, id: string, title: string): HTMLDivElement {
  const node = el(doc, 'div', { id, className: 'results', hidden: true });
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-labelledby', `${id}-title`);
  node.append(el(doc, 'h2', { id: `${id}-title`, textContent: title }));
  return node;
}

function button(
  doc: Document,
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const node = el(doc, 'button', { type: 'button', textContent: label, className });
  node.addEventListener('click', onClick);
  return node;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Partial<Pick<HTMLElement, 'id' | 'className' | 'textContent' | 'hidden'>> & {
    type?: string;
  },
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (props.id !== undefined) node.id = props.id;
  if (props.className !== undefined && props.className !== '') node.className = props.className;
  if (props.textContent !== undefined) node.textContent = props.textContent;
  if (props.hidden !== undefined) node.hidden = props.hidden;
  if (props.type !== undefined) node.setAttribute('type', props.type);
  return node;
}

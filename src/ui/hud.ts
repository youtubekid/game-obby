// In-game HUD (run timer, deaths) and the results screen, as a DOM overlay above the canvas.
// It only displays what it is given; run logic lives in src/game/run/runState.ts.

import { formatRunTime } from '../game/run/runState';

export interface ResultsData {
  readonly totalMs: number;
  readonly deaths: number;
  /** Time spent in each stage (ms), null for a stage without a split. */
  readonly stageTimes: readonly (number | null)[];
  readonly stageNames: readonly string[];
}

/**
 * Timer and death counter at the top of the screen, and a results panel with a "Play again"
 * button. The button works with mouse, touch and keyboard (it takes focus); gamepad and touch
 * jump are handled by the game (`Game` restarts on a fresh jump press).
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly time: HTMLSpanElement;
  private readonly deaths: HTMLSpanElement;
  private readonly results: HTMLDivElement;
  private readonly resultsBody: HTMLDivElement;
  private readonly playAgain: HTMLButtonElement;
  private shownTime = '';
  private shownDeaths = -1;

  constructor(
    doc: Document,
    private readonly onPlayAgain: () => void,
  ) {
    this.root = el(doc, 'div', { id: 'hud' });
    const bar = el(doc, 'div', { className: 'hud-bar' });
    this.time = el(doc, 'span', { className: 'hud-time', textContent: formatRunTime(0) });
    this.deaths = el(doc, 'span', { className: 'hud-deaths' });
    bar.append(this.time, this.deaths);

    this.results = el(doc, 'div', { id: 'results', className: 'results', hidden: true });
    // A non-modal dialog: the game behind it stays reachable (no focus trap).
    this.results.setAttribute('role', 'dialog');
    this.results.setAttribute('aria-labelledby', 'results-title');
    const title = el(doc, 'h2', { id: 'results-title', textContent: 'Finished!' });
    this.resultsBody = el(doc, 'div', { className: 'results-body' });
    this.playAgain = el(doc, 'button', { type: 'button', textContent: 'Play again' });
    this.playAgain.className = 'results-again';
    this.playAgain.addEventListener('click', this.onClick);
    this.results.append(title, this.resultsBody, this.playAgain);

    this.root.append(bar, this.results);
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
    const table = el(doc, 'table', { className: 'results-splits' });
    data.stageTimes.forEach((ms, i) => {
      const row = el(doc, 'tr', {});
      row.append(
        el(doc, 'th', { textContent: data.stageNames[i] ?? `Stage ${i + 1}` }),
        el(doc, 'td', { textContent: ms === null ? '–' : formatRunTime(ms) }),
      );
      table.append(row);
    });
    this.resultsBody.replaceChildren(summary, table);
    this.results.hidden = false;
    this.playAgain.focus({ preventScroll: true });
  }

  hideResults(): void {
    this.results.hidden = true;
  }

  get resultsVisible(): boolean {
    return !this.results.hidden;
  }

  dispose(): void {
    this.playAgain.removeEventListener('click', this.onClick);
    this.root.remove();
  }

  private readonly onClick = (): void => {
    this.onPlayAgain();
  };
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
  if (props.className !== undefined) node.className = props.className;
  if (props.textContent !== undefined) node.textContent = props.textContent;
  if (props.hidden !== undefined) node.hidden = props.hidden;
  if (props.type !== undefined) node.setAttribute('type', props.type);
  return node;
}

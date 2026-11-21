import type { InputSource, PartialActions } from './actions';

// Physical key codes (KeyboardEvent.code), so WASD works on any keyboard layout.
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const JUMP = ['Space'];
const HANDLED = new Set([...LEFT, ...RIGHT, ...FORWARD, ...BACK, ...JUMP]);

/** Maps the set of held key codes to actions. Pure: unit-testable without a DOM. */
export function keyboardActions(held: ReadonlySet<string>): PartialActions {
  const any = (codes: readonly string[]): number => (codes.some((c) => held.has(c)) ? 1 : 0);
  return {
    move: { x: any(RIGHT) - any(LEFT), y: any(FORWARD) - any(BACK) },
    jump: any(JUMP) === 1,
  };
}

/** Browser shortcuts (Ctrl+S, ...) and typing into fields (e.g. the inspector) are not game input. */
function isShortcutOrTyping(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Keyboard device: tracks held keys on a target (window) and reports them as actions. */
export class KeyboardSource implements InputSource {
  private readonly held = new Set<string>();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!HANDLED.has(event.code) || isShortcutOrTyping(event)) return;
    // Stop Space/arrows from scrolling the page or pressing a focused button.
    event.preventDefault();
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  /** Keys released while the window is unfocused never send keyup; forget them. */
  private readonly onBlur = (): void => {
    this.held.clear();
  };

  constructor(private readonly target: Window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  read(): PartialActions {
    return keyboardActions(this.held);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.held.clear();
  }
}

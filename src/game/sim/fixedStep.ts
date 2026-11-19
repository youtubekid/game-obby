/**
 * Turns variable frame deltas into a whole number of fixed simulation steps (the classic
 * accumulator). Pure logic: no Babylon imports, so it is unit-testable in Node.
 */
export class FixedStepper {
  private accumulatedMs = 0;

  /**
   * @param stepMs  length of one simulation step
   * @param maxStepsPerAdvance  cap on steps per frame; time beyond it is dropped so a long pause
   *   (tab switch, breakpoint) does not trigger a burst of catch-up steps. Consequence: below
   *   1000 / (stepMs * maxStepsPerAdvance) fps (~12 fps at 60 Hz with 5) the game runs slower than
   *   real time instead of skipping simulation, which is the intended trade-off.
   */
  constructor(
    readonly stepMs: number,
    readonly maxStepsPerAdvance = 5,
  ) {
    if (!(stepMs > 0)) throw new Error('stepMs must be positive');
    if (!Number.isInteger(maxStepsPerAdvance) || maxStepsPerAdvance < 1) {
      throw new Error('maxStepsPerAdvance must be a positive integer');
    }
  }

  /** Adds frame time and returns how many fixed steps to run now. */
  advance(deltaMs: number): number {
    if (Number.isFinite(deltaMs) && deltaMs > 0) this.accumulatedMs += deltaMs;
    const steps = Math.min(Math.floor(this.accumulatedMs / this.stepMs), this.maxStepsPerAdvance);
    this.accumulatedMs -= steps * this.stepMs;
    // Drop time the cap did not allow us to simulate, keeping less than one step for interpolation.
    if (this.accumulatedMs >= this.stepMs) this.accumulatedMs %= this.stepMs;
    return steps;
  }

  /** Fraction (0..1) of the next step already elapsed; use it to interpolate rendering. */
  get alpha(): number {
    return this.accumulatedMs / this.stepMs;
  }
}

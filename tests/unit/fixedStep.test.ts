import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../../src/game/sim/fixedStep';

describe('FixedStepper', () => {
  it('runs no step until a full step has accumulated', () => {
    const stepper = new FixedStepper(10);
    expect(stepper.advance(4)).toBe(0);
    expect(stepper.advance(4)).toBe(0);
    expect(stepper.advance(4)).toBe(1);
    expect(stepper.alpha).toBeCloseTo(0.2);
  });

  it('runs several steps for a long frame and keeps the remainder', () => {
    const stepper = new FixedStepper(10);
    expect(stepper.advance(35)).toBe(3);
    expect(stepper.alpha).toBeCloseTo(0.5);
    expect(stepper.advance(5)).toBe(1);
    expect(stepper.alpha).toBeCloseTo(0);
  });

  it('total steps match total time regardless of how frames are split', () => {
    const a = new FixedStepper(1000 / 60);
    const b = new FixedStepper(1000 / 60);
    let stepsA = 0;
    let stepsB = 0;
    for (let i = 0; i < 120; i++) stepsA += a.advance(1000 / 120);
    for (let i = 0; i < 30; i++) stepsB += b.advance(1000 / 30);
    expect(stepsA).toBe(60);
    expect(stepsB).toBe(60);
  });

  it('caps catch-up steps after a long pause and drops the excess time', () => {
    const stepper = new FixedStepper(10, 5);
    expect(stepper.advance(10_000)).toBe(5);
    expect(stepper.alpha).toBeLessThan(1);
    expect(stepper.advance(0)).toBe(0);
  });

  it('ignores negative, zero and non-finite deltas', () => {
    const stepper = new FixedStepper(10);
    expect(stepper.advance(-50)).toBe(0);
    expect(stepper.advance(Number.NaN)).toBe(0);
    expect(stepper.advance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(stepper.alpha).toBe(0);
  });

  it('rejects invalid configuration', () => {
    expect(() => new FixedStepper(0)).toThrow();
    expect(() => new FixedStepper(10, 0)).toThrow();
    expect(() => new FixedStepper(10, 1.5)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { motionBlend } from './camera-motion';

describe('camera motion timing', () => {
  it('takes the same path at 30, 60 and 144 frames per second', () => {
    const sample = (fps: number) => {
      let position = 0;
      for (let frame = 0; frame < fps / 2; frame++)
        position += (1 - position) * motionBlend(1 / fps);
      return position;
    };
    expect(sample(30)).toBeCloseTo(sample(60), 12);
    expect(sample(144)).toBeCloseTo(sample(60), 12);
    expect(sample(60)).toBeGreaterThan(0.98);
  });

  it('respects reduced motion and does not move backward on a repeated timestamp', () => {
    expect(motionBlend(0)).toBe(0);
    expect(motionBlend(-1)).toBe(0);
    expect(motionBlend(1 / 60, 0.12, true)).toBe(1);
    expect(motionBlend(5)).toBeCloseTo(1);
  });
});

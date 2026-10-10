import { describe, expect, it } from 'vitest';
import {
  addMouseLook,
  advanceMouseLook,
  cameraFocusReady,
  emptyMouseLook,
  motionBlend,
  type MouseLook,
} from './camera-motion';

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

describe('bounded mouse look', () => {
  const expectSameLook = (a: MouseLook, b: MouseLook) => {
    for (const key of ['x', 'y', 'impulseX', 'impulseY'] as const)
      expect(a[key]).toBeCloseTo(b[key], 12);
  };

  it('gives the same response for partitioned displacement at one event time', () => {
    let small = emptyMouseLook();
    for (let i = 0; i < 160; i++) small = addMouseLook(small, 1, -0.5);
    const large = addMouseLook(emptyMouseLook(), 160, -80);
    expectSameLook(advanceMouseLook(small, 0.1), advanceMouseLook(large, 0.1));
  });

  it('uses the same elapsed time at 30, 60 and 144fps, and when advancing to event times', () => {
    const sample = (fps: number) => {
      let state = addMouseLook(emptyMouseLook(), 80, -40);
      for (let i = 0; i < fps / 2; i++) state = advanceMouseLook(state, 1 / fps);
      return state;
    };
    const exact = advanceMouseLook(addMouseLook(emptyMouseLook(), 80, -40), 0.5);
    for (const fps of [30, 60, 144]) expectSameLook(sample(fps), exact);
    let atEvents = advanceMouseLook(addMouseLook(emptyMouseLook(), 80, -40), 0.031);
    atEvents = advanceMouseLook(atEvents, 0.072);
    expectSameLook(advanceMouseLook(atEvents, 0.397), exact);
  });

  it('responds promptly, remains bounded under large repeated movement and returns to rest', () => {
    let state = advanceMouseLook(addMouseLook(emptyMouseLook(), 10000, -10000), 1 / 60);
    expect(state.x).toBeGreaterThan(0.3);
    expect(state.y).toBeLessThan(-0.3);
    for (let i = 0; i < 500; i++) {
      state = advanceMouseLook(addMouseLook(state, 200, -200), 1 / 144);
      for (const value of Object.values(state)) expect(Math.abs(value)).toBeLessThanOrEqual(1);
    }
    state = advanceMouseLook(state, 5);
    expect(Math.abs(state.x)).toBeLessThan(1e-8);
    expect(Math.abs(state.y)).toBeLessThan(1e-8);
  });

  it('clears continuous motion for reduced motion and reset, and ignores repeated time', () => {
    const moving = advanceMouseLook(addMouseLook(emptyMouseLook(), 80, 20), 0.05);
    expect(advanceMouseLook(moving, 0)).toEqual(moving);
    expect(advanceMouseLook(moving, -1)).toEqual(moving);
    expect(advanceMouseLook(moving, 1 / 60, true)).toEqual(emptyMouseLook());
    expect(addMouseLook(moving, 80, 0, true)).toEqual(emptyMouseLook());
    expect(addMouseLook(emptyMouseLook(), 0, 0)).toEqual(emptyMouseLook());
  });

  it('allows a click throughout mouse look after the base focus settles', () => {
    let look = addMouseLook(emptyMouseLook(), 80, 20);
    for (let frame = 0; frame < 30; frame++) {
      look = advanceMouseLook(look, 1 / 60);
      expect(look.x).toBeGreaterThan(0);
      expect(cameraFocusReady(0, 0)).toBe(true);
      expect(cameraFocusReady(0.1, 0)).toBe(false);
      expect(cameraFocusReady(0, 0.02)).toBe(false);
    }
    expect(cameraFocusReady(0.09, 0)).toBe(false);
    expect(cameraFocusReady(0, 0.01)).toBe(false);
    expect(cameraFocusReady(Number.NaN, 0)).toBe(false);
  });
});

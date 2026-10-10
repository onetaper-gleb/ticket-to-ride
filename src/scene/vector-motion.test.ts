import { describe, expect, it } from 'vitest';
import {
  COLLECTION_GESTURE_THRESHOLD,
  GESTURE_IDLE_MS,
  emptyGesture,
  feedGesture,
  type Direction,
  type GestureThresholds,
} from './vector-motion';

function recognise(
  deltas: [number, number][],
  thresholds: GestureThresholds = 48,
  origin = { x: 0, y: 0 },
) {
  let state = emptyGesture();
  let pointer = origin;
  const directions: Direction[] = [];
  for (const [dx, dy] of deltas) {
    const nextPointer = { x: pointer.x + dx, y: pointer.y + dy };
    let result = feedGesture(
      state,
      nextPointer.x - pointer.x,
      nextPointer.y - pointer.y,
      10,
      thresholds,
    );
    pointer = nextPointer;
    while (result.direction) {
      directions.push(result.direction);
      result = feedGesture(result.state, 0, 0, 10, thresholds);
    }
    state = result.state;
  }
  return { state, directions };
}

describe('relative gesture recognition', () => {
  it('recognises the same gesture in the centre, corners and outside the old item regions', () => {
    const path: [number, number][] = [
      [25, 1],
      [25, 2],
      [48, 0],
    ];
    const reference = recognise(path);
    expect(reference.directions).toEqual(['right', 'right']);
    for (const origin of [
      { x: 640, y: 360 },
      { x: 0, y: 0 },
      { x: 1850, y: 1040 },
    ])
      expect(recognise(path, 48, origin)).toEqual(reference);
  });

  it('retains small events and consumes every threshold from a long event', () => {
    const small = recognise(Array.from({ length: 200 }, () => [1, 0]));
    const large = recognise([[200, 0]]);
    expect(small).toEqual(large);
    expect(large.directions).toEqual(['right', 'right', 'right', 'right']);
    expect(large.state.x).toBe(8);
    expect(recognise(Array.from({ length: 47 }, () => [1, 0])).directions).toEqual([]);
  });

  it('uses separate option and collection thresholds without losing a remainder', () => {
    let result = feedGesture(emptyGesture(), 240, 0, 20);
    const directions: Direction[] = [];
    if (result.direction) directions.push(result.direction);
    // The caller reaches the grid edge after one option and changes the threshold.
    result = feedGesture(result.state, 0, 0, 20, { right: COLLECTION_GESTURE_THRESHOLD });
    if (result.direction) directions.push(result.direction);
    result = feedGesture(result.state, 0, 0, 20, { right: COLLECTION_GESTURE_THRESHOLD });
    expect(directions).toEqual(['right', 'right']);
    expect(result.direction).toBeNull();
    expect(result.state.x).toBe(48);
    expect(result.state.lastEventAt).toBe(20);
  });

  it('does not make a diagonal choose or leave credit for a later straight gesture', () => {
    const diagonal = recognise(Array.from({ length: 120 }, () => [1, 1]));
    expect(diagonal.directions).toEqual([]);
    expect(recognise([[120, 120]])).toEqual(diagonal);
    let result = feedGesture(diagonal.state, 47, 0, 20);
    expect(result.direction).toBeNull();
    result = feedGesture(result.state, 1, 0, 21);
    expect(result.direction).toBe('right');
    const prior = feedGesture(emptyGesture(), 40, 0, 10).state;
    expect(feedGesture(prior, 48, 48, 20).direction).toBeNull();
  });

  it('handles reversal and a perpendicular gesture without the previous direction blocking it', () => {
    const prior = feedGesture(emptyGesture(), 40, 0, 10).state;
    expect(feedGesture(prior, -48, 0, 20).direction).toBe('left');
    expect(feedGesture(prior, 0, 48, 20).direction).toBe('down');
    let split = prior;
    let direction: Direction | null = null;
    for (let i = 0; i < 48; i++) {
      const result = feedGesture(split, 0, 1, 20 + i);
      split = result.state;
      direction = result.direction;
      if (i < 47) expect(direction).toBeNull();
    }
    expect(direction).toBe('down');
  });

  it('rejects alternating jitter and clears credit after idle, time reversal or an explicit reset', () => {
    expect(
      recognise(Array.from({ length: 200 }, (_, i) => [i % 2 ? -1 : 1, 0])).directions,
    ).toEqual([]);
    const prior = feedGesture(emptyGesture(), 47, 0, 10).state;
    expect(feedGesture(prior, 1, 0, 10 + GESTURE_IDLE_MS).direction).toBeNull();
    expect(feedGesture(prior, 1, 0, 9).direction).toBeNull();
    expect(feedGesture(emptyGesture(), 1, 0, 11).direction).toBeNull();
    expect(feedGesture(prior, Number.NaN, 0, 11).state).toEqual(emptyGesture());
  });

  it('does not keep an idle gesture alive while checking an unconsumed remainder', () => {
    const initial = feedGesture(emptyGesture(), 48 + 47, 0, 10);
    expect(initial.direction).toBe('right');
    const consume = feedGesture(initial.state, 0, 0, 100);
    expect(consume.state.lastEventAt).toBe(10);
    expect(feedGesture(consume.state, 1, 0, 10 + GESTURE_IDLE_MS).direction).toBeNull();
  });

  it('does not bank displacement in a direction with no permitted neighbor', () => {
    const blocked = feedGesture(emptyGesture(), -2000, 0, 10, { left: Infinity });
    expect(blocked.direction).toBeNull();
    expect(blocked.state.x).toBe(0);
    expect(feedGesture(blocked.state, 48, 0, 11).direction).toBe('right');
  });
});

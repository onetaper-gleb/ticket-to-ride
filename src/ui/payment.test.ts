import { describe, expect, it } from 'vitest';
import type { Card, ClaimOption } from '../shared/types';
import { paymentMatches } from './payment';

const hand: Card[] = [
  { id: 'red-1', color: 'red' },
  { id: 'red-2', color: 'red' },
  { id: 'red-3', color: 'red' },
  { id: 'blue-1', color: 'blue' },
  { id: 'wild-1', color: 'wild' },
  { id: 'wild-2', color: 'wild' },
];
const ferryPayment: ClaimOption[] = [{ color: 'red', cardIds: ['red-1', 'wild-1'], wildCount: 1 }];

describe('manual payment from authoritative core options', () => {
  it('accepts different physical copies of the same legal color combination', () => {
    expect(paymentMatches(['wild-2', 'red-3'], ferryPayment, hand)).toBe(true);
  });
  it('preserves a required locomotive instead of matching only total card count', () => {
    expect(paymentMatches(['red-1', 'red-2'], ferryPayment, hand)).toBe(false);
    expect(paymentMatches(['blue-1', 'wild-2'], ferryPayment, hand)).toBe(false);
  });
  it('does not authorize a different locomotive count unless the core offered it', () => {
    expect(paymentMatches(['wild-1', 'wild-2'], ferryPayment, hand)).toBe(false);
    expect(
      paymentMatches(
        ['wild-1', 'wild-2'],
        [...ferryPayment, { color: 'wild', cardIds: ['wild-1', 'wild-2'], wildCount: 2 }],
        hand,
      ),
    ).toBe(true);
  });
  it('rejects duplicated, unknown, empty and extra card ids', () => {
    for (const ids of [['red-1', 'red-1'], ['red-1', 'unknown'], [], ['red-1', 'red-2', 'wild-1']])
      expect(paymentMatches(ids, ferryPayment, hand)).toBe(false);
    expect(paymentMatches(['red-1', 'wild-1'], [], hand)).toBe(false);
  });
});

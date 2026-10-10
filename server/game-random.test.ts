import { describe, expect, it } from 'vitest';
import { cryptoShuffle, createPrivateGame, applyPrivateCommand } from './game-random';
import { hashSeed } from '../src/core/random';
import type { SeatCount } from '../src/network/protocol';

describe('private deck construction', () => {
  it('returns a permutation without changing its input', () => {
    const cards = Array.from({ length: 110 }, (_, i) => ({ id: String(i) })),
      before = structuredClone(cards);
    const shuffled = cryptoShuffle(cards);
    expect(cards).toEqual(before);
    expect(shuffled).not.toBe(cards);
    expect(shuffled.map((c) => c.id).sort()).toEqual(cards.map((c) => c.id).sort());
    expect(cryptoShuffle([])).toEqual([]);
    expect(cryptoShuffle([1])).toEqual([1]);
  });
  it('uses the crypto source through discard exhaustion and a three-locomotive market reset', () => {
    let state = createPrivateGame(2, ['A', 'B']);
    expect(state.rng).toBe(hashSeed(state.seed));
    for (let i = 0; i < 2; i++)
      state = applyPrivateCommand(state, {
        type: 'chooseTickets',
        ticketIds: state.players[i]!.ticketOptions.slice(0, 2).map((t) => t.id),
      }).state;
    const pool = [...state.deck, ...state.market, ...state.discard];
    const take = (wild: boolean) => {
      const index = pool.findIndex((c) => (c.color === 'wild') === wild);
      return pool.splice(index, 1)[0]!;
    };
    state.market = [take(true), take(true), take(true), take(false), take(false)];
    state.deck = [];
    state.discard = pool;
    const before = structuredClone(state),
      next = applyPrivateCommand(state, { type: 'draw', source: 3 });
    expect(next.error).toBeUndefined();
    expect(state).toEqual(before);
    // The solo PRNG would advance during both reshuffles. The online callback bypasses it.
    expect(next.state.rng).toBe(before.rng);
    expect(next.state.deck.length).toBeGreaterThan(0);
    expect(next.state.market.filter((c) => c.color === 'wild').length).toBeLessThan(3);
    const cards = [
      ...next.state.deck,
      ...next.state.market,
      ...next.state.discard,
      ...next.state.players.flatMap((p) => p.hand),
    ];
    expect(cards).toHaveLength(110);
    expect(new Set(cards.map((c) => c.id)).size).toBe(110);
  });
  it.each([2, 3, 4, 5] as SeatCount[])(
    'conserves all Europe cards and tickets for %i seats',
    (seats) => {
      const state = createPrivateGame(
        seats,
        Array.from({ length: seats }, (_, i) => `Human ${i + 1}`),
      );
      const cards = [
        ...state.deck,
        ...state.market,
        ...state.discard,
        ...state.players.flatMap((p) => p.hand),
      ];
      const tickets = [
        ...state.ticketDeck,
        ...state.unusedTickets,
        ...state.players.flatMap((p) => p.ticketOptions),
      ];
      expect(cards).toHaveLength(110);
      expect(new Set(cards.map((c) => c.id)).size).toBe(110);
      expect(tickets).toHaveLength(46);
      expect(new Set(tickets.map((t) => t.id)).size).toBe(46);
      expect(state.market).toHaveLength(5);
      expect(state.market.filter((c) => c.color === 'wild').length).toBeLessThan(3);
      for (const player of state.players) {
        expect(player.hand).toHaveLength(4);
        expect(player.ticketOptions).toHaveLength(4);
        expect(player.ticketOptions.filter((t) => t.long)).toHaveLength(1);
        expect(player.name).toBe(`Human ${player.id + 1}`);
      }
    },
  );
});

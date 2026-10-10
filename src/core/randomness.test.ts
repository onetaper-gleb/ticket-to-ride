import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, type CoreRandomness } from './index';
import { hashSeed } from './random';
import type { Card, GameCommand, GameState } from '../shared/types';

function ready(): GameState {
  let state = createGame({ seed: 'injected-shuffle', playerCount: 2 });
  while (state.phase === 'setup') {
    state = applyCommand(state, {
      type: 'chooseTickets',
      ticketIds: state.players[state.activePlayer]!.ticketOptions.slice(0, 2).map((t) => t.id),
    }).state;
  }
  return state;
}

function cards(state: GameState): Card[] {
  return [
    ...state.deck,
    ...state.discard,
    ...state.market,
    ...state.players.flatMap((player) => player.hand),
    ...(state.pendingTunnel?.baseCards ?? []),
    ...(state.pendingTunnel?.revealed ?? []),
  ];
}

function assertConserved(state: GameState) {
  const all = cards(state);
  expect(all).toHaveLength(110);
  expect(new Set(all.map((card) => card.id)).size).toBe(110);
}

function recorder(): { randomness: CoreRandomness; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    randomness: {
      shuffle<T>(items: readonly T[]): T[] {
        calls.push(items.map((item) => (item as { id: string }).id));
        return [...items].reverse();
      },
    },
  };
}

function accept(state: GameState, command: GameCommand, randomness: CoreRandomness) {
  const before = structuredClone(state);
  const transition = applyCommand(state, command, randomness);
  expect(transition.error).toBeUndefined();
  expect(state).toEqual(before);
  expect(transition.state.rng).toBe(state.rng);
  assertConserved(transition.state);
  return transition.state;
}

describe('caller-owned core randomness', () => {
  it('uses the injected permutation for cards and both ticket pools without storing the callback', () => {
    const { randomness, calls } = recorder();
    const state = createGame({ seed: 'online-private', playerCount: 5 }, randomness);
    expect(calls.map((call) => call.length)).toEqual([110, 6, 40]);
    const shuffledCards = [...calls[0]!].reverse();
    expect(state.players.flatMap((player) => player.hand.map((card) => card.id))).toEqual(
      shuffledCards.slice(0, 20),
    );
    expect(state.market.map((card) => card.id)).toEqual(shuffledCards.slice(20, 25));
    expect(state.deck.map((card) => card.id)).toEqual(shuffledCards.slice(25));
    expect(state.players.map((player) => player.ticketOptions[0]!.id)).toEqual(
      [...calls[1]!].reverse().slice(0, 5),
    );
    expect(
      state.players.flatMap((player) => player.ticketOptions.slice(1).map((t) => t.id)),
    ).toEqual([...calls[2]!].reverse().slice(0, 15));
    expect(state.rng).toBe(hashSeed('online-private'));
    expect(Object.keys(state)).toEqual(Object.keys(createGame({ playerCount: 5 })));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    assertConserved(state);
  });

  it('recycles the discard for a blind draw after a serialized resume', () => {
    const source = ready();
    source.discard.push(...source.deck);
    source.deck = [];
    const state: GameState = JSON.parse(JSON.stringify(source));
    const { randomness, calls } = recorder();
    const next = accept(state, { type: 'draw', source: 'deck' }, randomness);
    expect(next.players[0]!.hand.at(-1)!.id).toBe(state.discard.at(-1)!.id);
    expect(next.phase).toBe('draw');
    expect(next.drawsRemaining).toBe(1);
    expect(calls).toEqual([state.discard.map((card) => card.id)]);
  });

  it('uses the injected discard order for the replacement of a face-up locomotive', () => {
    const state = ready();
    state.discard.push(...state.deck);
    state.deck = [];
    const wild = state.discard.findIndex((card) => card.color === 'wild');
    const oldMarket = state.market[0]!;
    state.market[0] = state.discard.splice(wild, 1)[0]!;
    state.discard.unshift(oldMarket);
    const { randomness, calls } = recorder();
    const next = accept(state, { type: 'draw', source: 0 }, randomness);
    expect(calls[0]).toEqual(state.discard.map((card) => card.id));
    expect(next.phase).toBe('action');
    expect(next.activePlayer).toBe(1);
    expect(next.market.some((card) => card.id === state.discard.at(-1)!.id)).toBe(true);
  });

  it('uses the injected discard order for all three tunnel reveal cards', () => {
    const state = ready();
    const all = cards(state);
    const tunnel = state.edges.find(
      (edge) => edge.tunnel && edge.ferries === 0 && edge.length === 2,
    )!;
    const regular = all.filter(
      (card) => card.color === (tunnel.color === 'gray' ? 'red' : tunnel.color),
    );
    const payment = regular.slice(0, 2);
    const reveal = regular.slice(2, 5);
    const used = new Set([...payment, ...reveal].map((card) => card.id));
    state.players[0]!.hand = payment;
    state.players[1]!.hand = all.filter((card) => !used.has(card.id));
    state.deck = [];
    state.market = [];
    state.discard = reveal;
    const { randomness, calls } = recorder();
    const next = accept(
      state,
      { type: 'claim', edgeId: tunnel.id, cardIds: payment.map((c) => c.id) },
      randomness,
    );
    expect(next.phase).toBe('tunnel');
    expect(next.pendingTunnel!.revealed.map((card) => card.id)).toEqual(
      [...reveal].reverse().map((card) => card.id),
    );
    expect(next.pendingTunnel!.extraCost).toBe(3);
    expect(calls).toEqual([reveal.map((card) => card.id)]);
  });

  it('uses the injected shuffle in the bounded three-locomotive market reset on turn completion', () => {
    const state = ready();
    const all = cards(state);
    const wild = all.filter((card) => card.color === 'wild').slice(0, 3);
    const regular = all.filter((card) => card.color === 'red').slice(0, 3);
    const used = new Set([...wild, ...regular].map((card) => card.id));
    state.market = [...wild, ...regular.slice(0, 2)];
    state.deck = [];
    state.discard = [];
    state.players[0]!.hand = regular.slice(2);
    state.players[1]!.hand = all.filter((card) => !used.has(card.id));
    let shuffles = 0;
    const randomness: CoreRandomness = {
      shuffle<T>(items: readonly T[]): T[] {
        shuffles++;
        return [...items].sort(
          (a, b) => Number((b as Card).color === 'wild') - Number((a as Card).color === 'wild'),
        );
      },
    };
    const next = accept(
      state,
      { type: 'buildStation', cityId: state.cities[0]!.id, cardIds: [regular[2]!.id] },
      randomness,
    );
    expect(shuffles).toBeGreaterThan(900);
    expect(next.activePlayer).toBe(1);
    expect(next.market).toHaveLength(5);
    expect(next.market.filter((card) => card.color === 'wild')).toHaveLength(2);
    expect(next.deck).toHaveLength(1);
    expect(next.discard).toEqual([]);
  });

  it('rejects a failed injected draw without committing any partial state', () => {
    const state = ready();
    state.discard.push(...state.deck);
    state.deck = [];
    const before = structuredClone(state);
    const transition = applyCommand(
      state,
      { type: 'draw', source: 'deck' },
      {
        shuffle() {
          throw new Error('shuffle unavailable');
        },
      },
    );
    expect(transition.state).toBe(state);
    expect(transition.error).toBe('shuffle unavailable');
    expect(transition.events).toEqual([]);
    expect(state).toEqual(before);
  });
});

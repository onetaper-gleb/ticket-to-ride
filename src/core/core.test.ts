import { describe, expect, it } from 'vitest';
import type {
  Card,
  CardColor,
  Edge,
  GameCommand,
  GameState,
  PublicBoard,
  Ticket,
} from '../shared/types';
import { COLORS, ROUTE_POINTS, TICKETS } from '../data/europe';
import {
  applyCommand,
  createGame,
  getClaimOptions,
  getGameResult,
  getLegalCommands,
  getLongestRouteLength,
  getObservation,
  getStationOptions,
  getTicketProgress,
  getTunnelPaymentOptions,
} from './index';

function accept(state: GameState, command: GameCommand): GameState {
  const transition = applyCommand(state, command);
  expect(transition.error, JSON.stringify(command)).toBeUndefined();
  return transition.state;
}
function ready(seed = 'rules-test', playerCount: 2 | 3 | 4 | 5 = 2): GameState {
  let state = createGame({ seed, playerCount });
  while (state.phase === 'setup')
    state = accept(state, {
      type: 'chooseTickets',
      ticketIds: state.players[state.activePlayer]!.ticketOptions.slice(0, 2).map(
        (ticket) => ticket.id,
      ),
    });
  return state;
}
function invariant(state: GameState): void {
  const cards = [
    ...state.deck,
    ...state.discard,
    ...state.market,
    ...state.players.flatMap((player) => player.hand),
    ...(state.pendingTunnel?.baseCards ?? []),
    ...(state.pendingTunnel?.revealed ?? []),
  ];
  expect(cards.length).toBe(110);
  expect(new Set(cards.map((card) => card.id)).size).toBe(110);
  for (const color of COLORS) expect(cards.filter((card) => card.color === color).length).toBe(12);
  expect(cards.filter((card) => card.color === 'wild').length).toBe(14);
  const tickets = [
    ...state.ticketDeck,
    ...state.unusedTickets,
    ...state.players.flatMap((player) => [...player.tickets, ...player.ticketOptions]),
  ];
  expect(tickets.length).toBe(46);
  expect(new Set(tickets.map((ticket) => ticket.id)).size).toBe(46);
  state.players.forEach((player) => {
    expect(player.trainsRemaining).toBeGreaterThanOrEqual(0);
    expect(
      player.trainsRemaining +
        state.edges
          .filter((edge) => edge.owner === player.id)
          .reduce((n, edge) => n + edge.length, 0),
    ).toBe(45);
    expect(player.stationsRemaining + player.stations.length).toBe(3);
    expect(player.score).toBe(
      state.edges
        .filter((edge) => edge.owner === player.id)
        .reduce((n, edge) => n + ROUTE_POINTS[edge.length]!, 0),
    );
  });
}
function cardFrom(state: GameState, color: CardColor): Card {
  for (const pile of [
    state.deck,
    state.discard,
    state.market,
    ...state.players.map((player) => player.hand),
  ]) {
    const index = pile.findIndex((card) => card.color === color);
    if (index >= 0) return pile.splice(index, 1)[0]!;
  }
  throw new Error(`No ${color} card`);
}
function handOf(state: GameState, colors: CardColor[]): void {
  const player = state.players[state.activePlayer]!;
  state.deck.push(...player.hand);
  player.hand = [];
  player.hand = colors.map((color) => cardFrom(state, color));
}
function marketOf(state: GameState, colors: CardColor[]): void {
  state.deck.push(...state.market);
  state.market = [];
  state.market = colors.map((color) => cardFrom(state, color));
}
function topOf(state: GameState, colors: CardColor[]): void {
  const cards = colors.map((color) => cardFrom(state, color));
  state.deck.unshift(...cards);
}
function customEdge(id: string, a = 'a', b = 'b', props: Partial<Edge> = {}): Edge {
  return {
    id,
    a,
    b,
    color: 'gray',
    length: 2,
    tunnel: false,
    ferries: 0,
    parallel: null,
    owner: null,
    ...props,
  };
}
function board(edges: Edge[], stations: string[] = []): PublicBoard {
  return {
    cities: [],
    edges,
    players: [
      {
        id: 0,
        name: 'Test',
        color: '#fff',
        handCount: 0,
        ticketCount: 0,
        trainsRemaining: 45,
        stationsRemaining: 3 - stations.length,
        stations,
        score: 0,
      },
    ],
  };
}
function ticket(id: string, a: string, b: string, points: number): Ticket {
  return { id, a, b, points, long: false };
}
function claim(state: GameState, edgeId: string, index = 0): GameState {
  const option = getClaimOptions(getObservation(state, state.activePlayer), edgeId)[index]!;
  expect(option).toBeDefined();
  return accept(state, { type: 'claim', edgeId, cardIds: option.cardIds });
}

// These concrete states target rules and conservation rather than reproducing reducer branches.
describe('classic Europe setup and private observations', () => {
  it.each([2, 3, 4, 5] as const)(
    'deals the exact cards and ticket types to %i players reproducibly',
    (playerCount) => {
      const state = createGame({ seed: 'same', playerCount });
      expect(state).toEqual(createGame({ seed: 'same', playerCount }));
      expect(
        state.players.every(
          (player) =>
            player.hand.length === 4 &&
            player.ticketOptions.length === 4 &&
            player.ticketOptions.filter((item) => item.long).length === 1,
        ),
      ).toBe(true);
      expect(state.market.filter((card) => card.color === 'wild').length).toBeLessThan(3);
      invariant(state);
      expect(createGame({ seed: 'other', playerCount }).deck).not.toEqual(state.deck);
    },
  );
  it('requires at least two distinct offered tickets and removes all initial rejections from play', () => {
    let state = createGame({ playerCount: 2 });
    const offered = state.players[0]!.ticketOptions;
    for (const ticketIds of [
      [offered[0]!.id],
      [offered[0]!.id, offered[0]!.id],
      ['unknown', offered[0]!.id],
    ]) {
      const rejected = applyCommand(state, { type: 'chooseTickets', ticketIds });
      expect(rejected.error).toBeTruthy();
      expect(rejected.state).toBe(state);
    }
    state = accept(state, {
      type: 'chooseTickets',
      ticketIds: offered.slice(1, 3).map((ticket) => ticket.id),
    });
    expect(state.unusedTickets.map((ticket) => ticket.id)).toEqual(
      expect.arrayContaining([offered[0]!.id, offered[3]!.id]),
    );
    expect(state.ticketDeck.some((ticket) => ticket.id === offered[3]!.id)).toBe(false);
    expect(state.activePlayer).toBe(1);
    expect(state.phase).toBe('setup');
    invariant(state);
  });
  it('rejects without mutation and reveals opponents tickets only in the final observation', () => {
    const state = ready();
    const before = structuredClone(state);
    const rejected = applyCommand(state, { type: 'pass' });
    expect(rejected.error).toBeTruthy();
    expect(rejected.state).toBe(state);
    expect(state).toEqual(before);
    const observation = getObservation(state, 0);
    for (const field of ['deck', 'rng', 'seed', 'ticketDeck', 'unusedTickets'])
      expect(observation).not.toHaveProperty(field);
    expect(observation.players[1]).not.toHaveProperty('hand');
    expect(observation.players[1]).not.toHaveProperty('tickets');
    observation.self.hand.length = 0;
    expect(state).toEqual(before);
    state.phase = 'finished';
    expect(getObservation(state, 0).players[1]!.tickets).toEqual(state.players[1]!.tickets);
  });
  it('rejects an unknown runtime command without advancing revision or changing state identity', () => {
    const state = ready();
    const before = structuredClone(state);
    const transition = applyCommand(state, {
      type: 'not-a-game-command',
    } as unknown as GameCommand);
    expect(transition.error).toBe('Неизвестная команда.');
    expect(transition.state).toBe(state);
    expect(state).toEqual(before);
    expect(transition.events).toEqual([]);
  });
});

describe('train cards and destination draws', () => {
  it('counts an open locomotive as the whole action, but a blind locomotive as one card', () => {
    let state = ready();
    marketOf(state, ['wild', 'red', 'blue', 'yellow', 'green']);
    state = accept(state, { type: 'draw', source: 0 });
    expect(state.activePlayer).toBe(1);
    expect(state.players[0]!.hand.length).toBe(5);
    invariant(state);
    state = ready();
    topOf(state, ['wild']);
    marketOf(state, ['red', 'blue', 'yellow', 'green', 'wild']);
    state = accept(state, { type: 'draw', source: 'deck' });
    expect(state.phase).toBe('draw');
    expect(state.drawsRemaining).toBe(1);
    expect(state.activePlayer).toBe(0);
    expect(applyCommand(state, { type: 'draw', source: 4 }).error).toBeTruthy();
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    state = accept(restored, { type: 'draw', source: 'deck' });
    expect(state.activePlayer).toBe(1);
    expect(state.players[0]!.hand.length).toBe(6);
    invariant(state);
  });
  it('replaces the selected market slot, and forbids a replacement locomotive as second pick', () => {
    let state = ready();
    marketOf(state, ['red', 'blue', 'yellow', 'green', 'orange']);
    topOf(state, ['wild']);
    const untouched = state.market.filter((_, i) => i !== 2).map((card) => card.id);
    state = accept(state, { type: 'draw', source: 2 });
    expect(state.market[2]!.color).toBe('wild');
    expect(state.market.filter((_, i) => i !== 2).map((card) => card.id)).toEqual(untouched);
    expect(getLegalCommands(getObservation(state, 0))).not.toContainEqual({
      type: 'draw',
      source: 2,
    });
    invariant(state);
  });
  it('clears a newly created three-locomotive market immediately', () => {
    let state = ready();
    marketOf(state, ['wild', 'wild', 'red', 'blue', 'green']);
    topOf(state, ['wild', 'red', 'blue', 'green', 'orange', 'black']);
    const original = state.market.map((card) => card.id);
    state = accept(state, { type: 'draw', source: 2 });
    expect(state.market.filter((card) => card.color === 'wild').length).toBeLessThan(3);
    expect(original.filter((id) => state.market.some((card) => card.id === id))).toHaveLength(0);
    invariant(state);
  });
  it('allows unlimited hands, reshuffles discards, and completes a lone available draw', () => {
    let state = ready();
    state.players[0]!.hand.push(...state.deck.splice(0, 12));
    state = accept(state, { type: 'draw', source: 'deck' });
    state = accept(state, { type: 'draw', source: 'deck' });
    expect(state.players[0]!.hand.length).toBe(18);
    invariant(state);
    state = ready();
    state.players[1]!.hand.push(...state.deck, ...state.market.slice(1));
    state.deck = [];
    state.market = state.market.slice(0, 1);
    const color = state.market[0]!.color;
    state = accept(state, { type: 'draw', source: 0 });
    expect(state.activePlayer).toBe(1);
    expect(state.phase).toBe('action');
    expect(state.players[0]!.hand.at(-1)!.color).toBe(color);
    invariant(state);
    state = ready();
    state.discard = state.deck;
    state.deck = [];
    state = accept(state, { type: 'draw', source: 'deck' });
    expect(state.phase).toBe('draw');
    invariant(state);
  });
  it('terminates impossible locomotive-only market resets and keeps all cards', () => {
    let state = ready();
    const pool = [
      ...state.deck,
      ...state.discard,
      ...state.market,
      ...state.players.flatMap((player) => player.hand),
    ];
    state.players[0]!.hand = pool.filter((card) => card.color !== 'wild');
    state.players[1]!.hand = [];
    state.deck = pool.filter((card) => card.color === 'wild');
    state.market = [];
    state.discard = [];
    state = accept(state, { type: 'draw', source: 'deck' });
    expect(state.market).toHaveLength(0);
    expect(state.phase).toBe('draw');
    invariant(state);
  });
  it('keeps at least one newly drawn ticket, returns rejected ones to the bottom, and never discards old ones', () => {
    let state = ready();
    const old = state.players[0]!.tickets.map((ticket) => ticket.id);
    state = accept(state, { type: 'drawTickets' });
    const offered = state.players[0]!.ticketOptions;
    expect(applyCommand(state, { type: 'chooseTickets', ticketIds: [old[0]!] }).error).toBeTruthy();
    expect(applyCommand(state, { type: 'chooseTickets', ticketIds: [] }).error).toBeTruthy();
    state = accept(state, { type: 'chooseTickets', ticketIds: [offered[1]!.id] });
    expect(state.ticketDeck.slice(-2).map((ticket) => ticket.id)).toEqual([
      offered[0]!.id,
      offered[2]!.id,
    ]);
    expect(state.players[0]!.tickets.map((ticket) => ticket.id)).toEqual([...old, offered[1]!.id]);
    expect(state.activePlayer).toBe(1);
    invariant(state);
  });
  it('offers the last one or two tickets without inventing cards and disables an exhausted ticket deck', () => {
    for (const remaining of [1, 2]) {
      let state = ready();
      state.unusedTickets.push(...state.ticketDeck.splice(remaining));
      state = accept(state, { type: 'drawTickets' });
      expect(state.players[0]!.ticketOptions).toHaveLength(remaining);
      state = accept(state, {
        type: 'chooseTickets',
        ticketIds: state.players[0]!.ticketOptions.map((ticket) => ticket.id),
      });
      expect(state.ticketDeck).toHaveLength(0);
      expect(
        getLegalCommands(getObservation(state, state.activePlayer)).some(
          (command) => command.type === 'drawTickets',
        ),
      ).toBe(false);
      invariant(state);
    }
  });
});

describe('route payments, ferries and double routes', () => {
  it('accepts exact matching cards with locomotives, rejects mixed/duplicate/foreign cards, and spends plastic trains', () => {
    let state = ready();
    const edge = state.edges.find(
      (edge) => !edge.tunnel && !edge.ferries && edge.color !== 'gray' && edge.length <= 4,
    )!;
    handOf(state, Array(edge.length).fill(edge.color));
    const before = structuredClone(state);
    const ids = state.players[0]!.hand.map((card) => card.id);
    expect(
      applyCommand(state, {
        type: 'claim',
        edgeId: edge.id,
        cardIds: [...ids.slice(0, -1), 'missing'],
      }).error,
    ).toBeTruthy();
    if (ids.length > 1)
      expect(
        applyCommand(state, {
          type: 'claim',
          edgeId: edge.id,
          cardIds: Array(ids.length).fill(ids[0]),
        }).error,
      ).toBeTruthy();
    expect(state).toEqual(before);
    state = claim(state, edge.id);
    expect(state.edges.find((item) => item.id === edge.id)!.owner).toBe(0);
    expect(state.players[0]!.trainsRemaining).toBe(45 - edge.length);
    expect(state.players[0]!.score).toBe(ROUTE_POINTS[edge.length]);
    expect(state.activePlayer).toBe(1);
    invariant(state);
  });
  it('lists distinct gray payment colors and requires the exact ferry minimum', () => {
    const state = ready();
    const gray = customEdge('gray');
    const ferry = customEdge('ferry', 'a', 'b', { length: 4, ferries: 2 });
    state.edges.push(gray, ferry);
    handOf(state, ['red', 'red', 'blue', 'blue', 'wild', 'wild', 'wild']);
    const options = getClaimOptions(getObservation(state, 0), gray.id);
    expect(options.some((option) => option.color === 'red' && option.wildCount === 0)).toBe(true);
    expect(options.some((option) => option.color === 'blue' && option.wildCount === 0)).toBe(true);
    expect(options.filter((option) => option.color === 'wild')).toHaveLength(1);
    expect(
      getClaimOptions(getObservation(state, 0), ferry.id).every((option) => option.wildCount >= 2),
    ).toBe(true);
    const hand = state.players[0]!.hand;
    expect(
      applyCommand(state, {
        type: 'claim',
        edgeId: ferry.id,
        cardIds: hand.slice(0, 4).map((card) => card.id),
      }).error,
    ).toBeTruthy();
    expect(
      applyCommand(state, { type: 'claim', edgeId: gray.id, cardIds: [hand[0]!.id, hand[2]!.id] })
        .error,
    ).toBeTruthy();
    invariant(state);
  });
  it.each([2, 3, 4, 5] as const)(
    'blocks double routes correctly with %i players',
    (playerCount) => {
      const state = ready('parallel', playerCount);
      state.edges = [
        customEdge('left', 'a', 'b', { parallel: 'pair', owner: 0 }),
        customEdge('right', 'a', 'b', { parallel: 'pair' }),
      ];
      handOf(state, ['red', 'red']);
      expect(getClaimOptions(getObservation(state, 0), 'right')).toEqual([]);
      state.activePlayer = 1;
      handOf(state, ['red', 'red']);
      expect(getClaimOptions(getObservation(state, 1), 'right').length > 0).toBe(playerCount >= 4);
    },
  );
});

describe('tunnel attempts and held cards', () => {
  function tunnel(colors: CardColor[] = ['red', 'red', 'red', 'red', 'wild']): {
    state: GameState;
    edge: Edge;
  } {
    const state = ready();
    const edge = state.edges.find((edge) => edge.tunnel && edge.length === 2)!;
    edge.color = 'red';
    edge.ferries = 0;
    handOf(state, colors);
    topOf(state, ['red', 'wild', 'blue']);
    return { state, edge };
  }
  it('holds base and revealed cards outside the hand, pays extra matches, and scores only plastic length', () => {
    let { state, edge } = tunnel();
    state = claim(state, edge.id);
    expect(state.phase).toBe('tunnel');
    expect(state.pendingTunnel!.extraCost).toBe(2);
    expect(state.pendingTunnel!.baseCards).toHaveLength(2);
    invariant(state);
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    const option = getTunnelPaymentOptions(getObservation(restored, 0))[0]!;
    state = accept(restored, { type: 'resolveTunnel', pay: true, cardIds: option.cardIds });
    expect(state.players[0]!.trainsRemaining).toBe(43);
    expect(state.players[0]!.score).toBe(2);
    expect(state.activePlayer).toBe(1);
    invariant(state);
  });
  it('returns every base card on cancellation, discards reveals, and consumes the turn', () => {
    let { state, edge } = tunnel(['red', 'red']);
    const original = state.players[0]!.hand.map((card) => card.id);
    state = claim(state, edge.id);
    const revealed = state.pendingTunnel!.revealed.map((card) => card.id);
    expect(getTunnelPaymentOptions(getObservation(state, 0))).toEqual([]);
    expect(
      applyCommand(state, { type: 'resolveTunnel', pay: true, cardIds: [] }).error,
    ).toBeTruthy();
    state = accept(state, { type: 'resolveTunnel', pay: false });
    expect(state.players[0]!.hand.map((card) => card.id)).toEqual(original);
    expect(state.edges.find((item) => item.id === edge.id)!.owner).toBeNull();
    expect(
      revealed.every((id) =>
        [...state.deck, ...state.discard, ...state.market].some((card) => card.id === id),
      ),
    ).toBe(true);
    expect(state.activePlayer).toBe(1);
    expect(state.players[0]!.score).toBe(0);
    invariant(state);
  });
  it('when paid entirely with locomotives, matches and permits only extra locomotives', () => {
    let { state, edge } = tunnel(['wild', 'wild', 'red', 'red', 'wild']);
    const allWild = getClaimOptions(getObservation(state, 0), edge.id).findIndex(
      (option) => option.color === 'wild',
    );
    state = claim(state, edge.id, allWild);
    expect(state.pendingTunnel!.color).toBe('wild');
    expect(state.pendingTunnel!.extraCost).toBe(1);
    const red = state.players[0]!.hand.find((card) => card.color === 'red')!;
    expect(
      applyCommand(state, { type: 'resolveTunnel', pay: true, cardIds: [red.id] }).error,
    ).toBeTruthy();
    expect(
      getTunnelPaymentOptions(getObservation(state, 0)).every((option) => option.color === 'wild'),
    ).toBe(true);
    invariant(state);
  });
  it('reveals fewer than three when exhausted, including zero without risk', () => {
    let { state, edge } = tunnel(['red', 'red']);
    state.players[1]!.hand.push(...state.deck, ...state.market);
    state.deck = [];
    state.market = [];
    state.discard = [];
    state = claim(state, edge.id);
    expect(state.phase).toBe('action');
    expect(state.activePlayer).toBe(1);
    expect(state.edges.find((item) => item.id === edge.id)!.owner).toBe(0);
    invariant(state);
    ({ state, edge } = tunnel(['red', 'red', 'red']));
    const revealed = cardFrom(state, 'red');
    state.players[1]!.hand.push(...state.deck, ...state.market);
    state.deck = [revealed];
    state.market = [];
    state.discard = [];
    state = claim(state, edge.id);
    expect(state.pendingTunnel!.revealed.length).toBe(1);
    expect(state.pendingTunnel!.extraCost).toBe(1);
    invariant(state);
  });
});

describe('stations, scoring, exact longest trail and final round', () => {
  it('charges one, two and three same-color cards for stations and forbids occupied cities', () => {
    let state = ready();
    const cities = state.cities.slice(0, 3);
    handOf(state, ['red', 'red', 'red', 'red', 'red', 'red']);
    for (let i = 0; i < 3; i++) {
      state.activePlayer = 0;
      const options = getStationOptions(getObservation(state, 0), cities[i]!.id);
      expect(options[0]!.cardIds).toHaveLength(i + 1);
      state = accept(state, {
        type: 'buildStation',
        cityId: cities[i]!.id,
        cardIds: options[0]!.cardIds,
      });
      expect(getStationOptions(getObservation(state, 1), cities[i]!.id)).toEqual([]);
      invariant(state);
    }
    expect(state.players[0]!.stationsRemaining).toBe(0);
    expect(state.players[0]!.hand).toHaveLength(0);
  });
  it('chooses one borrowed route per station jointly for all tickets, not independently for each ticket', () => {
    const edges = [
      customEdge('own', 'a', 'hub', { owner: 0 }),
      customEdge('small', 'hub', 'b', { owner: 1 }),
      customEdge('large', 'hub', 'c', { owner: 1 }),
    ];
    const progress = getTicketProgress(board(edges, ['hub']), 0, [
      ticket('low', 'a', 'b', 5),
      ticket('high', 'a', 'c', 8),
    ]);
    expect(progress.map((item) => item.complete)).toEqual([false, true]);
    expect(progress[0]!.stationRoutes).toEqual(['large']);
    const unclaimed = getTicketProgress(board([customEdge('open', 'hub', 'c')], ['hub']), 0, [
      ticket('t', 'hub', 'c', 8),
    ]);
    expect(unclaimed[0]!.complete).toBe(false);
  });
  it('counts loops and revisited cities exactly, excludes branches and foreign borrowed routes', () => {
    const edges = [
      customEdge('ab', 'a', 'b', { owner: 0, length: 2 }),
      customEdge('bc', 'b', 'c', { owner: 0, length: 3 }),
      customEdge('ca', 'c', 'a', { owner: 0, length: 4 }),
      customEdge('ad', 'a', 'd', { owner: 0, length: 1 }),
    ];
    expect(getLongestRouteLength(board(edges), 0)).toBe(10);
    const star = ['a', 'b', 'c', 'd'].map((city, i) =>
      customEdge(`s${i}`, 'hub', city, { owner: 0, length: i + 1 }),
    );
    expect(getLongestRouteLength(board(star), 0)).toBe(7);
    edges.push(customEdge('foreign', 'd', 'e', { owner: 1, length: 8 }));
    expect(getLongestRouteLength(board(edges, ['d']), 0)).toBe(10);
    const cycle = [
      customEdge('c1', 'a', 'b', { owner: 0 }),
      customEdge('c2', 'b', 'c', { owner: 0 }),
      customEdge('c3', 'c', 'd', { owner: 0 }),
      customEdge('c4', 'd', 'a', { owner: 0 }),
    ];
    ['a', 'b', 'c', 'd'].forEach((city, i) =>
      cycle.push(customEdge(`leaf${i}`, city, `end${i}`, { owner: 0, length: i + 1 })),
    );
    // The two longest leaves need the three-edge arc; a full cycle cannot exit at a different city.
    expect(getLongestRouteLength(board(cycle), 0)).toBe(13);
  });
  it.each([2, 3, 4, 5] as const)(
    'gives every player including the trigger one final turn with %i players',
    (playerCount) => {
      let state = ready('final', playerCount);
      state.players[0]!.trainsRemaining = 2;
      state = accept(state, { type: 'draw', source: 'deck' });
      expect(state.finalTurnsRemaining).toBeNull();
      state = accept(state, { type: 'draw', source: 'deck' });
      expect(state.finalTurnsRemaining).toBe(playerCount);
      expect(state.finalRoundTrigger).toBe(0);
      const acted: number[] = [];
      while (state.phase !== 'finished') {
        const player = state.activePlayer;
        acted.push(player);
        state = accept(state, { type: 'draw', source: 'deck' });
        state = accept(state, { type: 'draw', source: 'deck' });
      }
      expect(acted).toEqual([...Array.from({ length: playerCount - 1 }, (_, i) => i + 1), 0]);
      expect(state.finalTurnsRemaining).toBe(0);
      expect(getLegalCommands(getObservation(state, 0))).toEqual([]);
    },
  );
  it('adds/subtracts tickets, scores unused stations and awards Express to every equal longest route', () => {
    const state = ready();
    state.phase = 'finished';
    state.edges = [
      customEdge('first', 'a', 'b', { owner: 0, length: 3 }),
      customEdge('second', 'c', 'd', { owner: 1, length: 3 }),
    ];
    state.players[0]!.tickets = [ticket('yes', 'a', 'b', 8), ticket('no', 'a', 'c', 5)];
    state.players[1]!.tickets = [ticket('other', 'c', 'd', 6)];
    const result = getGameResult(state);
    const first = result.standings.find((item) => item.playerId === 0)!;
    expect(first.routeScore).toBe(4);
    expect(first.ticketScore).toBe(3);
    expect(first.stationScore).toBe(12);
    expect(first.expressScore).toBe(10);
    expect(first.score).toBe(29);
    expect(result.standings.every((item) => item.expressScore === 10)).toBe(true);
    expect(getGameResult(getObservation(state, 0))).toEqual(result);
  });
  it('uses completed-ticket, unused-station, then Express tie breaks and shares an exact tie', () => {
    const state = ready();
    state.phase = 'finished';
    state.edges = [];
    state.players.forEach((player) => {
      player.tickets = [];
      player.stations = [];
      player.stationsRemaining = 3;
    });
    expect(getGameResult(state).standings.every((standing) => standing.winner)).toBe(true);
    state.players[0]!.tickets = [ticket('zero', 'same', 'same', 4)];
    state.players[0]!.stationsRemaining = 2;
    const result = getGameResult(state);
    expect(result.standings.map((item) => item.score)).toEqual([12, 12]);
    expect(result.standings[0]!.playerId).toBe(0);
    expect(result.standings[0]!.winner).toBe(true);
    state.players[0]!.tickets = [];
    state.players[1]!.tickets = [ticket('unfulfilled', 'a', 'b', 4)];
    const stationTie = getGameResult(state);
    expect(stationTie.standings.map((item) => item.score)).toEqual([8, 8]);
    expect(stationTie.standings[0]!.playerId).toBe(1);
    state.edges = [
      customEdge('p0', 'a', 'b', { owner: 0, length: 3 }),
      customEdge('p1a', 'c', 'd', { owner: 1 }),
      customEdge('p1b', 'e', 'f', { owner: 1 }),
    ];
    state.players[0]!.stationsRemaining = 3;
    state.players[0]!.tickets = [
      ticket('completed0', 'a', 'b', 10),
      ticket('missed0', 'e', 'f', 10),
    ];
    state.players[1]!.tickets = [ticket('completed1', 'c', 'd', 10)];
    const expressTie = getGameResult(state);
    expect(expressTie.standings.map((item) => item.score)).toEqual([26, 26]);
    expect(expressTie.standings.every((item) => item.completedTickets === 1)).toBe(true);
    expect(expressTie.standings[0]!.playerId).toBe(0);
    expect(expressTie.standings[0]!.expressScore).toBe(10);
  });
});

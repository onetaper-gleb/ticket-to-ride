import { describe, expect, it } from 'vitest';
import type { Card, GameCommand, GameState, TrainOrder } from '../shared/types';
import {
  applyCommand,
  createGame,
  getGameResult,
  getLegalCommands,
  getObservation,
  previewOrder,
} from './index';

const idle: TrainOrder = { mode: 'idle', destination: null, returnTo: null, repeat: false };
function accept(state: GameState, command: GameCommand): GameState {
  const transition = applyCommand(state, command);
  expect(transition.error, JSON.stringify(command)).toBeUndefined();
  return transition.state;
}
function ready(seed = 'core-check', playerCount: 2 | 3 | 4 = 2): GameState {
  let state = createGame({ seed, playerCount });
  while (state.phase === 'setup')
    state = accept(state, getLegalCommands(getObservation(state, state.activePlayer))[0]!);
  state.initiative = Array(12).fill(0);
  state.turnOrder = Array.from({ length: playerCount }, (_, index) => index);
  state.activePlayer = 0;
  return state;
}
function endRound(state: GameState): GameState {
  const round = state.round;
  while (state.phase !== 'finished' && state.round === round) {
    if (state.phase === 'action') state = accept(state, { type: 'pass' });
    else if (state.phase === 'orders') state = accept(state, { type: 'endTurn' });
    else throw new Error(`Unexpected ${state.phase}`);
  }
  return state;
}
function invariant(state: GameState): void {
  const cards = [
    ...state.deck,
    ...state.discard,
    ...state.market,
    ...state.players.flatMap((player) => player.hand),
  ];
  expect(cards).toHaveLength(64);
  expect(new Set(cards.map((card) => card.id)).size).toBe(64);
  const groups = [
    ...state.lostGroups,
    ...state.stations.flatMap((station) => station.groups),
    ...state.trains.flatMap((train) => train.cargo),
    ...state.players.flatMap((player) => player.delivered),
  ];
  expect(groups).toHaveLength(state.totalGroups);
  expect(new Set(groups.map((group) => group.id)).size).toBe(state.totalGroups);
  state.trains.forEach((train) => {
    expect(train.cargo.length).toBeLessThanOrEqual(2);
    if (train.disabled) expect(train.cargo).toHaveLength(0);
  });
  state.players.forEach((player) => {
    expect(player.repairScore).toBeGreaterThanOrEqual(0);
    expect(player.repairScore).toBeLessThanOrEqual(4);
  });
}
function moveCardToMarket(state: GameState, color: Card['color'], slot: number): void {
  const index = state.deck.findIndex((card) => card.color === color);
  const old = state.market[slot]!;
  state.market[slot] = state.deck[index]!;
  state.deck[index] = old;
}

describe('state, phases and information boundary', () => {
  it('has one reproducible shuffled 64-card deck and 14/24/8 map', () => {
    const a = createGame({ seed: 'same', playerCount: 4 }),
      b = createGame({ seed: 'same', playerCount: 4 });
    expect(a).toEqual(b);
    expect(a.stations).toHaveLength(14);
    expect(a.edges).toHaveLength(24);
    expect(a.edges.filter((edge) => edge.open)).toHaveLength(8);
    invariant(a);
    expect(
      a.stations.flatMap((station) => station.groups).filter((group) => group.priority),
    ).toHaveLength(4);
    expect(createGame({ seed: 'other', playerCount: 4 }).deck).not.toEqual(a.deck);
  });
  it('rejects illegal commands without changing input or leaking secrets', () => {
    const state = ready();
    const before = structuredClone(state);
    const transition = applyCommand(state, { type: 'endTurn' });
    expect(transition.error).toBeTruthy();
    expect(transition.state).toBe(state);
    expect(state).toEqual(before);
    const observation = getObservation(state, 0);
    expect(observation).not.toHaveProperty('deck');
    expect(observation).not.toHaveProperty('rng');
    expect(observation).not.toHaveProperty('seed');
    expect(observation.players[1]).not.toHaveProperty('hand');
    expect(observation.players[1]).not.toHaveProperty('objectives');
    observation.self.hand.length = 0;
    observation.stations[0]!.groups.length = 0;
    expect(state).toEqual(before);
  });
  it('requires two distinct offered objectives before the first action', () => {
    const state = createGame({ seed: 'setup', playerCount: 2 });
    const district = state.players[0]!.objectiveOptions[0]!;
    expect(
      applyCommand(state, { type: 'chooseObjectives', districts: [district, district] }).error,
    ).toBeTruthy();
    expect(applyCommand(state, { type: 'pass' }).error).toBeTruthy();
    const next = accept(state, getLegalCommands(getObservation(state, 0))[0]!);
    expect(next.activePlayer).toBe(1);
    expect(next.phase).toBe('setup');
  });
  it('treats open wild as the entire draw and blind wild as one pick', () => {
    let state = ready();
    moveCardToMarket(state, 'wild', 0);
    state = accept(state, { type: 'draw', source: 0 });
    expect(state.phase).toBe('orders');
    expect(state.players[0]!.hand).toHaveLength(6);
    invariant(state);
    state = ready();
    const wild = state.deck.findIndex((card) => card.color === 'wild');
    [state.deck[0], state.deck[wild]] = [state.deck[wild]!, state.deck[0]!];
    moveCardToMarket(state, 'wild', 0);
    state = accept(state, { type: 'draw', source: 'deck' });
    expect(state.phase).toBe('draw');
    const rejected = applyCommand(state, { type: 'draw', source: 0 });
    expect(rejected.error).toBeTruthy();
    expect(rejected.state).toBe(state);
    state = accept(state, { type: 'draw', source: 'deck' });
    expect(state.phase).toBe('orders');
    expect(state.players[0]!.hand).toHaveLength(7);
    invariant(state);
  });
  it('preserves an unfinished draw across serialization and forces discards above ten', () => {
    let state = ready();
    state.players[0]!.hand.push(...state.deck.splice(0, 5));
    state = accept(state, { type: 'draw', source: 'deck' });
    expect(state.phase).toBe('draw');
    expect(state.drawsRemaining).toBe(1);
    state = JSON.parse(JSON.stringify(state)) as GameState;
    state = accept(state, { type: 'draw', source: 'deck' });
    expect(state.phase).toBe('discard');
    expect(state.players[0]!.hand).toHaveLength(12);
    expect(applyCommand(state, { type: 'endTurn' }).error).toBeTruthy();
    state = accept(state, { type: 'discard', cardId: state.players[0]!.hand[0]!.id });
    expect(state.phase).toBe('discard');
    state = accept(state, { type: 'discard', cardId: state.players[0]!.hand[0]!.id });
    expect(state.phase).toBe('orders');
    invariant(state);
  });
  it('finishes a lone legal market draw when deck and discard are exhausted', () => {
    let state = ready();
    state.players[1]!.hand.push(...state.deck, ...state.market.slice(1));
    state.deck = [];
    state.market = state.market.slice(0, 1);
    state.discard = [];
    state = accept(state, { type: 'draw', source: 0 });
    expect(state.phase).toBe('orders');
    invariant(state);
  });
});

describe('routing, movement, flood and scoring', () => {
  it('delivers the first two groups without repair and stops after loading even with express', () => {
    let state = ready();
    const train = state.trains[0]!;
    const order: TrainOrder = {
      mode: 'evacuate',
      destination: 'ridge',
      returnTo: 'hill',
      repeat: false,
    };
    expect(previewOrder(state, train, order)).toMatchObject({
      pickupRound: 1,
      deliveryRound: 2,
      safe: true,
    });
    train.order = order;
    train.expressRound = 1;
    state = endRound(state);
    expect(state.trains[0]!.stationId).toBe('ridge');
    expect(state.trains[0]!.cargo).toHaveLength(2);
    expect(state.players[0]!.delivered).toHaveLength(0);
    state = endRound(state);
    expect(state.trains[0]!.stationId).toBe('hill');
    expect(state.players[0]!.delivered).toHaveLength(2);
    expect(state.players[0]!.score).toBeGreaterThanOrEqual(4);
    invariant(state);
  });
  it('uses initiative for simultaneous pickup and sends the empty second train back next round', () => {
    let state = ready();
    for (const train of state.trains.filter((train) => train.id.endsWith('t1')))
      train.order = { mode: 'evacuate', destination: 'ridge', returnTo: 'hill', repeat: false };
    state = endRound(state);
    expect(state.trains[0]!.cargo).toHaveLength(2);
    expect(state.trains[2]!.cargo).toHaveLength(0);
    expect(state.trains[2]!.order.mode).toBe('return');
    expect(state.trains[2]!.stationId).toBe('ridge');
    state = endRound(state);
    expect(state.trains[2]!.stationId).toBe('hill');
    expect(state.trains[2]!.order.mode).toBe('idle');
    invariant(state);
  });
  it('warns about loading during the flood round and permanently loses that train', () => {
    let state = ready();
    state.round = 6;
    const train = state.trains[0]!;
    train.expressRound = 6;
    const order: TrainOrder = {
      mode: 'evacuate',
      destination: 'pier',
      returnTo: 'hill',
      repeat: false,
    };
    expect(previewOrder(state, train, order)).toMatchObject({
      pickupRound: 6,
      deliveryRound: 8,
      safe: false,
    });
    state = accept(state, { type: 'pass' });
    expect(applyCommand(state, { type: 'order', trainId: train.id, order }).error).toContain(
      'опасен',
    );
    state = accept(state, {
      type: 'order',
      trainId: train.id,
      order: { ...order, confirmRisk: true },
    });
    state = endRound(state);
    expect(state.trains[0]!.disabled).toBe(true);
    expect(state.trains[0]!.stationId).toBe('pier');
    expect(state.trains[0]!.cargo).toHaveLength(0);
    expect(state.lostGroups.some((group) => group.id === 'pier-g1')).toBe(true);
    invariant(state);
  });
  it('lets a loaded train depart in the closing round and credits another brigade once', () => {
    let state = ready();
    state.round = 6;
    const train = state.trains[2]!;
    train.stationId = 'pier';
    const source = state.stations.find((station) => station.id === 'pier')!;
    train.cargo = source.groups.splice(0, 2);
    train.order = { mode: 'evacuate', destination: 'pier', returnTo: 'hill', repeat: false };
    const edge = state.edges.find((edge) => edge.id === 'market-pier')!;
    edge.builder = 0;
    edge.initialOpen = false;
    state = endRound(state);
    expect(state.trains[2]!.stationId).toBe('market');
    expect(state.trains[2]!.disabled).toBe(false);
    expect(state.players[0]!.repairScore).toBe(0);
    state = endRound(state);
    expect(state.players[1]!.delivered).toHaveLength(2);
    expect(state.players[0]!.repairScore).toBe(1);
    expect(state.edges.find((item) => item.id === edge.id)!.credited).toBe(true);
    invariant(state);
  });
  it('safe routing avoids a closing low node through a high bypass', () => {
    const state = ready();
    state.round = 8;
    state.edges.forEach((edge) => {
      edge.open = [
        'hill-market',
        'market-square',
        'hill-orchard',
        'orchard-bridge',
        'square-bridge',
      ].includes(edge.id);
    });
    const train = state.trains[0]!;
    const preview = previewOrder(state, train, {
      mode: 'position',
      destination: 'bridge',
      returnTo: null,
      repeat: false,
    });
    expect(preview.safe).toBe(true);
    expect(preview.path).toEqual(['hill', 'orchard', 'bridge']);
  });
  it('does not grant repair points before successful cargo delivery', () => {
    let state = ready();
    const hand = state.players[0]!.hand;
    state.deck.push(...hand);
    state.players[0]!.hand = [];
    for (let index = 0; index < 2; index++) {
      const cardIndex = state.deck.findIndex((card) => card.color === 'green');
      state.players[0]!.hand.push(state.deck.splice(cardIndex, 1)[0]!);
    }
    state = accept(state, { type: 'repair', edgeId: 'hill-orchard' });
    expect(state.players[0]!.repairScore).toBe(0);
    state = accept(state, {
      type: 'order',
      trainId: state.trains[0]!.id,
      order: { mode: 'evacuate', destination: 'orchard', returnTo: 'hill', repeat: false },
    });
    state = endRound(state);
    expect(state.players[0]!.repairScore).toBe(0);
    state = endRound(state);
    expect(state.players[0]!.repairScore).toBe(1);
    invariant(state);
  });
  it('automatically cancels repeat if its next complete trip misses a deadline', () => {
    let state = ready();
    state.round = 4;
    const train = state.trains[0]!;
    train.stationId = 'market';
    const pier = state.stations.find((station) => station.id === 'pier')!;
    train.cargo = pier.groups.splice(0, 1);
    train.order = { mode: 'evacuate', destination: 'pier', returnTo: 'hill', repeat: true };
    state = endRound(state);
    expect(state.trains[0]!.stationId).toBe('hill');
    expect(state.trains[0]!.order.mode).toBe('idle');
    invariant(state);
  });
  it.each([2, 3, 4] as const)(
    'terminates all-pass %i-player games and conserves all cards/groups',
    (playerCount) => {
      let state = ready(`pass-${playerCount}`, playerCount);
      invariant(state);
      let commands = 0;
      while (state.phase !== 'finished') {
        state = accept(state, { type: state.phase === 'action' ? 'pass' : 'endTurn' });
        invariant(state);
        commands++;
        expect(commands).toBeLessThanOrEqual(96);
      }
      expect(state.round).toBe(12);
      const result = getGameResult(state);
      expect(result.saved).toBe(0);
      expect(result.lost).toBe(state.totalGroups);
      expect(result.standings.some((standing) => standing.winner)).toBe(false);
    },
  );
  it('replays accepted commands deterministically', () => {
    const commands: GameCommand[] = [];
    let state = createGame({ seed: 'replay', playerCount: 3 });
    while (state.phase !== 'finished') {
      const legal = getLegalCommands(getObservation(state, state.activePlayer));
      const command =
        legal.find((command) => command.type === 'endTurn') ??
        legal.find((command) => command.type === 'draw' && command.source === 'deck') ??
        legal[0]!;
      commands.push(command);
      state = accept(state, command);
      invariant(state);
      expect(commands.length).toBeLessThan(250);
    }
    const replay = commands.reduce(
      (current, command) => accept(current, command),
      createGame({ seed: 'replay', playerCount: 3 }),
    );
    expect(replay).toEqual(state);
  });
});

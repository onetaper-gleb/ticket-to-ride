import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, getLegalCommands, getObservation } from '../core';
import { getTutorialInputPolicy, getTutorialLesson, tutorialCommandAllowed } from './tutorial';
import type { GameCommand, GameState, Observation } from '../shared/types';

function accept(state: GameState, command: GameCommand): GameState {
  const transition = applyCommand(state, command);
  expect(transition.error).toBeUndefined();
  return transition.state;
}

function readyGame(): GameState {
  let state = createGame({ seed: 'europe-first-route-v1', playerCount: 2 });
  while (state.phase === 'setup') {
    const command = getLegalCommands(getObservation(state, state.activePlayer))[0]!;
    state = accept(state, command);
  }
  return state;
}

function finishBotDraw(state: GameState): GameState {
  expect(state.activePlayer).toBe(1);
  state = accept(state, { type: 'draw', source: 'deck' });
  return accept(state, { type: 'draw', source: 'deck' });
}

function observation(patch: Partial<Observation> = {}): Observation {
  return {
    schemaVersion: 2,
    rulesVersion: 'europe-classic',
    revision: 1,
    turn: 1,
    round: 1,
    playerCount: 2,
    activePlayer: 0,
    phase: 'setup',
    drawsRemaining: 0,
    cities: [
      { id: 'a', name: 'Париж', x: 0, z: 0 },
      { id: 'b', name: 'Берлин', x: 1, z: 1 },
    ],
    edges: [
      {
        id: 'a-b',
        a: 'a',
        b: 'b',
        color: 'red',
        length: 2,
        tunnel: false,
        ferries: 0,
        parallel: null,
        owner: null,
      },
    ],
    players: [
      {
        id: 0,
        name: 'Вы',
        color: '#fff',
        handCount: 0,
        ticketCount: 0,
        trainsRemaining: 45,
        stationsRemaining: 3,
        stations: [],
        score: 0,
      },
      {
        id: 1,
        name: 'Бот',
        color: '#000',
        handCount: 4,
        ticketCount: 2,
        trainsRemaining: 45,
        stationsRemaining: 3,
        stations: [],
        score: 0,
      },
    ],
    self: {
      id: 0,
      name: 'Вы',
      color: '#fff',
      hand: [],
      tickets: [],
      ticketOptions: [{ id: 't1', a: 'a', b: 'b', points: 8, long: false }],
      trainsRemaining: 45,
      stationsRemaining: 3,
      stations: [],
      score: 0,
    },
    market: [],
    deckCount: 20,
    discardCount: 0,
    ticketDeckCount: 20,
    pendingTunnel: null,
    finalTurnsRemaining: null,
    finalRoundTrigger: null,
    events: [],
    ...patch,
  };
}

describe('Europe tutorial', () => {
  it('explains starting tickets and preserves the mandatory second draw', () => {
    expect(getTutorialLesson(observation()).id).toBe('choose-starting-tickets');
    const drawing = observation({ phase: 'draw', drawsRemaining: 1 });
    expect(getTutorialLesson(drawing).id).toBe('second-train-card');
    expect(getTutorialLesson(drawing).complete).toBe(false);
    expect(getTutorialLesson(drawing).action).toContain('вторую');
  });
  it('finishes only when the accepted board contains a route owned by the player', () => {
    const state = observation({ phase: 'action' });
    expect(getTutorialLesson(state).complete).toBe(false);
    const otherRoute = { ...state, edges: [{ ...state.edges[0]!, owner: 1 }] };
    expect(getTutorialLesson(otherRoute).complete).toBe(false);
    const acceptedRoute = { ...state, edges: [{ ...state.edges[0]!, owner: 0 }] };
    expect(getTutorialLesson(acceptedRoute).complete).toBe(true);
    expect(getTutorialLesson(JSON.parse(JSON.stringify(acceptedRoute)) as Observation)).toEqual(
      getTutorialLesson(acceptedRoute),
    );
  });
  it('keeps a tunnel decision visible and never treats an unfinished attempt as a claimed route', () => {
    const state = observation({
      phase: 'tunnel',
      pendingTunnel: {
        edgeId: 'a-b',
        color: 'red',
        baseCards: [
          { id: 'r1', color: 'red' },
          { id: 'r2', color: 'red' },
        ],
        revealed: [
          { id: 'r3', color: 'red' },
          { id: 'b1', color: 'blue' },
          { id: 'w1', color: 'wild' },
        ],
        extraCost: 2,
      },
    });
    expect(getTutorialLesson(state).id).toBe('tunnel-surcharge');
    expect(getTutorialLesson(state).text).toContain('2');
    expect(getTutorialLesson(state).complete).toBe(false);
  });
  it('does not accept a player command while the opponent is active', () => {
    const state = observation({ activePlayer: 1 });
    expect(getTutorialLesson(state).id).toBe('waiting-setup');
    const commands: GameCommand[] = [
      { type: 'draw', source: 0 },
      { type: 'drawTickets' },
      { type: 'buildStation', cityId: 'a', cardIds: ['r1'] },
      { type: 'claim', edgeId: 'a-b', cardIds: ['r1', 'r2'] },
      { type: 'resolveTunnel', pay: false },
    ];
    for (const command of commands) expect(tutorialCommandAllowed(state, command)).toBe(false);
    expect(getTutorialLesson(observation({ phase: 'finished' })).complete).toBe(false);
  });

  it('requires one whole accepted draw even when the starting hand can claim a route', () => {
    const initial = readyGame();
    const before = getObservation(initial, 0);
    const claim = getLegalCommands(before).find((command) => command.type === 'claim')!;
    expect(claim).toBeDefined();
    expect(getTutorialLesson(before).id).toBe('collect-train-cards');
    expect(tutorialCommandAllowed(before, claim)).toBe(false);
    expect(tutorialCommandAllowed(before, { type: 'draw', source: 'deck' })).toBe(true);
    expect(tutorialCommandAllowed(before, { type: 'drawTickets' })).toBe(false);

    const first = accept(initial, { type: 'draw', source: 'deck' });
    const partial = getObservation(first, 0);
    expect(partial.self.hand.length).toBe(before.self.hand.length + 1);
    expect(getTutorialLesson(partial).id).toBe('second-train-card');
    expect(tutorialCommandAllowed(partial, claim)).toBe(false);
    expect(getTutorialLesson(JSON.parse(JSON.stringify(partial)) as Observation)).toEqual(
      getTutorialLesson(partial),
    );

    const second = accept(first, { type: 'draw', source: 'deck' });
    expect(second.players[0]!.hand.length).toBe(before.self.hand.length + 2);
    const nextTurn = getObservation(finishBotDraw(second), 0);
    expect(getTutorialLesson(nextTurn).id).toBe('claim-first-route');
    expect(tutorialCommandAllowed(nextTurn, claim)).toBe(true);
    expect(tutorialCommandAllowed(nextTurn, { type: 'draw', source: 'deck' })).toBe(false);
    expect(getTutorialLesson(JSON.parse(JSON.stringify(nextTurn)) as Observation)).toEqual(
      getTutorialLesson(nextTurn),
    );
  });

  it('counts an accepted open locomotive as a whole draw action', () => {
    const initial = readyGame();
    const wildIndex = initial.deck.findIndex((card) => card.color === 'wild');
    [initial.market[0], initial.deck[wildIndex]] = [initial.deck[wildIndex]!, initial.market[0]!];
    const first = accept(initial, { type: 'draw', source: 0 });
    expect(first.players[0]!.hand.length).toBe(initial.players[0]!.hand.length + 1);
    expect(first.activePlayer).toBe(1);
    const nextTurn = getObservation(finishBotDraw(first), 0);
    expect(getTutorialLesson(nextTurn).id).toBe('claim-first-route');
    expect(tutorialCommandAllowed(nextTurn, { type: 'draw', source: 'deck' })).toBe(false);
  });

  it('does not mistake an opponent draw or a rejected second locomotive for completed practice', () => {
    const initial = readyGame();
    const own = getObservation(initial, 0);
    own.events.push({ id: 100, turn: 0, kind: 'draw', playerId: 1, message: 'Карта' });
    expect(getTutorialLesson(own).id).toBe('collect-train-cards');

    const first = accept(initial, { type: 'draw', source: 'deck' });
    const wildIndex = first.deck.findIndex((card) => card.color === 'wild');
    [first.market[0], first.deck[wildIndex]] = [first.deck[wildIndex]!, first.market[0]!];
    const rejected = applyCommand(first, { type: 'draw', source: 0 });
    expect(rejected.error).toContain('локомотив');
    expect(rejected.state).toBe(first);
    expect(getTutorialLesson(getObservation(rejected.state, 0)).id).toBe('second-train-card');
  });

  it('allows extra draws only when the accepted hand cannot yet pay for any route', () => {
    let state = readyGame();
    state = accept(state, { type: 'draw', source: 'deck' });
    state = accept(state, { type: 'draw', source: 'deck' });
    const next = getObservation(finishBotDraw(state), 0);
    next.self.hand = [];
    expect(getLegalCommands(next).some((command) => command.type === 'claim')).toBe(false);
    expect(getTutorialLesson(next).id).toBe('collect-train-cards');
    expect(tutorialCommandAllowed(next, { type: 'draw', source: 'deck' })).toBe(true);
    expect(tutorialCommandAllowed(next, { type: 'drawTickets' })).toBe(false);
    expect(tutorialCommandAllowed(next, { type: 'buildStation', cityId: 'a', cardIds: [] })).toBe(
      false,
    );
  });

  it('keeps ticket and tunnel decisions mandatory, then releases teaching restrictions', () => {
    const tickets = observation();
    expect(tutorialCommandAllowed(tickets, { type: 'chooseTickets', ticketIds: ['t1'] })).toBe(
      true,
    );
    expect(tutorialCommandAllowed(tickets, { type: 'draw', source: 'deck' })).toBe(false);
    expect(
      tutorialCommandAllowed(observation({ phase: 'tickets' }), {
        type: 'chooseTickets',
        ticketIds: ['t1'],
      }),
    ).toBe(true);
    const tunnel = observation({ phase: 'tunnel' });
    expect(tutorialCommandAllowed(tunnel, { type: 'resolveTunnel', pay: false })).toBe(true);
    expect(tutorialCommandAllowed(tunnel, { type: 'draw', source: 'deck' })).toBe(false);

    const completed = { ...tunnel, edges: [{ ...tunnel.edges[0]!, owner: 0 }] };
    expect(tutorialCommandAllowed(completed, { type: 'drawTickets' })).toBe(true);
    expect(
      tutorialCommandAllowed(completed, { type: 'buildStation', cityId: 'a', cardIds: [] }),
    ).toBe(true);
  });

  it('limits seated focus and map access to the current accepted lesson', () => {
    expect(getTutorialInputPolicy(observation())).toEqual({
      allowedZones: ['goals', 'paper'],
      boardAllowed: true,
      returnZone: 'goals',
    });
    const initial = readyGame();
    const before = getObservation(initial, 0);
    expect(getTutorialInputPolicy(before)).toEqual({
      allowedZones: ['deck', 'paper'],
      boardAllowed: false,
      returnZone: 'deck',
    });
    expect(getTutorialInputPolicy(observation({ phase: 'draw' })).boardAllowed).toBe(false);
    expect(getTutorialInputPolicy(observation({ phase: 'tunnel' }))).toEqual({
      allowedZones: ['paper', 'hand'],
      boardAllowed: false,
      returnZone: 'paper',
    });
    let drawn = accept(initial, { type: 'draw', source: 'deck' });
    drawn = accept(drawn, { type: 'draw', source: 'deck' });
    const route = getObservation(finishBotDraw(drawn), 0);
    expect(getTutorialInputPolicy(route)).toEqual({
      allowedZones: ['neutral', 'paper', 'hand'],
      boardAllowed: true,
      returnZone: 'paper',
    });
    const completed = { ...route, edges: [{ ...route.edges[0]!, owner: 0 }] };
    expect(getTutorialInputPolicy(completed).allowedZones).toContain('dock');
    expect(getTutorialInputPolicy(completed).allowedZones).toContain('deck');
  });
});

import { describe, expect, it } from 'vitest';
import { getTutorialLesson, tutorialCommandAllowed } from './tutorial';
import type { GameCommand, Observation } from '../shared/types';

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
  it('teaches the current accepted phase without adding tutorial rules', () => {
    const state = observation({ activePlayer: 1 });
    expect(getTutorialLesson(state).id).toBe('waiting-setup');
    const commands: GameCommand[] = [
      { type: 'draw', source: 0 },
      { type: 'drawTickets' },
      { type: 'buildStation', cityId: 'a', cardIds: ['r1'] },
      { type: 'claim', edgeId: 'a-b', cardIds: ['r1', 'r2'] },
      { type: 'resolveTunnel', pay: false },
    ];
    for (const command of commands) expect(tutorialCommandAllowed(state, command)).toBe(true);
    expect(getTutorialLesson(observation({ phase: 'finished' })).complete).toBe(false);
  });
});

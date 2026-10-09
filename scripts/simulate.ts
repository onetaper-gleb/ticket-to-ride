import { performance } from 'node:perf_hooks';
import {
  applyCommand,
  createGame,
  getGameResult,
  getLegalCommands,
  getObservation,
} from '../src/core';
import { chooseBotCommand } from '../src/bots';
import { COLORS, ROUTE_POINTS } from '../src/data/europe';
import type { BotDifficulty, GameState } from '../src/shared/types';

function assertInvariants(state: GameState): void {
  const cards = [
    ...state.deck,
    ...state.discard,
    ...state.market,
    ...state.players.flatMap((player) => player.hand),
    ...(state.pendingTunnel?.baseCards ?? []),
    ...(state.pendingTunnel?.revealed ?? []),
  ];
  if (cards.length !== 110 || new Set(cards.map((card) => card.id)).size !== 110)
    throw new Error('110-card conservation violated');
  for (const color of COLORS)
    if (cards.filter((card) => card.color === color).length !== 12)
      throw new Error(`12-${color} conservation violated`);
  if (cards.filter((card) => card.color === 'wild').length !== 14)
    throw new Error('14-locomotive conservation violated');
  const tickets = [
    ...state.ticketDeck,
    ...state.unusedTickets,
    ...state.players.flatMap((player) => [...player.tickets, ...player.ticketOptions]),
  ];
  if (tickets.length !== 46 || new Set(tickets.map((ticket) => ticket.id)).size !== 46)
    throw new Error('46-ticket conservation violated');
  for (const player of state.players) {
    const tracks = state.edges.filter((edge) => edge.owner === player.id);
    const length = tracks.reduce((n, edge) => n + edge.length, 0);
    if (player.trainsRemaining < 0 || player.trainsRemaining + length !== 45)
      throw new Error('45-train conservation violated');
    if (player.stationsRemaining < 0 || player.stationsRemaining + player.stations.length !== 3)
      throw new Error('3-station conservation violated');
    const score = tracks.reduce((n, edge) => n + ROUTE_POINTS[edge.length]!, 0);
    if (player.score !== score) throw new Error('Route score formula violated');
  }
  const stations = state.players.flatMap((player) => player.stations);
  if (new Set(stations).size !== stations.length) throw new Error('Duplicate city station');
  for (const edge of state.edges)
    if (edge.parallel && edge.owner !== null) {
      const parallel = state.edges.filter(
        (other) => other.parallel === edge.parallel && other.owner !== null,
      );
      if (
        new Set(parallel.map((other) => other.owner)).size !== parallel.length ||
        (state.playerCount <= 3 && parallel.length > 1)
      )
        throw new Error('Double-route rule violated');
    }
  if (state.phase === 'draw' && state.drawsRemaining !== 1)
    throw new Error('Partial draw phase lost');
  if ((state.phase === 'tunnel') !== !!state.pendingTunnel)
    throw new Error('Pending tunnel phase mismatch');
}
function argument(name: string, fallback: string): string {
  const equals = process.argv.find((item) => item.startsWith(`--${name}=`));
  const index = process.argv.indexOf(`--${name}`);
  return equals ? equals.slice(name.length + 3) : index >= 0 ? process.argv[index + 1]! : fallback;
}
const count = Number(argument('count', '25'));
if (!Number.isInteger(count) || count < 1) throw new Error('Use --count=<positive integer>');
const selected = argument('players', 'all');
const playerCounts = selected === 'all' ? [2, 3, 4, 5] : [Number(selected)];
if (playerCounts.some((players) => ![2, 3, 4, 5].includes(players)))
  throw new Error('Use --players=2|3|4|5');
const policy = argument('difficulty', 'normal');
if (!['easy', 'normal', 'mixed'].includes(policy))
  throw new Error('Use --difficulty=easy|normal|mixed');
const started = performance.now();
const reports = [];
for (const playerCount of playerCounts as (2 | 3 | 4 | 5)[]) {
  const wins = Array(playerCount).fill(0) as number[],
    scores = Array(playerCount).fill(0) as number[],
    completed = Array(playerCount).fill(0) as number[];
  const byDifficulty = {
    easy: { appearances: 0, wins: 0, score: 0, tickets: 0 },
    normal: { appearances: 0, wins: 0, score: 0, tickets: 0 },
  };
  let totalCommands = 0,
    maxCommands = 0,
    maxTurns = 0,
    totalTurns = 0,
    botMs = 0,
    maxBotMs = 0,
    stationCount = 0,
    tunnelCount = 0;
  for (let i = 0; i < count; i++) {
    const difficulties: BotDifficulty[] = Array.from({ length: playerCount }, (_, seat) =>
      policy === 'mixed'
        ? seat === i % playerCount
          ? 'normal'
          : 'easy'
        : (policy as BotDifficulty),
    );
    let state = createGame({ playerCount, seed: `europe-validation-${playerCount}-${i}` });
    let commands = 0;
    assertInvariants(state);
    while (state.phase !== 'finished') {
      if (++commands >= 1500)
        throw new Error(`Unfinished match: ${state.seed} turn ${state.turn} ${state.phase}`);
      const observation = getObservation(state, state.activePlayer),
        before = performance.now();
      const command = chooseBotCommand(observation, difficulties[state.activePlayer]!);
      const elapsed = performance.now() - before;
      botMs += elapsed;
      maxBotMs = Math.max(maxBotMs, elapsed);
      if (
        !getLegalCommands(observation).some(
          (legal) => JSON.stringify(legal) === JSON.stringify(command),
        )
      )
        throw new Error(`Bot bypassed legal authority: ${JSON.stringify(command)}`);
      const transition = applyCommand(state, command);
      if (transition.error)
        throw new Error(
          `Illegal bot command: ${state.seed} turn ${state.turn} ${state.phase} ${JSON.stringify(command)}: ${transition.error}`,
        );
      if (transition.state.revision !== state.revision + 1) throw new Error('Revision mismatch');
      state = transition.state;
      assertInvariants(state);
    }
    const result = getGameResult(state);
    for (const standing of result.standings) {
      const seat = standing.playerId;
      scores[seat] += standing.score;
      completed[seat] += standing.completedTickets;
      const bucket = byDifficulty[difficulties[seat]!];
      bucket.appearances++;
      bucket.score += standing.score;
      bucket.tickets += standing.completedTickets;
      if (standing.winner) {
        wins[seat]++;
        bucket.wins++;
      }
    }
    totalCommands += commands;
    maxCommands = Math.max(maxCommands, commands);
    totalTurns += state.turn;
    maxTurns = Math.max(maxTurns, state.turn);
    stationCount += state.players.reduce((n, player) => n + player.stations.length, 0);
    tunnelCount += state.edges.filter((edge) => edge.tunnel && edge.owner !== null).length;
  }
  const report = {
    playerCount,
    matches: count,
    difficulty: policy,
    meanCommands: totalCommands / count,
    maxCommands,
    meanTurns: totalTurns / count,
    maxTurns,
    meanBotMs: botMs / totalCommands,
    maxBotMs,
    meanScores: scores.map((score) => score / count),
    meanCompletedTickets: completed.map((tickets) => tickets / count),
    wins,
    meanStations: stationCount / count,
    meanClaimedTunnels: tunnelCount / count,
    byDifficulty: Object.fromEntries(
      Object.entries(byDifficulty)
        .filter(([, value]) => value.appearances)
        .map(([difficulty, value]) => [
          difficulty,
          {
            appearances: value.appearances,
            wins: value.wins,
            meanScore: value.score / value.appearances,
            meanCompletedTickets: value.tickets / value.appearances,
          },
        ]),
    ),
  };
  reports.push(report);
  console.log(JSON.stringify(report));
}
console.log(
  JSON.stringify({
    matches: count * playerCounts.length,
    elapsedSeconds: (performance.now() - started) / 1000,
    invariantChecks: [
      '110 unique train cards (12 each color +14 locomotives)',
      '46 unique tickets including retired setup tickets',
      '45 trains per player',
      '3 stations per player and one per city',
      'route score formula',
      'double-route restrictions',
      'pending draw and tunnel phase consistency',
      'legal commands from public observation only',
      'revision +1',
      'finite complete matches below1500commands',
    ],
    reports,
  }),
);

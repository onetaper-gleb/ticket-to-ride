import { performance } from 'node:perf_hooks';
import { createGame, applyCommand, getObservation, getGameResult } from '../src/core/index';
import { chooseBotCommand } from '../src/bots/index';
import type { GameState } from '../src/shared/types';

function assertInvariants(state: GameState): void {
  const cards = [
    ...state.deck,
    ...state.discard,
    ...state.market,
    ...state.players.flatMap((player) => player.hand),
  ];
  if (cards.length !== 64 || new Set(cards.map((card) => card.id)).size !== 64)
    throw new Error('Card conservation violated');
  const groups = [
    ...state.stations.flatMap((station) => station.groups),
    ...state.trains.flatMap((train) => train.cargo),
    ...state.players.flatMap((player) => player.delivered),
    ...state.lostGroups,
  ];
  if (
    groups.length !== state.totalGroups ||
    new Set(groups.map((group) => group.id)).size !== state.totalGroups
  )
    throw new Error('Group conservation violated');
  for (const player of state.players) {
    const credits = state.edges.filter(
      (edge) => edge.credited && edge.builder === player.id,
    ).length;
    if (player.repairScore !== Math.min(4, credits))
      throw new Error(`Repair credit mismatch for player ${player.id}`);
    const objectiveScore =
      player.objectives.filter(
        (district) => player.delivered.filter((group) => group.district === district).length >= 2,
      ).length * 3;
    const expected =
      player.delivered.reduce((total, group) => total + (group.priority ? 3 : 2), 0) +
      objectiveScore +
      player.repairScore;
    if (player.score !== expected)
      throw new Error(`Score mismatch for player ${player.id}: ${player.score} vs ${expected}`);
    if (player.hand.length > 10 && state.phase !== 'discard')
      throw new Error('Hand limit violated outside discard phase');
  }
  for (const train of state.trains)
    if (train.cargo.length > 2) throw new Error('Train capacity exceeded');
}
const countArgument = process.argv.find((argument) => argument.startsWith('--count='));
const countIndex = process.argv.indexOf('--count');
const count = countArgument
  ? Number(countArgument.split('=')[1])
  : countIndex >= 0
    ? Number(process.argv[countIndex + 1])
    : 25;
if (!Number.isInteger(count) || count < 1) throw new Error('Use --count=<positive integer>');
const started = performance.now();
const reports = [];
const playersArgument = process.argv.find((argument) => argument.startsWith('--players='));
const playerCounts = playersArgument ? [Number(playersArgument.split('=')[1])] : [2, 3, 4];
if (playerCounts.some((players) => ![2, 3, 4].includes(players)))
  throw new Error('Use --players=2|3|4');
for (const playerCount of playerCounts as (2 | 3 | 4)[]) {
  let saved = 0,
    lost = 0,
    repairs = 0,
    credited = 0,
    totalCommands = 0,
    maxCommands = 0,
    botMs = 0,
    maxBotMs = 0;
  const wins = Array.from({ length: playerCount }, () => 0),
    scores = Array.from({ length: playerCount }, () => 0);
  for (let index = 0; index < count; index++) {
    let state = createGame({ playerCount, seed: `validation-${playerCount}-${index}` });
    assertInvariants(state);
    let commands = 0;
    while (state.phase !== 'finished') {
      if (commands++ >= 1000)
        throw new Error(
          `Match failed to terminate: ${state.seed}, round ${state.round}, phase ${state.phase}`,
        );
      const observation = getObservation(state, state.activePlayer);
      const before = performance.now();
      const command = chooseBotCommand(observation, 'normal');
      const elapsed = performance.now() - before;
      botMs += elapsed;
      maxBotMs = Math.max(maxBotMs, elapsed);
      const transition = applyCommand(state, command);
      if (transition.error)
        throw new Error(
          `Illegal bot command: ${state.seed}, round ${state.round}, phase ${state.phase}, ${JSON.stringify(command)}: ${transition.error}`,
        );
      if (transition.state.revision <= state.revision)
        throw new Error('Accepted command did not advance revision');
      state = transition.state;
      assertInvariants(state);
    }
    const result = getGameResult(state);
    saved += result.saved;
    lost += result.lost;
    repairs += state.edges.filter((edge) => edge.builder !== null).length;
    credited += state.edges.filter((edge) => edge.credited).length;
    for (const standing of result.standings) {
      scores[standing.playerId] += standing.score;
      if (standing.winner) wins[standing.playerId]++;
    }
    totalCommands += commands;
    maxCommands = Math.max(maxCommands, commands);
  }
  const report = {
    playerCount,
    matches: count,
    meanSaved: saved / count,
    meanLost: lost / count,
    meanRepairs: repairs / count,
    usefulRepairRate: repairs ? credited / repairs : 0,
    meanCommands: totalCommands / count,
    maxCommands,
    meanBotMs: botMs / totalCommands,
    maxBotMs,
    meanScores: scores.map((score) => score / count),
    wins,
  };
  reports.push(report);
  console.log(JSON.stringify(report));
}
console.log(
  JSON.stringify({
    matches: count * playerCounts.length,
    elapsedSeconds: (performance.now() - started) / 1000,
    invariantChecks: [
      '64 unique cards',
      'all groups conserved and unique',
      'score formula',
      'construction credit capped',
      'capacity <= 2',
      'no illegal bot commands',
      'finite complete matches',
    ],
    reports,
  }),
);

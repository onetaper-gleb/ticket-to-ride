import { randomBytes, randomInt } from 'node:crypto';
import { applyCommand, createGame } from '../src/core';
import type { GameCommand, GameState } from '../src/shared/types';
import type { SeatCount } from '../src/network/protocol';

export function cryptoShuffle<T>(input: readonly T[]): T[] {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i--) {
    const other = randomInt(i + 1);
    [result[i], result[other]] = [result[other]!, result[i]!];
  }
  return result;
}
export function createPrivateGame(seats: SeatCount, names: string[]): GameState {
  const state = createGame(
    { playerCount: seats, seed: randomBytes(32).toString('hex') },
    { shuffle: cryptoShuffle },
  );
  for (const player of state.players) player.name = names[player.id]!;
  return state;
}
export function applyPrivateCommand(input: GameState, command: GameCommand) {
  return applyCommand(input, command, { shuffle: cryptoShuffle });
}

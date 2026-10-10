/** Trusted caller supplies a new permutation; the callback is never stored in GameState. */
export interface CoreRandomness {
  shuffle<T>(items: readonly T[]): T[];
}

export function hashSeed(seed: string): number {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0 || 1;
}

export function random(state: { rng: number }): number {
  let x = state.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}

export function shuffle<T>(
  items: readonly T[],
  state: { rng: number },
  randomness?: CoreRandomness,
): T[] {
  if (randomness) return randomness.shuffle([...items]);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random(state) * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

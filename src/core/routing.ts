import type { Edge, PublicBoard, Ticket, TicketProgress } from '../shared/types';

function connected(edges: Edge[], start: string, end: string): boolean {
  const seen = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const city = queue[i]!;
    if (city === end) return true;
    for (const edge of edges) {
      const next = edge.a === city ? edge.b : edge.b === city ? edge.a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** One shared station assignment serves every ticket, including during previews. */
export function getTicketProgress(
  board: PublicBoard,
  playerId: number,
  tickets: Ticket[],
): TicketProgress[] {
  const own = board.edges.filter((edge) => edge.owner === playerId);
  const stations = board.players.find((player) => player.id === playerId)?.stations ?? [];
  const choices = stations.map((city) => [
    null,
    ...board.edges.filter(
      (edge) =>
        edge.owner !== null && edge.owner !== playerId && (edge.a === city || edge.b === city),
    ),
  ]);
  let best: TicketProgress[] = [];
  let bestPoints = -Infinity;
  let bestCount = -1;
  function evaluate(index: number, borrowed: Edge[]): void {
    if (index < choices.length) {
      for (const edge of choices[index]!)
        evaluate(index + 1, edge ? [...borrowed, edge] : borrowed);
      return;
    }
    const ids = [...new Set(borrowed.map((edge) => edge.id))];
    const combined = [...own, ...borrowed];
    const progress = tickets.map((ticket) => ({
      ticket,
      complete: connected(combined, ticket.a, ticket.b),
      stationRoutes: ids,
    }));
    const points = progress.reduce(
      (total, item) => total + (item.complete ? item.ticket.points : -item.ticket.points),
      0,
    );
    const count = progress.filter((item) => item.complete).length;
    if (points > bestPoints || (points === bestPoints && count > bestCount)) {
      best = progress;
      bestPoints = points;
      bestCount = count;
    }
  }
  evaluate(0, []);
  return best;
}

/** Exact edge trail: loops and revisited cities are allowed, reused train cars are not. */
export function getLongestRouteLength(board: PublicBoard, playerId: number): number {
  const edges = board.edges.filter((edge) => edge.owner === playerId);
  if (!edges.length) return 0;
  const cities = [...new Set(edges.flatMap((edge) => [edge.a, edge.b]))];
  const adjacency = new Map(cities.map((city) => [city, [] as number[]]));
  edges.forEach((edge, i) => {
    adjacency.get(edge.a)!.push(i);
    adjacency.get(edge.b)!.push(i);
  });
  const memo = new Map<string, number>();
  function search(at: string, used: bigint): number {
    const key = `${at}:${used}`;
    const previous = memo.get(key);
    if (previous !== undefined) return previous;
    // An Euler trail consumes all reachable remaining edges; avoid enumerating its permutations.
    const reachable = new Set([at]);
    const queue = [at];
    const available = new Set<number>();
    for (let q = 0; q < queue.length; q++) {
      for (const i of adjacency.get(queue[q]!) ?? []) {
        if (used & (1n << BigInt(i))) continue;
        available.add(i);
        const edge = edges[i]!;
        const next = edge.a === queue[q] ? edge.b : edge.a;
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    const degrees = new Map<string, number>();
    let total = 0;
    for (const i of available) {
      const edge = edges[i]!;
      degrees.set(edge.a, (degrees.get(edge.a) ?? 0) + 1);
      degrees.set(edge.b, (degrees.get(edge.b) ?? 0) + 1);
      total += edge.length;
    }
    const odd = [...degrees].filter(([, degree]) => degree % 2).map(([city]) => city);
    if (odd.length === 0 || (odd.length === 2 && odd.includes(at))) {
      memo.set(key, total);
      return total;
    }
    let longest = 0;
    for (const i of adjacency.get(at) ?? []) {
      const bit = 1n << BigInt(i);
      if (used & bit) continue;
      const edge = edges[i]!;
      longest = Math.max(
        longest,
        edge.length + search(edge.a === at ? edge.b : edge.a, used | bit),
      );
      if (longest === total) break;
    }
    memo.set(key, longest);
    return longest;
  }
  return Math.max(...cities.map((city) => search(city, 0n)));
}

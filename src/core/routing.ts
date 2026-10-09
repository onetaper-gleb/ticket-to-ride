import type { PublicBoard, RoutePreview, Station, Train, TrainOrder } from '../shared/types';
import { LAST_ROUND } from '../data/scenario';

interface Journey {
  path: string[];
  arrival: number;
}
const remainsOpen = (station: Station, round: number) =>
  !station.flooded && (station.floodRound === null || station.floodRound > round);

/** Each state describes arrival during movement; two current-round steps may cross a closing intermediate node. */
function findJourney(
  board: PublicBoard,
  start: string,
  goal: string,
  round: number,
  budget: number,
  safe: boolean,
): Journey | null {
  const stations = new Map(board.stations.map((station) => [station.id, station]));
  const startStation = stations.get(start),
    goalStation = stations.get(goal);
  if (!startStation || !goalStation || startStation.flooded || goalStation.flooded) return null;
  if (start === goal)
    return !safe || (round <= LAST_ROUND && remainsOpen(goalStation, round))
      ? { path: [start], arrival: round }
      : null;
  const neighbors = new Map<string, string[]>();
  for (const edge of board.edges) {
    if (!edge.open || stations.get(edge.a)?.flooded || stations.get(edge.b)?.flooded) continue;
    neighbors.set(edge.a, [...(neighbors.get(edge.a) ?? []), edge.b]);
    neighbors.set(edge.b, [...(neighbors.get(edge.b) ?? []), edge.a]);
  }
  const queue = [{ at: start, round, used: 0, path: [start] }];
  const seen = new Set<string>([`${start}:${round}:0`]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    const currentBudget = current.round === round ? budget : 1;
    const moveRound = current.used < currentBudget ? current.round : current.round + 1;
    const used = moveRound === current.round ? current.used + 1 : 1;
    if (safe && moveRound > LAST_ROUND) continue;
    for (const next of neighbors.get(current.at) ?? []) {
      const station = stations.get(next)!;
      const path = [...current.path, next];
      const endOfMovement = used >= (moveRound === round ? budget : 1);
      if (safe && (next === goal || endOfMovement) && !remainsOpen(station, moveRound)) continue;
      // An intermediate node may already be under water in a future round even when another express step follows.
      if (safe && station.floodRound !== null && station.floodRound < moveRound) continue;
      if (next === goal) return { path, arrival: moveRound };
      const key = `${next}:${moveRound}:${used}`;
      if (!seen.has(key) && path.length <= board.stations.length + 2) {
        seen.add(key);
        queue.push({ at: next, round: moveRound, used, path });
      }
    }
  }
  return null;
}

export function orderTarget(train: Train, order = train.order): string | null {
  if (order.mode === 'idle') return null;
  if (train.cargo.length > 0 || order.mode === 'return') return order.returnTo ?? order.destination;
  return order.destination;
}

export function routeForTrain(
  board: PublicBoard,
  train: Train,
  order: TrainOrder,
  initialBudget = train.expressRound === board.round ? 2 : 1,
): RoutePreview {
  const unavailable: RoutePreview = {
    path: [],
    arrivalRound: null,
    pickupRound: null,
    deliveryRound: null,
    safe: false,
    reason: 'Путь пока закрыт — поезд ждёт ремонта.',
  };
  if (train.disabled)
    return { ...unavailable, reason: 'Поезд затоплен и больше не участвует в партии.' };
  const target = orderTarget(train, order);
  if (!target || order.mode === 'idle')
    return {
      path: [train.stationId],
      arrivalRound: null,
      pickupRound: null,
      deliveryRound: null,
      safe: true,
      reason: null,
    };
  const evacuation = train.cargo.length === 0 && order.mode === 'evacuate';
  function evaluate(safe: boolean): RoutePreview | null {
    const outbound = findJourney(board, train.stationId, target!, board.round, initialBudget, safe);
    if (!outbound) return null;
    if (!evacuation)
      return {
        path: outbound.path,
        arrivalRound: outbound.arrival,
        pickupRound: null,
        deliveryRound: train.cargo.length > 0 ? outbound.arrival : null,
        safe,
        reason: safe ? null : 'Поезд не успевает до закрытия станции или конца операции.',
      };
    const returnTo = order.returnTo;
    if (!returnTo) return null;
    // Loading is a service stop: departure occurs in the following round, even after express arrival.
    const inbound = findJourney(board, target!, returnTo, outbound.arrival + 1, 1, safe);
    if (!inbound) return null;
    return {
      path: [...outbound.path, ...inbound.path.slice(1)],
      arrivalRound: outbound.arrival,
      pickupRound: outbound.arrival,
      deliveryRound: inbound.arrival,
      safe,
      reason: safe ? null : 'Рейс опасен: погрузка или обратный путь пересекают срок закрытия.',
    };
  }
  return evaluate(true) ?? evaluate(false) ?? unavailable;
}

export function previewOrder(board: PublicBoard, train: Train, order: TrainOrder): RoutePreview {
  return routeForTrain(board, train, order);
}

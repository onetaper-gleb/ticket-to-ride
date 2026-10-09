import { getLegalCommands, previewOrder } from '../core';
import type {
  BotDifficulty,
  Card,
  District,
  Edge,
  GameCommand,
  Observation,
  PublicBoard,
  RoutePreview,
  Station,
  Train,
  TrainOrder,
} from '../shared/types';

interface Planning {
  routes: WeakMap<PublicBoard, Map<string, RoutePreview>>;
  plans: WeakMap<PublicBoard, Map<string, Plan | null>>;
}
interface Plan {
  order: TrainOrder;
  preview: RoutePreview;
  value: number;
  station: Station;
}
function cachedPreview(
  planning: Planning,
  board: PublicBoard,
  train: Train,
  order: TrainOrder,
): RoutePreview {
  let routes = planning.routes.get(board);
  if (!routes) {
    routes = new Map();
    planning.routes.set(board, routes);
  }
  const key = JSON.stringify([
    train.id,
    train.stationId,
    train.cargo.length,
    train.disabled,
    train.expressRound,
    order,
  ]);
  const known = routes.get(key);
  if (known) return known;
  const preview = previewOrder(board, train, order);
  routes.set(key, preview);
  return preview;
}
const ownTrains = (observation: Observation) =>
  observation.trains.filter((train) => train.playerId === observation.self.id && !train.disabled);
const shelters = (board: PublicBoard) =>
  board.stations.filter((station) => station.safe && !station.flooded);
const sameOrder = (a: TrainOrder, b: TrainOrder) =>
  a.mode === b.mode &&
  a.destination === b.destination &&
  a.returnTo === b.returnTo &&
  a.repeat === b.repeat;
const districtCount = (observation: Observation, district: District) =>
  observation.self.delivered.filter((group) => group.district === district).length;

function groupValue(observation: Observation, station: Station, count: number): number {
  const groups = [...station.groups]
    .sort((a, b) => Number(b.priority) - Number(a.priority) || a.id.localeCompare(b.id))
    .slice(0, count);
  const points = groups.reduce((total, group) => total + (group.priority ? 3 : 2), 0);
  const quest =
    station.district &&
    observation.self.objectives.includes(station.district) &&
    districtCount(observation, station.district) < 2;
  return (
    points + (quest ? Math.min(2 - districtCount(observation, station.district!), count) * 1.5 : 0)
  );
}

function competition(
  planning: Planning,
  observation: Observation,
  station: Station,
  train: Train,
  pickup: number,
): number {
  let reserved = 0;
  for (const other of observation.trains) {
    if (
      other.id === train.id ||
      other.disabled ||
      other.cargo.length ||
      other.order.mode !== 'evacuate' ||
      other.order.destination !== station.id
    )
      continue;
    const preview = cachedPreview(planning, observation, other, other.order);
    if (preview.pickupRound === null || !preview.safe) continue;
    if (other.playerId === train.playerId || preview.pickupRound < pickup) reserved += 2;
    else if (preview.pickupRound === pickup) reserved += 1;
  }
  return Math.max(0, Math.min(2, station.groups.length - reserved));
}

function bestPlan(
  planning: Planning,
  observation: Observation,
  train: Train,
  board: PublicBoard = observation,
  difficulty: BotDifficulty = 'normal',
): Plan | null {
  let plans = planning.plans.get(board);
  if (!plans) {
    plans = new Map();
    planning.plans.set(board, plans);
  }
  const key = `${train.id}:${train.expressRound}:${difficulty}`;
  if (plans.has(key)) return plans.get(key)!;
  let best: Plan | null = null;
  for (const station of board.stations) {
    if (!station.groups.length || station.flooded || station.safe) continue;
    for (const shelter of shelters(board)) {
      const order: TrainOrder = {
        mode: 'evacuate',
        destination: station.id,
        returnTo: shelter.id,
        repeat: true,
      };
      const preview = cachedPreview(planning, board, train, order);
      if (!preview.safe || preview.pickupRound === null || preview.deliveryRound === null) continue;
      const groups = competition(planning, observation, station, train, preview.pickupRound);
      if (!groups) continue;
      const duration = Math.max(1, preview.deliveryRound - observation.round + 1);
      const deadline = station.floodRound ?? 12;
      const urgency = difficulty === 'normal' ? 1 + (14 - deadline) / 4 : 1;
      let value = (groupValue(observation, station, groups) * urgency) / (1 + Math.sqrt(duration));
      if (sameOrder(train.order, order)) value *= 1.08;
      if (
        !best ||
        value > best.value + 0.0001 ||
        (Math.abs(value - best.value) < 0.0001 && station.id < best.station.id)
      )
        best = { order, preview, value, station };
    }
  }
  plans.set(key, best);
  return best;
}

function cargoReturn(
  planning: Planning,
  observation: Observation,
  train: Train,
): TrainOrder | null {
  let best: { order: TrainOrder; arrival: number } | null = null;
  for (const shelter of shelters(observation)) {
    const order: TrainOrder = {
      mode: 'return',
      destination: shelter.id,
      returnTo: shelter.id,
      repeat: false,
    };
    const preview = cachedPreview(planning, observation, train, order);
    if (!preview.safe || preview.deliveryRound === null) continue;
    if (
      !best ||
      preview.deliveryRound < best.arrival ||
      (preview.deliveryRound === best.arrival && train.order.returnTo === shelter.id)
    )
      best = { order, arrival: preview.deliveryRound };
  }
  return best?.order ?? null;
}

function ordersCommand(
  planning: Planning,
  observation: Observation,
  difficulty: BotDifficulty,
): GameCommand {
  for (const train of ownTrains(observation)) {
    if (train.cargo.length) {
      const safeReturn = cargoReturn(planning, observation, train);
      // Preserve evacuation/repeat metadata when the chosen refuge is already optimal.
      if (safeReturn && train.order.returnTo !== safeReturn.returnTo)
        return { type: 'order', trainId: train.id, order: safeReturn };
      continue;
    }
    const best = bestPlan(planning, observation, train, observation, difficulty);
    if (best && !sameOrder(train.order, best.order))
      return { type: 'order', trainId: train.id, order: best.order };
    if (!best && train.order.mode === 'evacuate') {
      const shelter = shelters(observation)
        .map((station) => ({
          station,
          preview: cachedPreview(planning, observation, train, {
            mode: 'position',
            destination: station.id,
            returnTo: station.id,
            repeat: false,
          }),
        }))
        .filter((candidate) => candidate.preview.safe && candidate.preview.arrivalRound !== null)
        .sort((a, b) => a.preview.arrivalRound! - b.preview.arrivalRound!)[0];
      if (shelter)
        return {
          type: 'order',
          trainId: train.id,
          order: {
            mode: 'position',
            destination: shelter.station.id,
            returnTo: shelter.station.id,
            repeat: false,
          },
        };
    }
  }
  return { type: 'endTurn' };
}

function cardValue(observation: Observation, card: Card): number {
  if (card.color === 'wild') return 10;
  let value = 0;
  for (const edge of observation.edges) {
    if (edge.open || edge.color !== card.color) continue;
    const a = observation.stations.find((station) => station.id === edge.a)!;
    const b = observation.stations.find((station) => station.id === edge.b)!;
    if (a.flooded || b.flooded) continue;
    const count = observation.self.hand.filter((item) => item.color === card.color).length;
    const relevant = [a, b].reduce(
      (sum, station) =>
        sum +
        (station.groups.length
          ? groupValue(observation, station, Math.min(2, station.groups.length))
          : 0),
      0,
    );
    value = Math.max(value, relevant / Math.max(1, edge.cost) + (count === edge.cost - 1 ? 2 : 0));
  }
  return (
    value + (observation.self.hand.filter((item) => item.color === card.color).length < 3 ? 0.5 : 0)
  );
}

function drawCommand(
  observation: Observation,
  legal: GameCommand[],
  difficulty: BotDifficulty,
): GameCommand | null {
  const draws = legal.filter(
    (command): command is Extract<GameCommand, { type: 'draw' }> => command.type === 'draw',
  );
  if (!draws.length) return null;
  if (difficulty === 'easy') return draws.find((command) => command.source === 'deck') ?? draws[0]!;
  return draws
    .map((command) => ({
      command,
      value:
        command.source === 'deck'
          ? 1.8
          : cardValue(observation, observation.market[command.source]!) *
            (observation.market[command.source]!.color === 'wild' ? 0.55 : 1),
    }))
    .sort(
      (a, b) =>
        b.value - a.value || String(a.command.source).localeCompare(String(b.command.source)),
    )[0]!.command;
}

function edgeRepairValue(
  planning: Planning,
  observation: Observation,
  edge: Edge,
  difficulty: BotDifficulty,
): number {
  const board: PublicBoard = {
    round: observation.round,
    stations: observation.stations,
    trains: observation.trains,
    edges: observation.edges.map((item) => (item.id === edge.id ? { ...item, open: true } : item)),
  };
  let gain = 0;
  for (const train of ownTrains(observation)) {
    if (train.cargo.length) {
      const oldPreview = cachedPreview(planning, observation, train, train.order),
        newPreview = cachedPreview(planning, board, train, train.order);
      if (newPreview.safe && newPreview.deliveryRound !== null)
        gain +=
          oldPreview.safe && oldPreview.deliveryRound !== null
            ? Math.max(0, oldPreview.deliveryRound - newPreview.deliveryRound) * 0.7
            : 6;
    } else {
      const oldPlan = bestPlan(planning, observation, train, observation, difficulty),
        newPlan = bestPlan(planning, observation, train, board, difficulty);
      gain += Math.max(0, (newPlan?.value ?? 0) - (oldPlan?.value ?? 0));
    }
  }
  return gain - edge.cost * 0.09;
}

function expressValue(
  planning: Planning,
  observation: Observation,
  train: Train,
  difficulty: BotDifficulty,
): number {
  const express = { ...train, expressRound: observation.round };
  if (train.cargo.length) {
    const current = cachedPreview(planning, observation, train, train.order),
      accelerated = cachedPreview(planning, observation, express, train.order);
    if (accelerated.safe && accelerated.deliveryRound !== null)
      return current.safe && current.deliveryRound !== null
        ? Math.max(0, current.deliveryRound - accelerated.deliveryRound) * 0.8
        : 7;
    return 0;
  }
  const current = bestPlan(planning, observation, train, observation, difficulty),
    accelerated = bestPlan(planning, observation, express, observation, difficulty);
  return Math.max(0, (accelerated?.value ?? 0) - (current?.value ?? 0));
}

/** Policy only reads the same public observation and own private hand as a human. */
export function chooseBotCommand(
  observation: Observation,
  difficulty: BotDifficulty = 'normal',
): GameCommand {
  const planning: Planning = { routes: new WeakMap(), plans: new WeakMap() };
  const legal = getLegalCommands(observation);
  if (!legal.length) return { type: 'pass' };
  if (observation.phase === 'setup') {
    const options = observation.self.objectiveOptions.map((district) => ({
      district,
      value: observation.stations
        .filter((station) => station.district === district)
        .reduce(
          (sum, station) =>
            sum + station.groups.length / Math.max(1, 14 - (station.floodRound ?? 12)),
          0,
        ),
    }));
    // Favor enduring district bonuses; evacuation deadlines are evaluated independently.
    options.sort((a, b) =>
      difficulty === 'normal' ? b.value - a.value : a.district.localeCompare(b.district),
    );
    return {
      type: 'chooseObjectives',
      districts: options.slice(0, 2).map((option) => option.district),
    };
  }
  if (observation.phase === 'orders') return ordersCommand(planning, observation, difficulty);
  if (observation.phase === 'discard')
    return (
      legal
        .filter(
          (command): command is Extract<GameCommand, { type: 'discard' }> =>
            command.type === 'discard',
        )
        .map((command) => ({
          command,
          value: cardValue(
            observation,
            observation.self.hand.find((card) => card.id === command.cardId)!,
          ),
        }))
        .sort((a, b) => a.value - b.value || a.command.cardId.localeCompare(b.command.cardId))[0]
        ?.command ?? legal[0]!
    );
  if (observation.phase === 'draw') return drawCommand(observation, legal, difficulty) ?? legal[0]!;
  if (observation.phase !== 'action') return legal[0]!;

  const alternatives: { command: GameCommand; value: number }[] = [];
  for (const command of legal) {
    if (command.type === 'repair') {
      const edge = observation.edges.find((item) => item.id === command.edgeId)!;
      alternatives.push({
        command,
        value: edgeRepairValue(planning, observation, edge, difficulty),
      });
    }
    if (command.type === 'express') {
      const train = observation.trains.find((item) => item.id === command.trainId)!;
      alternatives.push({
        command,
        value: expressValue(planning, observation, train, difficulty) - 0.05,
      });
    }
  }
  alternatives.sort(
    (a, b) =>
      b.value - a.value || JSON.stringify(a.command).localeCompare(JSON.stringify(b.command)),
  );
  const best = alternatives[0];
  const threshold = difficulty === 'normal' ? 0.42 : 0.7;
  if (best && best.value >= threshold) return best.command;
  if (observation.self.hand.length < 9)
    return drawCommand(observation, legal, difficulty) ?? legal[0]!;
  if (best && best.value > 0) return best.command;
  return legal.find((command) => command.type === 'pass') ?? legal[0]!;
}

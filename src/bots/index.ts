import { getLegalCommands, getTicketProgress, isRouteAvailable } from '../core';
import { COLORS, ROUTE_POINTS } from '../data/europe';
import type {
  BotDifficulty,
  CardColor,
  Edge,
  GameCommand,
  Observation,
  Ticket,
  TrainColor,
} from '../shared/types';

interface Plan {
  ticket: Ticket;
  edges: Edge[];
  cost: number;
  length: number;
}
interface Need {
  color: TrainColor;
  normal: number;
  wild: number;
}
const count = (observation: Observation, color: CardColor) =>
  observation.self.hand.filter((card) => card.color === color).length;

function need(observation: Observation, edge: Edge): Need {
  const color =
    edge.color === 'gray'
      ? [...COLORS].sort(
          (a, b) =>
            count(observation, b) - count(observation, a) || COLORS.indexOf(a) - COLORS.indexOf(b),
        )[0]!
      : edge.color;
  const wild = Math.max(0, edge.ferries - count(observation, 'wild'));
  const normal = Math.max(
    0,
    edge.length -
      Math.max(edge.ferries, Math.min(count(observation, 'wild'), edge.length)) -
      count(observation, color),
  );
  return { color, normal, wild };
}

/** Costs use public tracks and our own cards; no opponent hand or ticket enters the planner. */
function plan(observation: Observation, ticket: Ticket, difficulty: BotDifficulty): Plan | null {
  const borrowed = new Set(
    getTicketProgress(observation, observation.self.id, observation.self.tickets)[0]
      ?.stationRoutes ?? [],
  );
  const costs = new Map<string, number>([[ticket.a, 0]]);
  const paths = new Map<string, Edge[]>([[ticket.a, []]]);
  const visited = new Set<string>();
  for (;;) {
    let at: string | null = null;
    let distance = Infinity;
    for (const [city, cost] of costs)
      if (!visited.has(city) && cost < distance) {
        at = city;
        distance = cost;
      }
    if (!at) return null;
    if (at === ticket.b) {
      const edges = paths.get(at)!;
      return {
        ticket,
        edges,
        cost: distance,
        length: edges
          .filter((edge) => edge.owner !== observation.self.id && !borrowed.has(edge.id))
          .reduce((n, edge) => n + edge.length, 0),
      };
    }
    visited.add(at);
    for (const edge of observation.edges) {
      if (edge.a !== at && edge.b !== at) continue;
      const own = edge.owner === observation.self.id || borrowed.has(edge.id);
      if (!own && !isRouteAvailable(observation, edge.id)) continue;
      const next = edge.a === at ? edge.b : edge.a;
      const missing = own ? { normal: 0, wild: 0 } : need(observation, edge);
      const weight = own
        ? 0
        : edge.length +
          (difficulty === 'normal'
            ? missing.normal * 0.55 + missing.wild * 1.8 + (edge.tunnel ? 0.35 : 0)
            : 0);
      const cost = distance + weight;
      if (cost < (costs.get(next) ?? Infinity)) {
        costs.set(next, cost);
        paths.set(next, [...paths.get(at)!, edge]);
      }
    }
  }
}
function chooseTickets(
  observation: Observation,
  difficulty: BotDifficulty,
  legal: GameCommand[],
): GameCommand {
  const offered = observation.self.ticketOptions;
  if (difficulty === 'easy' && observation.phase === 'setup') {
    const ids = [...offered]
      .sort((a, b) => a.points - b.points)
      .slice(0, 2)
      .map((ticket) => ticket.id);
    return legal.find(
      (command) =>
        command.type === 'chooseTickets' &&
        command.ticketIds.length === ids.length &&
        ids.every((id) => command.ticketIds.includes(id)),
    )!;
  }
  const all = [...observation.self.tickets, ...offered];
  const progress = getTicketProgress(observation, observation.self.id, all);
  const complete = new Set(progress.filter((item) => item.complete).map((item) => item.ticket.id));
  const plans = new Map(
    offered.map((ticket) => [ticket.id, plan(observation, ticket, difficulty)]),
  );
  let best = legal[0]!;
  let bestScore = -Infinity;
  for (const command of legal) {
    if (command.type !== 'chooseTickets') continue;
    const selected = offered.filter((ticket) => command.ticketIds.includes(ticket.id));
    const union = new Map<string, Edge>();
    let reward = 0;
    let impossible = 0;
    for (const ticket of selected) {
      const path = plans.get(ticket.id);
      if (complete.has(ticket.id)) reward += ticket.points * 2.5;
      else {
        reward += ticket.points;
        if (!path || path.length > observation.self.trainsRemaining)
          impossible += ticket.points * 4 + 30;
        else
          for (const edge of path.edges)
            if (edge.owner !== observation.self.id) union.set(edge.id, edge);
      }
    }
    const cost = [...union.values()].reduce(
      (n, edge) => n + edge.length + edge.ferries * 0.8 + (edge.tunnel ? 0.2 : 0),
      0,
    );
    const score =
      reward -
      cost * (observation.phase === 'setup' ? 1.15 : 1.65) -
      impossible -
      Math.max(0, selected.length - (observation.phase === 'setup' ? 2 : 1)) * 2;
    if (score > bestScore) {
      best = command;
      bestScore = score;
    }
  }
  return best;
}

export function chooseBotCommand(
  observation: Observation,
  difficulty: BotDifficulty = 'normal',
): GameCommand {
  const legal = getLegalCommands(observation);
  if (!legal.length) throw new Error('У этого игрока сейчас нет хода.');
  if (observation.phase === 'setup' || observation.phase === 'tickets')
    return chooseTickets(observation, difficulty, legal);
  if (observation.phase === 'tunnel')
    return legal.find((command) => command.type === 'resolveTunnel' && command.pay) ?? legal[0]!;
  const progress = getTicketProgress(observation, observation.self.id, observation.self.tickets);
  const unfinished = progress.filter((item) => !item.complete).map((item) => item.ticket);
  const plans = unfinished
    .map((ticket) => plan(observation, ticket, difficulty))
    .filter((value): value is Plan => !!value && value.length <= observation.self.trainsRemaining);
  if (difficulty === 'easy') plans.splice(1);
  const importance = new Map<string, number>();
  const completion = new Map<string, number>();
  for (const path of plans) {
    const todo = path.edges.filter((edge) => edge.owner === null);
    for (const edge of todo)
      importance.set(
        edge.id,
        (importance.get(edge.id) ?? 0) + (path.ticket.points + 5) / Math.max(1, path.cost),
      );
    if (todo.length === 1)
      completion.set(todo[0]!.id, (completion.get(todo[0]!.id) ?? 0) + path.ticket.points * 2);
  }
  if (difficulty === 'normal' && observation.phase === 'action') {
    const currentScore = progress.reduce(
      (n, item) => n + (item.complete ? item.ticket.points : -item.ticket.points),
      0,
    );
    let bestStation: GameCommand | null = null;
    let bestGain = 4;
    const byCity = new Map<string, GameCommand>();
    for (const command of legal)
      if (command.type === 'buildStation' && !byCity.has(command.cityId))
        byCity.set(command.cityId, command);
    for (const [cityId, command] of byCity) {
      const adjacent = observation.edges.filter((edge) => edge.a === cityId || edge.b === cityId);
      if (!adjacent.some((edge) => edge.owner !== null && edge.owner !== observation.self.id))
        continue;
      if (
        !adjacent.some((edge) => edge.owner === observation.self.id) &&
        !unfinished.some((ticket) => ticket.a === cityId || ticket.b === cityId)
      )
        continue;
      const projected = {
        ...observation,
        players: observation.players.map((player) =>
          player.id === observation.self.id
            ? { ...player, stations: [...player.stations, cityId] }
            : player,
        ),
      };
      const future = getTicketProgress(projected, observation.self.id, observation.self.tickets);
      const score = future.reduce(
        (n, item) => n + (item.complete ? item.ticket.points : -item.ticket.points),
        0,
      );
      const gain = score - currentScore;
      if (gain > bestGain) {
        bestGain = gain;
        bestStation = command;
      }
    }
    if (bestStation) return bestStation;
  }
  const claims = legal.filter(
    (command): command is Extract<GameCommand, { type: 'claim' }> => command.type === 'claim',
  );
  let bestClaim: GameCommand | null = null;
  let bestClaimValue = -Infinity;
  const ourCities = new Set(
    observation.edges
      .filter((edge) => edge.owner === observation.self.id)
      .flatMap((edge) => [edge.a, edge.b]),
  );
  for (const command of claims) {
    const edge = observation.edges.find((edge) => edge.id === command.edgeId)!;
    const wild = command.cardIds.filter(
      (id) => observation.self.hand.find((card) => card.id === id)!.color === 'wild',
    ).length;
    const value =
      (importance.get(edge.id) ?? 0) * 12 +
      (completion.get(edge.id) ?? 0) +
      (ROUTE_POINTS[edge.length] ?? 0) * 0.55 -
      wild * (difficulty === 'normal' ? 0.7 : 0.1) +
      (ourCities.has(edge.a) || ourCities.has(edge.b) ? 0.6 : 0) -
      (edge.tunnel ? 0.3 : 0);
    if (value > bestClaimValue) {
      bestClaimValue = value;
      bestClaim = command;
    }
  }
  if (observation.phase === 'action') {
    const targeted = bestClaim?.type === 'claim' && importance.has(bestClaim.edgeId);
    if (targeted) return bestClaim!;
    if (
      difficulty === 'normal' &&
      !unfinished.length &&
      observation.self.trainsRemaining >= 12 &&
      observation.finalTurnsRemaining === null &&
      observation.ticketDeckCount
    )
      return legal.find((command) => command.type === 'drawTickets')!;
    if (
      bestClaim &&
      (!plans.length ||
        observation.self.trainsRemaining <= 12 ||
        observation.finalTurnsRemaining !== null)
    )
      return bestClaim;
  }
  const demand = new Map<CardColor, number>();
  const targets = [...importance].sort((a, b) => b[1] - a[1]);
  for (const [edgeId, value] of targets) {
    const edge = observation.edges.find((edge) => edge.id === edgeId)!;
    const missing = need(observation, edge);
    if (missing.normal)
      demand.set(
        missing.color,
        Math.max(demand.get(missing.color) ?? 0, value * (1 + 1 / missing.normal)),
      );
    if (missing.wild) demand.set('wild', Math.max(demand.get('wild') ?? 0, value * 4));
    if (!missing.wild && missing.normal)
      demand.set('wild', Math.max(demand.get('wild') ?? 0, value * 1.25));
    if (difficulty === 'easy') break;
  }
  if (!targets.length) {
    for (const edge of observation.edges)
      if (
        isRouteAvailable(observation, edge.id) &&
        edge.length <= observation.self.trainsRemaining
      ) {
        const missing = need(observation, edge);
        const value =
          (ROUTE_POINTS[edge.length] ?? 0) / Math.max(1, edge.length) +
          (ourCities.has(edge.a) || ourCities.has(edge.b) ? 0.5 : 0);
        if (missing.normal)
          demand.set(missing.color, Math.max(demand.get(missing.color) ?? 0, value));
        if (missing.wild) demand.set('wild', Math.max(demand.get('wild') ?? 0, value * 3));
      }
  }
  const draws = legal.filter(
    (command): command is Extract<GameCommand, { type: 'draw' }> => command.type === 'draw',
  );
  let bestDraw: GameCommand | null = draws.find((command) => command.source === 'deck') ?? null;
  let bestDrawValue = 0.35;
  for (const command of draws)
    if (typeof command.source === 'number') {
      const color = observation.market[command.source]!.color;
      const value = (demand.get(color) ?? 0) / (color === 'wild' ? 2 : 1);
      if (value > bestDrawValue) {
        bestDrawValue = value;
        bestDraw = command;
      }
    }
  if (bestDraw) return bestDraw;
  return bestClaim ?? legal[0]!;
}

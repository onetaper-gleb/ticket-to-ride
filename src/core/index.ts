import type {
  Card,
  Edge,
  GameCommand,
  GameEvent,
  GameOptions,
  GameResult,
  GameState,
  Observation,
  Player,
  PublicBoard,
  Train,
  TrainOrder,
  Transition,
} from '../shared/types';
import {
  CAPACITY,
  COLORS,
  createBoard,
  DISTRICTS,
  FIRST_PLAYERS,
  HAND_LIMIT,
  LAST_ROUND,
  PLAYER_COLORS,
  REPAIR_SCORE_CAP,
  RULES_VERSION,
} from '../data/scenario';
import { hashSeed, shuffle } from './random';
import { orderTarget, previewOrder, routeForTrain } from './routing';
export { previewOrder } from './routing';

const clone = <T>(value: T): T => structuredClone(value);
const idleOrder = (): TrainOrder => ({
  mode: 'idle',
  destination: null,
  returnTo: null,
  repeat: false,
});
const active = (state: GameState): Player =>
  state.players.find((player) => player.id === state.activePlayer)!;
const boardFor = (state: GameState): PublicBoard => ({
  round: state.round,
  stations: state.stations,
  edges: state.edges,
  trains: state.trains,
});
function emit(
  state: GameState,
  kind: GameEvent['kind'],
  message: string,
  fields: Partial<Omit<GameEvent, 'id' | 'round' | 'kind' | 'message'>> = {},
): void {
  state.events.push({
    id: (state.events.at(-1)?.id ?? 0) + 1,
    round: state.round,
    kind,
    message,
    ...fields,
  });
}
function scorePlayer(player: Player): void {
  const objectives = player.objectives.filter(
    (district) => player.delivered.filter((group) => group.district === district).length >= 2,
  ).length;
  player.score =
    player.delivered.reduce((sum, group) => sum + (group.priority ? 3 : 2), 0) +
    objectives * 3 +
    player.repairScore;
}
function turnOrder(state: GameState): number[] {
  const first = state.initiative[state.round - 1] ?? 0;
  return Array.from(
    { length: state.playerCount },
    (_, index) => (first + index) % state.playerCount,
  );
}

export function createGame(options: GameOptions = {}): GameState {
  const playerCount = options.playerCount ?? 3;
  if (![2, 3, 4].includes(playerCount)) throw new Error('В партии участвуют 2–4 бригады.');
  const seed = options.seed?.trim() || 'river-default';
  const state: GameState = {
    schemaVersion: 1,
    rulesVersion: RULES_VERSION,
    seed,
    rng: hashSeed(seed),
    revision: 0,
    round: 1,
    playerCount,
    activePlayer: 0,
    phase: 'setup',
    drawsRemaining: 0,
    players: [],
    trains: [],
    ...createBoard(playerCount),
    deck: [],
    discard: [],
    market: [],
    lostGroups: [],
    events: [],
    initiative: [],
    turnOrder: [],
    turnIndex: 0,
    setupIndex: 0,
    totalGroups: playerCount * 12,
  };
  const cards: Card[] = COLORS.flatMap((color) =>
    Array.from({ length: 15 }, (_, index) => ({ id: `${color}-${index + 1}`, color })),
  );
  cards.push(
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `wild-${index + 1}`,
      color: 'wild' as const,
    })),
  );
  state.deck = shuffle(cards, state);
  const permutation = shuffle(
    Array.from({ length: playerCount }, (_, index) => index),
    state,
  );
  state.initiative = FIRST_PLAYERS[playerCount]!.map((seat) => permutation[seat]!);
  for (let id = 0; id < playerCount; id++) {
    const objectiveOptions = shuffle(DISTRICTS, state).slice(0, 3);
    state.players.push({
      id,
      name:
        id === 0 ? options.playerName?.trim().slice(0, 30) || 'Ваша бригада' : `Бригада ${id + 1}`,
      color: PLAYER_COLORS[id]!,
      hand: state.deck.splice(0, 5),
      objectiveOptions,
      objectives: [],
      delivered: [],
      repairScore: 0,
      score: 0,
    });
    ['hill', 'upper'].forEach((stationId, index) =>
      state.trains.push({
        id: `p${id}-t${index + 1}`,
        playerId: id,
        stationId,
        cargo: [],
        cargoEdges: [],
        order: idleOrder(),
        disabled: false,
        expressRound: null,
      }),
    );
  }
  state.market = state.deck.splice(0, 5);
  state.turnOrder = turnOrder(state);
  emit(
    state,
    'setup',
    'Диспетчер Вера: вода поднимется после раундов 6, 8, 10 и 12. Выберите два района.',
  );
  return state;
}

/** Explicit allow-list; no deck, PRNG, opponents' cards or objectives cross this boundary. */
export function getObservation(state: GameState, playerId: number): Observation {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) throw new Error('Такой бригады нет.');
  return clone({
    schemaVersion: state.schemaVersion,
    rulesVersion: state.rulesVersion,
    revision: state.revision,
    round: state.round,
    playerCount: state.playerCount,
    activePlayer: state.activePlayer,
    phase: state.phase,
    drawsRemaining: state.drawsRemaining,
    players: state.players.map((item) => ({
      id: item.id,
      name: item.name,
      color: item.color,
      handCount: item.hand.length,
      delivered: item.delivered,
      repairScore: item.repairScore,
      score: item.score,
    })),
    self: {
      id: player.id,
      name: player.name,
      color: player.color,
      hand: player.hand,
      objectiveOptions: player.objectiveOptions,
      objectives: player.objectives,
      delivered: player.delivered,
      repairScore: player.repairScore,
      score: player.score,
    },
    stations: state.stations,
    edges: state.edges,
    trains: state.trains,
    market: state.market,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    lostGroups: state.lostGroups,
    events: state.events,
    initiative: state.initiative,
    turnOrder: state.turnOrder,
    totalGroups: state.totalGroups,
  });
}

function payment(hand: Card[], edge: Edge): Card[] | null {
  const wild = hand.filter((card) => card.color === 'wild');
  const possible =
    edge.color === 'gray'
      ? [...COLORS].sort(
          (a, b) =>
            hand.filter((card) => card.color === b).length -
            hand.filter((card) => card.color === a).length,
        )
      : [edge.color];
  for (const color of possible) {
    const normal = hand.filter((card) => card.color === color);
    if (normal.length + wild.length >= edge.cost)
      return [
        ...normal.slice(0, edge.cost),
        ...wild.slice(0, Math.max(0, edge.cost - normal.length)),
      ];
  }
  return null;
}
function expressPayment(hand: Card[]): Card[] {
  return [...hand]
    .sort((a, b) => Number(a.color === 'wild') - Number(b.color === 'wild'))
    .slice(0, 2);
}
function edgeAvailable(board: PublicBoard, edge: Edge): boolean {
  return (
    !edge.open &&
    board.stations.some((station) => station.id === edge.a && !station.flooded) &&
    board.stations.some((station) => station.id === edge.b && !station.flooded)
  );
}
function legalDrawSources(observation: Observation): GameCommand[] {
  const commands: GameCommand[] = [];
  if (observation.deckCount + observation.discardCount > 0)
    commands.push({ type: 'draw', source: 'deck' });
  observation.market.forEach((card, source) => {
    if (observation.phase === 'action' || card.color !== 'wild')
      commands.push({ type: 'draw', source });
  });
  return commands;
}
function orderError(board: PublicBoard, train: Train, order: TrainOrder): string | null {
  if (train.disabled) return 'Затопленным поездом управлять нельзя.';
  if (
    typeof order.repeat !== 'boolean' ||
    (order.destination !== null && typeof order.destination !== 'string') ||
    (order.returnTo !== null && typeof order.returnTo !== 'string') ||
    (order.confirmRisk !== undefined && typeof order.confirmRisk !== 'boolean')
  )
    return 'Некорректные параметры приказа.';
  if (!['idle', 'position', 'evacuate', 'return'].includes(order.mode))
    return 'Неизвестный приказ.';
  if (order.mode === 'idle')
    return train.cargo.length ? 'Поезд с пассажирами должен идти в убежище.' : null;
  const station = board.stations.find((item) => item.id === order.destination);
  const refuge = board.stations.find(
    (item) => item.id === (order.returnTo ?? (order.mode === 'return' ? order.destination : null)),
  );
  if (train.cargo.length) {
    if (!['evacuate', 'return'].includes(order.mode) || !refuge?.safe || refuge.flooded)
      return 'Пассажиров можно везти только в убежище.';
    if (order.mode === 'evacuate' && order.destination !== train.order.destination)
      return 'После погрузки источник рейса менять нельзя.';
  } else if (order.mode === 'evacuate') {
    if (!station || station.safe || station.flooded) return 'Выберите открытую станцию эвакуации.';
    if (!refuge?.safe || refuge.flooded) return 'Выберите убежище для обратного рейса.';
  } else if (order.mode === 'position') {
    if (!station || station.flooded) return 'Выберите открытую станцию для перемещения.';
  } else if (!refuge?.safe || refuge.flooded) return 'Возвращаться можно только в убежище.';
  const preview = previewOrder(board, train, order);
  if (preview.path.length > 0 && !preview.safe && !order.confirmRisk)
    return 'Рейс опасен. Подтвердите риск или выберите другой маршрут.';
  return null;
}

export function getLegalCommands(observation: Observation): GameCommand[] {
  if (observation.phase === 'finished' || observation.activePlayer !== observation.self.id)
    return [];
  if (observation.phase === 'setup') {
    const options = observation.self.objectiveOptions;
    return options.flatMap((first, index) =>
      options
        .slice(index + 1)
        .map((second) => ({ type: 'chooseObjectives' as const, districts: [first, second] })),
    );
  }
  if (observation.phase === 'discard')
    return observation.self.hand.map((card) => ({ type: 'discard', cardId: card.id }));
  if (observation.phase === 'draw') return legalDrawSources(observation);
  if (observation.phase === 'action') {
    const commands: GameCommand[] = [...legalDrawSources(observation)];
    for (const edge of observation.edges)
      if (edgeAvailable(observation, edge) && payment(observation.self.hand, edge))
        commands.push({ type: 'repair', edgeId: edge.id });
    if (observation.self.hand.length >= 2)
      for (const train of observation.trains) {
        if (
          train.playerId === observation.self.id &&
          !train.disabled &&
          train.expressRound !== observation.round
        )
          commands.push({ type: 'express', trainId: train.id });
      }
    commands.push({ type: 'pass' });
    return commands;
  }
  const commands: GameCommand[] = [];
  const refuges = observation.stations.filter((station) => station.safe && !station.flooded);
  for (const train of observation.trains.filter(
    (item) => item.playerId === observation.self.id && !item.disabled,
  )) {
    const candidates: TrainOrder[] = [];
    if (train.cargo.length) {
      refuges.forEach((refuge) =>
        candidates.push({
          mode: 'evacuate',
          destination: train.order.destination,
          returnTo: refuge.id,
          repeat: train.order.repeat,
        }),
      );
    } else {
      candidates.push(idleOrder());
      for (const station of observation.stations.filter((item) => !item.flooded)) {
        if (!station.safe && station.groups.length)
          for (const refuge of refuges)
            candidates.push({
              mode: 'evacuate',
              destination: station.id,
              returnTo: refuge.id,
              repeat: true,
            });
        if (station.id !== train.stationId)
          candidates.push({
            mode: 'position',
            destination: station.id,
            returnTo: null,
            repeat: false,
          });
      }
      refuges.forEach((refuge) =>
        candidates.push({
          mode: 'return',
          destination: train.order.destination,
          returnTo: refuge.id,
          repeat: false,
        }),
      );
    }
    for (const order of candidates) {
      if (JSON.stringify({ ...train.order, confirmRisk: undefined }) === JSON.stringify(order))
        continue;
      if (!orderError(observation, train, order))
        commands.push({ type: 'order', trainId: train.id, order });
    }
  }
  commands.push({ type: 'endTurn' });
  return commands;
}

function spend(state: GameState, player: Player, cards: Card[]): void {
  const ids = new Set(cards.map((card) => card.id));
  player.hand = player.hand.filter((card) => !ids.has(card.id));
  state.discard.push(...cards);
}
function refillDeck(state: GameState): void {
  if (!state.deck.length && state.discard.length) {
    state.deck = shuffle(state.discard, state);
    state.discard = [];
  }
}
function refillMarket(state: GameState): void {
  while (state.market.length < 5) {
    refillDeck(state);
    const card = state.deck.shift();
    if (!card) break;
    state.market.push(card);
  }
}
function finishDraw(state: GameState): void {
  state.drawsRemaining = 0;
  state.phase = active(state).hand.length > HAND_LIMIT ? 'discard' : 'orders';
}
function draw(state: GameState, source: 'deck' | number): string | null {
  if (!['action', 'draw'].includes(state.phase)) return 'Сейчас нельзя брать карты.';
  const first = state.phase === 'action';
  let card: Card | undefined;
  if (source === 'deck') {
    refillDeck(state);
    card = state.deck.shift();
    if (!card) return 'Закрытая колода пуста.';
  } else {
    if (!Number.isInteger(source) || source < 0 || source >= state.market.length)
      return 'Этой карты на рынке нет.';
    if (!first && state.market[source]?.color === 'wild')
      return 'Открытая универсальная карта занимает весь добор и доступна только первой.';
    card = state.market.splice(source, 1)[0];
    refillMarket(state);
  }
  active(state).hand.push(card!);
  emit(
    state,
    'draw',
    `${active(state).name}: получены материалы${source === 'deck' ? ' из колоды' : ' с рынка'}.`,
    { playerId: state.activePlayer },
  );
  state.drawsRemaining = first ? 1 : 0;
  if (first && source !== 'deck' && card!.color === 'wild') state.drawsRemaining = 0;
  state.phase = 'draw';
  if (!state.drawsRemaining || !legalDrawSources(getObservation(state, state.activePlayer)).length)
    finishDraw(state);
  return null;
}

function serviceTrain(state: GameState, train: Train): boolean {
  const station = state.stations.find((item) => item.id === train.stationId)!;
  if (station.id !== orderTarget(train)) return false;
  if (train.cargo.length > 0) {
    if (!station.safe) return false;
    const player = state.players[train.playerId]!;
    const count = train.cargo.length;
    player.delivered.push(...train.cargo);
    for (const edgeId of train.cargoEdges) {
      const edge = state.edges.find((item) => item.id === edgeId);
      if (!edge || edge.credited || edge.builder === null) continue;
      edge.credited = true;
      const builder = state.players[edge.builder]!;
      if (builder.repairScore < REPAIR_SCORE_CAP) builder.repairScore++;
    }
    train.cargo = [];
    train.cargoEdges = [];
    state.players.forEach(scorePlayer);
    emit(
      state,
      'deliver',
      `${player.name}: ${count} ${count === 1 ? 'группа доставлена' : 'группы доставлены'} в ${station.name}.`,
      { playerId: player.id, trainId: train.id, stationId: station.id },
    );
    const nextBoard = { ...boardFor(state), round: state.round + 1 };
    const source = state.stations.find((item) => item.id === train.order.destination);
    if (!(
      train.order.mode === 'evacuate' &&
      train.order.repeat &&
      source?.groups.length &&
      previewOrder(nextBoard, train, train.order).safe
    ))
      train.order = idleOrder();
  } else if (train.order.mode === 'evacuate') {
    const groups = [...station.groups]
      .sort((a, b) => Number(b.priority) - Number(a.priority) || a.id.localeCompare(b.id))
      .slice(0, CAPACITY);
    train.cargo = groups;
    train.cargoEdges = [];
    station.groups = station.groups.filter(
      (group) => !groups.some((loaded) => loaded.id === group.id),
    );
    if (groups.length)
      emit(
        state,
        'load',
        `${state.players[train.playerId]!.name}: погружено ${groups.length} группы на станции ${station.name}.`,
        { playerId: train.playerId, trainId: train.id, stationId: station.id },
      );
    else {
      train.order = { ...train.order, mode: 'return', repeat: false };
      emit(state, 'load', `${station.name}: очередь уже эвакуирована, поезд вернётся пустым.`, {
        playerId: train.playerId,
        trainId: train.id,
        stationId: station.id,
      });
    }
  } else train.order = idleOrder();
  return true;
}
function moveStep(
  state: GameState,
  ordered: Train[],
  serviced: Set<string>,
  second: boolean,
): void {
  for (const train of ordered) {
    if (train.disabled || serviced.has(train.id) || (second && train.expressRound !== state.round))
      continue;
    const target = orderTarget(train);
    if (!target || target === train.stationId) continue;
    const route = routeForTrain(
      boardFor(state),
      train,
      train.order,
      second ? 1 : train.expressRound === state.round ? 2 : 1,
    );
    const next = route.path[1];
    if (!next) continue;
    const edge = state.edges.find(
      (item) =>
        item.open &&
        ((item.a === train.stationId && item.b === next) ||
          (item.b === train.stationId && item.a === next)),
    );
    const destination = state.stations.find((item) => item.id === next);
    if (!edge || !destination || destination.flooded) continue;
    const from = train.stationId;
    train.stationId = next;
    if (train.cargo.length && edge.builder !== null && !train.cargoEdges.includes(edge.id))
      train.cargoEdges.push(edge.id);
    emit(state, 'move', `${state.players[train.playerId]!.name}: поезд → ${destination.name}.`, {
      playerId: train.playerId,
      trainId: train.id,
      from,
      to: next,
      stationId: next,
    });
  }
  for (const train of ordered) {
    if (train.disabled || serviced.has(train.id) || (second && train.expressRound !== state.round))
      continue;
    if (serviceTrain(state, train)) serviced.add(train.id);
  }
}
function resolveRound(state: GameState): void {
  const ordered = state.turnOrder.flatMap((playerId) =>
    state.trains
      .filter((train) => train.playerId === playerId)
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const serviced = new Set<string>();
  moveStep(state, ordered, serviced, false);
  moveStep(state, ordered, serviced, true);
  for (const station of state.stations) {
    if (station.flooded || station.floodRound !== state.round) continue;
    station.flooded = true;
    const stranded = station.groups.length;
    state.lostGroups.push(...station.groups);
    station.groups = [];
    emit(
      state,
      'flood',
      `${station.name} закрыта водой${stranded ? `: отрезано ${stranded} группы` : ''}.`,
      { stationId: station.id },
    );
    for (const train of state.trains.filter(
      (item) => !item.disabled && item.stationId === station.id,
    )) {
      const lost = train.cargo.length;
      state.lostGroups.push(...train.cargo);
      train.cargo = [];
      train.cargoEdges = [];
      train.disabled = true;
      train.order = idleOrder();
      emit(
        state,
        'loss',
        `${state.players[train.playerId]!.name}: поезд затоплен на станции ${station.name}${lost ? `, потеряно ${lost} группы` : ''}.`,
        { trainId: train.id, playerId: train.playerId, stationId: station.id },
      );
    }
    state.edges
      .filter((edge) => edge.a === station.id || edge.b === station.id)
      .forEach((edge) => {
        edge.open = false;
      });
  }
  const groupsRemain =
    state.stations.some((station) => station.groups.length) ||
    state.trains.some((train) => train.cargo.length);
  if (state.round >= LAST_ROUND || !groupsRemain) {
    state.phase = 'finished';
    state.drawsRemaining = 0;
    emit(state, 'finish', 'Операция завершена. Диспетчерская подводит итог эвакуации.');
    return;
  }
  state.round++;
  state.turnOrder = turnOrder(state);
  state.turnIndex = 0;
  state.activePlayer = state.turnOrder[0]!;
  state.phase = 'action';
  emit(
    state,
    'round',
    `Раунд ${state.round}. Первой действует ${state.players[state.activePlayer]!.name}.`,
  );
}

export function applyCommand(input: GameState, command: GameCommand): Transition {
  if (!command || typeof command !== 'object' || !('type' in command))
    return { state: input, events: [], error: 'Некорректная команда.' };
  if (input.phase === 'finished')
    return { state: input, events: [], error: 'Партия уже завершена.' };
  const state = clone(input);
  const eventIndex = state.events.length;
  let error: string | null = null;
  const player = active(state);
  switch (command.type) {
    case 'chooseObjectives': {
      const districts = command.districts;
      if (state.phase !== 'setup') {
        error = 'Задания уже выбраны.';
        break;
      }
      if (
        !Array.isArray(districts) ||
        districts.length !== 2 ||
        new Set(districts).size !== 2 ||
        !districts.every((district) => player.objectiveOptions.includes(district))
      ) {
        error = 'Выберите два разных района из трёх предложенных.';
        break;
      }
      player.objectives = [...districts];
      emit(state, 'setup', `${player.name}: районы выбраны.`, { playerId: player.id });
      state.setupIndex++;
      if (state.setupIndex >= state.playerCount) {
        state.phase = 'action';
        state.activePlayer = state.turnOrder[0]!;
      } else state.activePlayer = state.setupIndex;
      break;
    }
    case 'draw':
      error = draw(state, command.source);
      break;
    case 'repair': {
      if (state.phase !== 'action') {
        error = 'Основное действие уже использовано.';
        break;
      }
      const edge = state.edges.find((item) => item.id === command.edgeId);
      if (!edge || !edgeAvailable(boardFor(state), edge)) {
        error = 'Эту линию сейчас восстановить нельзя.';
        break;
      }
      const cards = payment(player.hand, edge);
      if (!cards) {
        error = 'Не хватает материалов одного нужного цвета.';
        break;
      }
      spend(state, player, cards);
      edge.open = true;
      edge.builder = player.id;
      state.phase = 'orders';
      emit(
        state,
        'repair',
        `${player.name}: восстановлена линия ${state.stations.find((item) => item.id === edge.a)!.name} — ${state.stations.find((item) => item.id === edge.b)!.name}.`,
        { playerId: player.id },
      );
      break;
    }
    case 'express': {
      const train = state.trains.find(
        (item) => item.id === command.trainId && item.playerId === player.id,
      );
      if (state.phase !== 'action') {
        error = 'Основное действие уже использовано.';
        break;
      }
      if (!train || train.disabled || train.expressRound === state.round) {
        error = 'Этот поезд сейчас нельзя ускорить.';
        break;
      }
      if (player.hand.length < 2) {
        error = 'Для экспресса нужны любые две карты.';
        break;
      }
      spend(state, player, expressPayment(player.hand));
      train.expressRound = state.round;
      state.phase = 'orders';
      emit(state, 'express', `${player.name}: экспресс может пройти две линии в этом раунде.`, {
        playerId: player.id,
        trainId: train.id,
      });
      break;
    }
    case 'pass':
      if (state.phase !== 'action') error = 'Пропустить можно только основное действие.';
      else {
        state.phase = 'orders';
        emit(state, 'pass', `${player.name}: сохранены материалы.`, { playerId: player.id });
      }
      break;
    case 'discard': {
      if (state.phase !== 'discard') {
        error = 'Обязательного сброса сейчас нет.';
        break;
      }
      const card = player.hand.find((item) => item.id === command.cardId);
      if (!card) {
        error = 'Такой карты в руке нет.';
        break;
      }
      spend(state, player, [card]);
      if (player.hand.length <= HAND_LIMIT) state.phase = 'orders';
      break;
    }
    case 'order': {
      if (state.phase !== 'orders') {
        error = 'Сначала завершите основное действие.';
        break;
      }
      const train = state.trains.find(
        (item) => item.id === command.trainId && item.playerId === player.id,
      );
      if (!train) {
        error = 'Это не ваш поезд.';
        break;
      }
      if (!command.order || typeof command.order !== 'object') {
        error = 'Некорректный приказ.';
        break;
      }
      error = orderError(boardFor(state), train, command.order);
      if (error) break;
      train.order = command.order.mode === 'idle' ? idleOrder() : clone(command.order);
      if (train.order.mode === 'return') train.order.returnTo ??= train.order.destination;
      emit(state, 'order', `${player.name}: приказ поезду обновлён.`, {
        playerId: player.id,
        trainId: train.id,
      });
      break;
    }
    case 'endTurn':
      if (state.phase !== 'orders') {
        error = 'Сначала завершите действие, добор и сброс.';
        break;
      }
      state.turnIndex++;
      if (state.turnIndex >= state.playerCount) resolveRound(state);
      else {
        state.activePlayer = state.turnOrder[state.turnIndex]!;
        state.phase = 'action';
      }
      break;
    default:
      error = 'Неизвестная команда.';
  }
  if (error) return { state: input, events: [], error };
  state.revision++;
  return { state, events: state.events.slice(eventIndex) };
}

export function getGameResult(state: GameState | Observation): GameResult {
  const saved = state.players.reduce((sum, player) => sum + player.delivered.length, 0);
  const stranded =
    state.stations.reduce((sum, station) => sum + station.groups.length, 0) +
    state.trains.reduce((sum, train) => sum + train.cargo.length, 0);
  const standings = state.players
    .map((player) => {
      // Objective count follows score accounting; opponents' actual district choices remain private in an observation.
      const passengerScore = player.delivered.reduce(
        (sum, group) => sum + (group.priority ? 3 : 2),
        0,
      );
      return {
        playerId: player.id,
        name: player.name,
        color: player.color,
        score: player.score,
        delivered: player.delivered.length,
        priority: player.delivered.filter((group) => group.priority).length,
        objectivesCompleted: Math.max(
          0,
          Math.round((player.score - passengerScore - player.repairScore) / 3),
        ),
        repairScore: player.repairScore,
        winner: false,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.delivered - a.delivered ||
        b.priority - a.priority ||
        a.playerId - b.playerId,
    );
  const first = standings[0]!;
  for (const standing of standings)
    standing.winner =
      saved > 0 &&
      state.phase === 'finished' &&
      standing.score === first.score &&
      standing.delivered === first.delivered &&
      standing.priority === first.priority;
  return {
    standings,
    saved,
    lost: state.lostGroups.length,
    stranded,
    total: state.totalGroups,
    cityOutcome:
      saved === 0 ? 'failure' : saved / state.totalGroups >= 0.75 ? 'excellent' : 'partial',
    finished: state.phase === 'finished',
  };
}

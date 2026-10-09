import type {
  Card,
  CardColor,
  ClaimOption,
  Edge,
  GameCommand,
  GameEvent,
  GameOptions,
  GameResult,
  GameState,
  Observation,
  Player,
  PublicBoard,
  PublicPlayer,
  Standing,
  Transition,
} from '../shared/types';
import {
  COLORS,
  createBoard,
  PLAYER_COLORS,
  ROUTE_POINTS,
  RULES_VERSION,
  TICKETS,
} from '../data/europe';
import { hashSeed, shuffle } from './random';
import { getLongestRouteLength, getTicketProgress } from './routing';
export { getLongestRouteLength, getTicketProgress } from './routing';
export { RULES_VERSION } from '../data/europe';

const clone = <T>(value: T): T => structuredClone(value);
const active = (state: GameState): Player => state.players[state.activePlayer]!;
function fail(message: string): never {
  throw new Error(message);
}

function emit(
  state: GameState,
  kind: GameEvent['kind'],
  message: string,
  fields: Partial<Pick<GameEvent, 'playerId' | 'edgeId' | 'cityId'>> = {},
): void {
  state.events.push({
    id: (state.events.at(-1)?.id ?? 0) + 1,
    turn: state.turn,
    kind,
    message,
    ...fields,
  });
}
function publicPlayers(state: GameState): PublicPlayer[] {
  return state.players.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    handCount: player.hand.length,
    ticketCount: player.tickets.length,
    trainsRemaining: player.trainsRemaining,
    stationsRemaining: player.stationsRemaining,
    stations: player.stations,
    score: player.score,
    ...(state.phase === 'finished' ? { tickets: player.tickets } : {}),
  }));
}
function boardFor(state: GameState): PublicBoard {
  return { cities: state.cities, edges: state.edges, players: publicPlayers(state) };
}
function drawCard(state: GameState): Card | undefined {
  if (!state.deck.length && state.discard.length) {
    state.deck = shuffle(state.discard, state);
    state.discard = [];
  }
  return state.deck.shift();
}

/** Rejection sampling follows the three-locomotive reset, with a finite blind-only fallback. */
function refillMarket(state: GameState): void {
  for (let attempt = 0; ; attempt++) {
    while (state.market.length < 5) {
      const card = drawCard(state);
      if (!card) break;
      state.market.push(card);
    }
    if (state.market.filter((card) => card.color === 'wild').length < 3) return;
    const available = [...state.market, ...state.deck, ...state.discard];
    const requiredRegular = Math.max(0, Math.min(5, available.length) - 2);
    state.discard.push(...state.market);
    state.market = [];
    if (available.filter((card) => card.color !== 'wild').length < requiredRegular) {
      // There is no legal face-up row in this exceptional hoarding state. Blind cards remain available.
      emit(
        state,
        'draw',
        'Рынок убран: доступных цветных карт недостаточно. Можно брать карты вслепую.',
      );
      return;
    }
    if (attempt >= 999) {
      // Bounded safeguard for pathological PRNG cycles. All cards still occur exactly once.
      const pool = shuffle([...state.deck, ...state.discard], state);
      const regular = pool.filter((card) => card.color !== 'wild').slice(0, requiredRegular);
      const ids = new Set(regular.map((card) => card.id));
      const remainder = pool.filter((card) => !ids.has(card.id));
      state.market = [...regular, ...remainder.splice(0, 5 - regular.length)];
      state.deck = remainder;
      state.discard = [];
      return;
    }
  }
}

export function createGame(options: GameOptions = {}): GameState {
  const playerCount = options.playerCount ?? 3;
  if (![2, 3, 4, 5].includes(playerCount)) throw new Error('В партии участвуют 2–5 игроков.');
  const seed = options.seed?.trim() || 'europe-default';
  const state: GameState = {
    schemaVersion: 2,
    rulesVersion: RULES_VERSION,
    seed,
    rng: hashSeed(seed),
    revision: 0,
    turn: 1,
    round: 1,
    playerCount,
    activePlayer: 0,
    phase: 'setup',
    drawsRemaining: 0,
    players: [],
    ...createBoard(),
    deck: [],
    discard: [],
    market: [],
    ticketDeck: [],
    unusedTickets: [],
    pendingTunnel: null,
    finalTurnsRemaining: null,
    finalRoundTrigger: null,
    consecutivePasses: 0,
    events: [],
  };
  const cards: Card[] = COLORS.flatMap((color) =>
    Array.from({ length: 12 }, (_, i) => ({ id: `${color}-${i + 1}`, color })),
  );
  cards.push(
    ...Array.from({ length: 14 }, (_, i) => ({ id: `wild-${i + 1}`, color: 'wild' as const })),
  );
  state.deck = shuffle(cards, state);
  const long = shuffle(
    TICKETS.filter((ticket) => ticket.long),
    state,
  );
  state.ticketDeck = shuffle(
    TICKETS.filter((ticket) => !ticket.long),
    state,
  );
  for (let id = 0; id < playerCount; id++) {
    state.players.push({
      id,
      name: id === 0 ? options.playerName?.trim().slice(0, 30) || 'Вы' : `Игрок ${id + 1}`,
      color: PLAYER_COLORS[id]!,
      hand: state.deck.splice(0, 4),
      tickets: [],
      ticketOptions: [long.shift()!, ...state.ticketDeck.splice(0, 3)],
      trainsRemaining: 45,
      stationsRemaining: 3,
      stations: [],
      score: 0,
    });
  }
  state.unusedTickets = long;
  refillMarket(state);
  emit(
    state,
    'setup',
    'Оставьте минимум два из четырёх билетов. За выполненный билет получите очки; за невыполненный потеряете столько же.',
  );
  return state;
}

/** Explicit allow-list: opponents' hands, hidden tickets, deck order and random state stay private. */
export function getObservation(state: GameState, playerId: number): Observation {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) throw new Error('Такого игрока нет.');
  return clone({
    schemaVersion: state.schemaVersion,
    rulesVersion: state.rulesVersion,
    revision: state.revision,
    turn: state.turn,
    round: state.round,
    playerCount: state.playerCount,
    activePlayer: state.activePlayer,
    phase: state.phase,
    drawsRemaining: state.drawsRemaining,
    ...boardFor(state),
    self: player,
    market: state.market,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    ticketDeckCount: state.ticketDeck.length,
    pendingTunnel: state.pendingTunnel,
    finalTurnsRemaining: state.finalTurnsRemaining,
    finalRoundTrigger: state.finalRoundTrigger,
    events: state.events,
  });
}

function canonicalPayments(
  hand: Card[],
  length: number,
  color: Edge['color'] | CardColor,
  minimumWild = 0,
): ClaimOption[] {
  const wild = hand.filter((card) => card.color === 'wild');
  const options: ClaimOption[] = [];
  const colors: CardColor[] = color === 'gray' ? [...COLORS] : [color];
  for (const candidate of colors) {
    const normal = hand.filter((card) => card.color === candidate && candidate !== 'wild');
    for (let wildCount = minimumWild; wildCount <= Math.min(length, wild.length); wildCount++) {
      const normalCount = length - wildCount;
      if (normalCount > normal.length || (candidate === 'wild' && normalCount > 0)) continue;
      // An all-locomotive payment has one meaning, independent of the printed route color.
      if (!normalCount && options.some((option) => option.color === 'wild')) continue;
      options.push({
        color: normalCount ? candidate : 'wild',
        wildCount,
        cardIds: [...normal.slice(0, normalCount), ...wild.slice(0, wildCount)].map(
          (card) => card.id,
        ),
      });
    }
  }
  return options;
}
function edgeAvailable(
  board: PublicBoard,
  edge: Edge,
  playerId: number,
  playerCount: number,
): boolean {
  if (edge.owner !== null) return false;
  return (
    !edge.parallel ||
    !board.edges.some(
      (other) =>
        other.id !== edge.id &&
        other.parallel === edge.parallel &&
        other.owner !== null &&
        (playerCount <= 3 || other.owner === playerId),
    )
  );
}
export function isRouteAvailable(observation: Observation, edgeId: string): boolean {
  const edge = observation.edges.find((item) => item.id === edgeId);
  return !!edge && edgeAvailable(observation, edge, observation.self.id, observation.playerCount);
}
export function getClaimOptions(observation: Observation, edgeId: string): ClaimOption[] {
  const edge = observation.edges.find((item) => item.id === edgeId);
  if (
    !edge ||
    !edgeAvailable(observation, edge, observation.self.id, observation.playerCount) ||
    observation.self.trainsRemaining < edge.length
  )
    return [];
  return canonicalPayments(observation.self.hand, edge.length, edge.color, edge.ferries);
}
export function getStationOptions(observation: Observation, cityId: string): ClaimOption[] {
  if (
    !observation.cities.some((city) => city.id === cityId) ||
    !observation.self.stationsRemaining ||
    observation.players.some((player) => player.stations.includes(cityId))
  )
    return [];
  return canonicalPayments(observation.self.hand, 4 - observation.self.stationsRemaining, 'gray');
}
export function getTunnelPaymentOptions(observation: Observation): ClaimOption[] {
  const pending = observation.pendingTunnel;
  return pending ? canonicalPayments(observation.self.hand, pending.extraCost, pending.color) : [];
}
function combinations<T>(items: T[], min: number): T[][] {
  const result: T[][] = [];
  for (let mask = 0; mask < 2 ** items.length; mask++) {
    const chosen = items.filter((_, index) => mask & (1 << index));
    if (chosen.length >= min) result.push(chosen);
  }
  return result;
}
function drawCommands(observation: Observation): GameCommand[] {
  const commands: GameCommand[] = [];
  if (observation.deckCount + observation.discardCount > 0)
    commands.push({ type: 'draw', source: 'deck' });
  observation.market.forEach((card, index) => {
    if (observation.phase !== 'draw' || card.color !== 'wild')
      commands.push({ type: 'draw', source: index });
  });
  return commands;
}
export function getLegalCommands(observation: Observation): GameCommand[] {
  if (observation.self.id !== observation.activePlayer || observation.phase === 'finished')
    return [];
  if (observation.phase === 'setup' || observation.phase === 'tickets') {
    const min = observation.phase === 'setup' ? 2 : 1;
    return combinations(observation.self.ticketOptions, min).map((tickets) => ({
      type: 'chooseTickets',
      ticketIds: tickets.map((ticket) => ticket.id),
    }));
  }
  if (observation.phase === 'tunnel') {
    return [
      ...getTunnelPaymentOptions(observation).map((option): GameCommand => ({
        type: 'resolveTunnel',
        pay: true,
        cardIds: option.cardIds,
      })),
      { type: 'resolveTunnel', pay: false },
    ];
  }
  const commands = drawCommands(observation);
  if (observation.phase === 'draw') return commands;
  if (observation.ticketDeckCount) commands.push({ type: 'drawTickets' });
  for (const edge of observation.edges) {
    for (const option of getClaimOptions(observation, edge.id))
      commands.push({ type: 'claim', edgeId: edge.id, cardIds: option.cardIds });
  }
  for (const city of observation.cities) {
    for (const option of getStationOptions(observation, city.id))
      commands.push({ type: 'buildStation', cityId: city.id, cardIds: option.cardIds });
  }
  return commands.length ? commands : [{ type: 'pass' }];
}

function selectedCards(hand: Card[], ids: string[]): Card[] {
  if (new Set(ids).size !== ids.length) fail('Каждую карту можно использовать только один раз.');
  return ids.map(
    (id) => hand.find((card) => card.id === id) ?? fail('Выбранной карты нет в вашей руке.'),
  );
}
function paymentColor(
  cards: Card[],
  length: number,
  routeColor: Edge['color'] | CardColor,
  minimumWild = 0,
): CardColor {
  if (cards.length !== length) fail(`Для оплаты нужно ровно ${length} карт.`);
  const regular = [
    ...new Set(cards.filter((card) => card.color !== 'wild').map((card) => card.color)),
  ];
  if (regular.length > 1) fail('Для оплаты нужны карты одного цвета и локомотивы.');
  if (routeColor === 'wild' && regular.length) fail('Для этой доплаты подходят только локомотивы.');
  if (regular.length && routeColor !== 'gray' && regular[0] !== routeColor)
    fail('Цвет карт не совпадает с цветом участка.');
  if (cards.filter((card) => card.color === 'wild').length < minimumWild)
    fail(`Для парома нужно минимум ${minimumWild} локомотивов.`);
  return regular[0] ?? 'wild';
}
function removeCards(player: Player, cards: Card[]): void {
  const ids = new Set(cards.map((card) => card.id));
  player.hand = player.hand.filter((card) => !ids.has(card.id));
}
function finishAction(state: GameState, passed = false): void {
  state.drawsRemaining = 0;
  state.pendingTunnel = null;
  state.consecutivePasses = passed ? state.consecutivePasses + 1 : 0;
  if (state.finalTurnsRemaining !== null) {
    state.finalTurnsRemaining--;
    if (state.finalTurnsRemaining === 0) {
      state.phase = 'finished';
      emit(
        state,
        'finish',
        'Последний круг завершён. Подсчитываем билеты, станции и Европейский экспресс.',
      );
      return;
    }
  } else if (active(state).trainsRemaining <= 2) {
    state.finalTurnsRemaining = state.playerCount;
    state.finalRoundTrigger = state.activePlayer;
    emit(
      state,
      'turn',
      'Осталось не больше двух вагонов: каждому игроку предстоит ещё один последний ход.',
    );
  }
  if (state.consecutivePasses >= state.playerCount) {
    state.phase = 'finished';
    emit(state, 'finish', 'Ни у одного игрока нет допустимого действия. Партия завершена.');
    return;
  }
  state.activePlayer = (state.activePlayer + 1) % state.playerCount;
  state.turn++;
  if (state.activePlayer === 0) state.round++;
  state.phase = 'action';
  refillMarket(state);
}
function claimRoute(state: GameState, edge: Edge, cards: Card[]): void {
  const player = active(state);
  edge.owner = player.id;
  player.trainsRemaining -= edge.length;
  const points = ROUTE_POINTS[edge.length]!;
  if (points === undefined) fail('Для длины этого участка нет таблицы очков.');
  player.score += points;
  state.discard.push(...cards);
  const a = state.cities.find((city) => city.id === edge.a)!.name;
  const b = state.cities.find((city) => city.id === edge.b)!.name;
  emit(state, 'claim', `${player.name}: ${a} — ${b}, +${points} очков.`, {
    playerId: player.id,
    edgeId: edge.id,
  });
}

export function applyCommand(input: GameState, command: GameCommand): Transition {
  const state = clone(input);
  const priorEvent = state.events.at(-1)?.id ?? 0;
  try {
    if (state.phase === 'finished') fail('Партия уже завершена.');
    const player = active(state);
    if (command.type === 'chooseTickets') {
      if (state.phase !== 'setup' && state.phase !== 'tickets')
        fail('Сейчас не нужно выбирать билеты.');
      const minimum = state.phase === 'setup' ? 2 : 1;
      if (
        new Set(command.ticketIds).size !== command.ticketIds.length ||
        command.ticketIds.length < minimum ||
        command.ticketIds.some((id) => !player.ticketOptions.some((ticket) => ticket.id === id))
      )
        fail(`Оставьте минимум ${minimum} разных билета из предложенных.`);
      const kept = player.ticketOptions.filter((ticket) => command.ticketIds.includes(ticket.id));
      const returned = player.ticketOptions.filter(
        (ticket) => !command.ticketIds.includes(ticket.id),
      );
      player.tickets.push(...kept);
      player.ticketOptions = [];
      emit(state, 'tickets', `${player.name} оставляет ${kept.length} билета.`, {
        playerId: player.id,
      });
      if (state.phase === 'setup') {
        state.unusedTickets.push(...returned);
        if (state.activePlayer === state.playerCount - 1) {
          state.activePlayer = 0;
          state.phase = 'action';
        } else state.activePlayer++;
      } else {
        state.ticketDeck.push(...returned);
        finishAction(state);
      }
    } else if (command.type === 'draw') {
      if (state.phase !== 'action' && state.phase !== 'draw')
        fail('Сначала завершите текущее действие.');
      const second = state.phase === 'draw';
      let card: Card | undefined;
      if (command.source === 'deck') card = drawCard(state);
      else {
        if (!Number.isInteger(command.source) || command.source < 0)
          fail('Такой карты на рынке нет.');
        card = state.market[command.source];
        if (!card) fail('Такой карты на рынке нет.');
        if (second && card.color === 'wild')
          fail('Вторым добором открытый локомотив брать нельзя.');
        state.market.splice(command.source, 1);
        const replacement = drawCard(state);
        if (replacement) state.market.splice(command.source, 0, replacement);
      }
      if (!card) fail('Колода и сброс пусты. Выберите другое действие.');
      player.hand.push(card);
      emit(
        state,
        'draw',
        `${player.name} берёт карту${command.source === 'deck' ? ' вслепую' : ' с рынка'}.`,
        { playerId: player.id },
      );
      refillMarket(state);
      if (!second && !(command.source !== 'deck' && card.color === 'wild')) {
        state.phase = 'draw';
        state.drawsRemaining = 1;
        if (!drawCommands(getObservation(state, player.id)).length) finishAction(state);
      } else finishAction(state);
    } else if (command.type === 'drawTickets') {
      if (state.phase !== 'action') fail('Сначала завершите текущее действие.');
      if (!state.ticketDeck.length) fail('Все билеты уже разобраны.');
      player.ticketOptions = state.ticketDeck.splice(0, 3);
      state.phase = 'tickets';
      emit(state, 'tickets', `${player.name} берёт новые билеты и должен оставить минимум один.`, {
        playerId: player.id,
      });
    } else if (command.type === 'claim') {
      if (state.phase !== 'action') fail('Сначала завершите текущее действие.');
      const edge = state.edges.find((item) => item.id === command.edgeId);
      if (!edge || !edgeAvailable(boardFor(state), edge, player.id, state.playerCount))
        fail('Этот участок уже занят или закрыт правилом двойных путей.');
      if (player.trainsRemaining < edge.length) fail('Для этого участка не хватает вагонов.');
      const cards = selectedCards(player.hand, command.cardIds);
      const color = paymentColor(cards, edge.length, edge.color, edge.ferries);
      removeCards(player, cards);
      if (edge.tunnel) {
        const revealed: Card[] = [];
        for (let i = 0; i < 3; i++) {
          const card = drawCard(state);
          if (card) revealed.push(card);
        }
        const extraCost = revealed.filter(
          (card) => card.color === color || card.color === 'wild',
        ).length;
        state.pendingTunnel = { edgeId: edge.id, color, baseCards: cards, revealed, extraCost };
        state.phase = 'tunnel';
        emit(
          state,
          'tunnel',
          `Туннель: открыто ${revealed.length} карт. Доплата — ${extraCost}. Можно оплатить или вернуть карты и закончить ход.`,
          { playerId: player.id, edgeId: edge.id },
        );
        if (!extraCost) {
          claimRoute(state, edge, cards);
          state.discard.push(...revealed);
          finishAction(state);
        }
      } else {
        claimRoute(state, edge, cards);
        finishAction(state);
      }
    } else if (command.type === 'resolveTunnel') {
      if (state.phase !== 'tunnel' || !state.pendingTunnel)
        fail('Сейчас нет незавершённой попытки пройти туннель.');
      const pending = state.pendingTunnel;
      const edge = state.edges.find((item) => item.id === pending.edgeId)!;
      if (command.pay) {
        const extra = selectedCards(player.hand, command.cardIds ?? []);
        paymentColor(extra, pending.extraCost, pending.color);
        removeCards(player, extra);
        claimRoute(state, edge, [...pending.baseCards, ...extra]);
      } else {
        if (command.cardIds?.length) fail('При отмене не нужно выбирать карты доплаты.');
        player.hand.push(...pending.baseCards);
        emit(state, 'tunnel', 'Попытка отменена: первоначальные карты возвращены, ход закончен.', {
          playerId: player.id,
          edgeId: edge.id,
        });
      }
      state.discard.push(...pending.revealed);
      finishAction(state);
    } else if (command.type === 'buildStation') {
      if (state.phase !== 'action') fail('Сначала завершите текущее действие.');
      if (!state.cities.some((city) => city.id === command.cityId)) fail('Такого города нет.');
      if (!player.stationsRemaining) fail('Все три станции уже построены.');
      if (state.players.some((item) => item.stations.includes(command.cityId)))
        fail('В этом городе уже есть станция.');
      const cards = selectedCards(player.hand, command.cardIds);
      paymentColor(cards, 4 - player.stationsRemaining, 'gray');
      removeCards(player, cards);
      state.discard.push(...cards);
      player.stations.push(command.cityId);
      player.stationsRemaining--;
      emit(
        state,
        'station',
        `${player.name} строит станцию. В финале она позволит использовать один чужой соседний участок для билетов.`,
        { playerId: player.id, cityId: command.cityId },
      );
      finishAction(state);
    } else if (command.type === 'pass') {
      if (
        state.phase !== 'action' ||
        getLegalCommands(getObservation(state, player.id)).some((item) => item.type !== 'pass')
      )
        fail('Пропустить ход можно только когда нет ни одного допустимого действия.');
      emit(state, 'pass', `${player.name}: нет допустимого действия.`, { playerId: player.id });
      finishAction(state, true);
    } else {
      fail('Неизвестная команда.');
    }
    state.revision++;
    return { state, events: state.events.filter((event) => event.id > priorEvent) };
  } catch (error) {
    return {
      state: input,
      events: [],
      error: error instanceof Error ? error.message : 'Команда отклонена.',
    };
  }
}

export function getGameResult(input: GameState | Observation): GameResult {
  const finished = input.phase === 'finished';
  const board: PublicBoard = {
    cities: input.cities,
    edges: input.edges,
    players: 'self' in input ? input.players : publicPlayers(input),
  };
  const longest = finished
    ? input.players.map((player) => getLongestRouteLength(board, player.id))
    : input.players.map(() => 0);
  const maximum = Math.max(...longest);
  const standings: Standing[] = input.players.map((player, index) => {
    const tickets =
      ('self' in input
        ? player.id === input.self.id
          ? input.self.tickets
          : (player.tickets ?? [])
        : player.tickets) ?? [];
    const progress = finished ? getTicketProgress(board, player.id, tickets) : [];
    const ticketScore = progress.reduce(
      (total, item) => total + (item.complete ? item.ticket.points : -item.ticket.points),
      0,
    );
    const routeScore = board.edges
      .filter((edge) => edge.owner === player.id)
      .reduce((total, edge) => total + (ROUTE_POINTS[edge.length] ?? 0), 0);
    const stationScore = finished ? player.stationsRemaining * 4 : 0;
    const expressScore = finished && maximum > 0 && longest[index] === maximum ? 10 : 0;
    return {
      playerId: player.id,
      name: player.name,
      color: player.color,
      score: routeScore + ticketScore + stationScore + expressScore,
      routeScore,
      ticketScore,
      stationScore,
      expressScore,
      completedTickets: progress.filter((item) => item.complete).length,
      totalTickets: 'ticketCount' in player ? player.ticketCount : player.tickets.length,
      longestPath: longest[index]!,
      stationRoutes: progress[0]?.stationRoutes ?? [],
      tickets: progress,
      winner: false,
    };
  });
  const stationCount = (standing: Standing) =>
    input.players.find((player) => player.id === standing.playerId)!.stationsRemaining;
  const compare = (a: Standing, b: Standing) =>
    b.score - a.score ||
    b.completedTickets - a.completedTickets ||
    stationCount(b) - stationCount(a) ||
    b.expressScore - a.expressScore;
  standings.sort(compare);
  if (finished)
    for (const standing of standings) standing.winner = compare(standing, standings[0]!) === 0;
  return { standings, finished };
}

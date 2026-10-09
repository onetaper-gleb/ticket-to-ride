import { useEffect, useMemo, useState } from 'react';
import {
  getClaimOptions,
  getLegalCommands,
  getStationOptions,
  getTicketProgress,
  getTunnelPaymentOptions,
  isRouteAvailable,
} from '../core';
import type {
  AppProps,
  BotDifficulty,
  Card,
  CardColor,
  GameCommand,
  Observation,
  Ticket,
} from '../shared/types';
import Diorama, { type MapSelection } from '../scene/Diorama';
import type { TableControl, TableInteraction, TableView } from '../scene/interaction';
import TutorialOverlay, { TutorialWelcome } from './TutorialOverlay';
import { getTutorialLesson } from './tutorial';
import { paymentMatches } from './payment';
import { ROUTE_POINTS } from '../data/europe';
import './styles.css';

const welcomeKey = 'europe-onboarding-v1';
function firstLaunch() {
  try {
    return !localStorage.getItem(welcomeKey);
  } catch {
    return true;
  }
}
function rememberWelcome(value: 'seen' | 'complete') {
  try {
    localStorage.setItem(welcomeKey, value);
  } catch {
    /* Browser storage is optional. */
  }
}
const colorNames: Record<CardColor | 'gray', string> = {
  red: 'Красный',
  blue: 'Синий',
  yellow: 'Жёлтый',
  green: 'Зелёный',
  orange: 'Оранжевый',
  purple: 'Розовый',
  black: 'Чёрный',
  white: 'Белый',
  wild: 'Локомотив',
  gray: 'Любой один цвет',
};
const colorSymbols: Record<CardColor | 'gray', string> = {
  red: '◆',
  blue: '●',
  yellow: '■',
  green: '▲',
  orange: '⬟',
  purple: '✿',
  black: '♠',
  white: '□',
  wild: '✦',
  gray: '◇',
};
const phaseNames = {
  setup: 'Выберите билеты',
  action: 'Ваш ход',
  draw: 'Возьмите вторую карту',
  tickets: 'Оставьте новые билеты',
  tunnel: 'Доплата за тоннель',
  finished: 'Итоги партии',
};
const rulesPages = [
  {
    title: 'Цель и ход',
    lines: [
      'Соединяйте города из своих билетов своей сетью.',
      'За ход: взять карты, занять маршрут, взять билеты или построить станцию.',
      'Выполненный билет даёт его очки, невыполненный вычитает.',
      'Ход заканчивается сразу после выбранного действия.',
    ],
  },
  {
    title: 'Карты вагонов',
    lines: [
      'В начале: 4 карты, 45 вагонов и 3 станции.',
      'Добор: две открытые или закрытые карты в любой комбинации.',
      'Открытый локомотив занимает весь добор; вторым его брать нельзя.',
      'Локомотив вслепую — обычный выбор. Лимита руки нет.',
      'Если открыты 3 локомотива, все 5 карт рынка заменяются.',
    ],
  },
  {
    title: 'Занять маршрут',
    lines: [
      'Цена: по карте на клетку, одним цветом линии.',
      'Серую линию оплачивают любым одним цветом; локомотив заменяет цвет.',
      'Очки за длину 1/2/3/4/6/8: 1/2/4/7/15/21.',
      'В 2–3 игрока доступна одна из двойных линий. Свою пару занимать нельзя.',
    ],
  },
  {
    title: 'Тоннели и паромы',
    lines: [
      'Для парома нужны локомотивы: столько, сколько значков на линии.',
      'Тоннель: после базовой оплаты открываются 3 карты.',
      'Каждый совпавший цвет или локомотив добавляет 1 к цене.',
      'Доплатите тем же цветом или откажитесь: карты вернутся, ход потрачен.',
    ],
  },
  {
    title: 'Билеты и станции',
    lines: [
      'В начале оставьте не меньше 2 билетов из 4.',
      'Позже: взять до 3 билетов и оставить не меньше 1.',
      'Станции стоят 1, затем 2, затем 3 карты одного цвета.',
      'Станция использует 1 чужой участок для билетов. Неиспользованная станция: +4.',
    ],
  },
  {
    title: 'Конец и управление',
    lines: [
      'Когда у игрока остаётся 0–2 вагона, каждый получает последний ход.',
      'Самый длинный непрерывный путь: +10. Чужие линии сюда не входят.',
      'Пробел: приблизить поле с курсором; повторный пробел: вернуться.',
      'За столом двигайте мышь в зону и между предметами. ЛКМ выбирает.',
    ],
  },
];

function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="rules-dialog europe-rules"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <span className="eyebrow">Классическая Europe</span>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть правила">
            ×
          </button>
        </div>
        <h2 id="rules-title">Ticket to Ride: Europe</h2>
        <p>
          Собирайте карты вагонов и занимайте маршруты. Побеждает игрок с наибольшим числом очков
          после подсчёта билетов.
        </p>
        <div className="europe-rules-grid">
          {rulesPages.map((page) => (
            <section key={page.title}>
              <h3>{page.title}</h3>
              <ul>
                {page.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="muted">
          Станция учитывает один выбранный чужой участок одинаково для всех ваших билетов. Она не
          приносит очки за чужой участок и не удлиняет ваш путь. При равном счёте выигрывает игрок с
          большим числом выполненных билетов, затем сохранённых станций, затем обладатель European
          Express.
        </p>
        <button className="button primary full" onClick={onClose}>
          Вернуться к игре <span>→</span>
        </button>
      </section>
    </div>
  );
}

function Menu(props: AppProps & { onRules: () => void }) {
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4 | 5>(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>(props.difficulty);
  const [name, setName] = useState('Вы');
  const [seed, setSeed] = useState('');
  return (
    <main className="menu">
      <header className="menu-nav">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            Ⅱ
          </span>
          Ticket to Ride: Europe
        </span>
        <button className="quiet-button" onClick={props.onRules}>
          Правила
        </button>
      </header>
      <div className="menu-content">
        <section className="menu-intro">
          <span className="eyebrow">Европа / Железные дороги</span>
          <h1>Соедините Европу</h1>
          <p>
            Занимайте маршруты и соединяйте города из своих билетов. Соперники могут занять нужную
            вам дорогу первыми.
          </p>
          <div className="menu-board" aria-hidden="true">
            <div className="menu-board-paper">
              <span className="board-stamp">
                EUROPE
                <br />
                <small>ЖЕЛЕЗНОДОРОЖНАЯ КАРТА</small>
              </span>
              <div className="board-rail rail-one" />
              <div className="board-rail rail-two" />
              <div className="board-rail rail-three" />
              <i className="board-stop stop-one" />
              <i className="board-stop stop-two" />
              <i className="board-stop stop-three" />
              <i className="board-stop stop-four" />
              <div className="board-train train-one">
                <i />
                <i />
              </div>
              <div className="board-train train-two">
                <i />
                <i />
              </div>
            </div>
            <div className="menu-paper-card card-back-one">
              Ⅱ<small>ВАГОНЫ</small>
            </div>
            <div className="menu-paper-card card-back-two">
              ◆<small>БИЛЕТЫ</small>
            </div>
            <span className="board-caption">Ваши линии. Ваши билеты. Общая карта.</span>
          </div>
          <div className="menu-features">
            <span>2–5 игроков</span>
            <span>45 вагонов</span>
            <span>Тоннели и паромы</span>
          </div>
        </section>
        <section className="start-panel">
          <div className="section-heading">
            <span className="eyebrow">Новая партия</span>
            <span className="muted">Соло с ботами</span>
          </div>
          <h2>Ваше место за столом</h2>
          <label className="field-label" htmlFor="player-name">
            Имя
          </label>
          <input
            id="player-name"
            maxLength={24}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Вы"
          />
          <span className="field-label" id="players-label">
            Всего игроков
          </span>
          <div className="segmented" role="group" aria-labelledby="players-label">
            {([2, 3, 4, 5] as const).map((count) => (
              <button
                key={count}
                className={playerCount === count ? 'active' : ''}
                onClick={() => setPlayerCount(count)}
              >
                {count}
                <small>
                  {count - 1} {count === 2 ? 'бот' : 'бота'}
                </small>
              </button>
            ))}
          </div>
          <span className="field-label" id="difficulty-label">
            Соперники
          </span>
          <div className="segmented two" role="group" aria-labelledby="difficulty-label">
            <button
              className={difficulty === 'easy' ? 'active' : ''}
              onClick={() => setDifficulty('easy')}
            >
              Лёгкие<small>Для первой партии</small>
            </button>
            <button
              className={difficulty === 'normal' ? 'active' : ''}
              onClick={() => setDifficulty('normal')}
            >
              Обычные<small>Строят сеть по билетам</small>
            </button>
          </div>
          <details className="seed-detail">
            <summary>
              Код партии <span>необязательно</span>
            </summary>
            <input
              aria-label="Код партии"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder="Одинаковый код — одинаковая раздача"
              maxLength={64}
            />
            <p className="muted">
              Пустой код — новая случайная раздача карт и билетов. Карта Европы остаётся той же.
            </p>
          </details>
          <button
            className="button primary full start-button"
            onClick={() =>
              props.onStart(
                {
                  playerCount,
                  playerName: name.trim() || 'Вы',
                  ...(seed.trim() ? { seed: seed.trim() } : {}),
                },
                difficulty,
              )
            }
          >
            Начать партию <span>→</span>
          </button>
          <button
            className="button secondary full"
            onClick={props.canContinueTutorial ? props.onContinueTutorial : props.onStartTutorial}
          >
            {props.canContinueTutorial ? 'Продолжить обучение' : 'Пройти обучение'} <span>→</span>
          </button>
          <p className="muted">
            Выберем билеты и займём первый маршрут. Обычная партия сохраняется отдельно.
          </p>
          {props.canContinue && (
            <button className="button secondary full" onClick={props.onContinue}>
              Продолжить сохранённую партию
            </button>
          )}
          <p className="start-note">
            <span className="status-dot" />
            Сохраняется автоматически на этом устройстве
          </p>
        </section>
      </div>
      <footer className="menu-footer">
        <span>Классическая карта Europe</span>
        <span>Настольная стратегия · соло</span>
      </footer>
      {props.error && (
        <div className="toast" role="alert">
          {props.error}
          <button onClick={props.onClearError} aria-label="Закрыть сообщение">
            ×
          </button>
        </div>
      )}
    </main>
  );
}

function paymentLabel(cardIds: string[], hand: Card[]) {
  const counts = new Map<CardColor, number>();
  for (const id of cardIds) {
    const card = hand.find((item) => item.id === id);
    if (card) counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
  }
  return (
    [...counts].map(([color, count]) => `${colorNames[color]} × ${count}`).join(' + ') ||
    'Карты не выбраны'
  );
}
function cityName(observation: Observation, id: string) {
  return observation.cities.find((city) => city.id === id)?.name ?? id;
}
function ticketName(observation: Observation, ticket: Ticket) {
  return `${cityName(observation, ticket.a)} — ${cityName(observation, ticket.b)}`;
}

export default function App(props: AppProps) {
  const observation = props.observation;
  const [rules, setRules] = useState(false);
  const [rulesPage, setRulesPage] = useState(0);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [topView, setTopView] = useState(false);
  const [ticketIds, setTicketIds] = useState<string[]>([]);
  const [inspectedTicket, setInspectedTicket] = useState<string | null>(null);
  const [inspectedCard, setInspectedCard] = useState<CardColor | null>(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const [manualPayment, setManualPayment] = useState<string[] | null>(null);
  const [feedback, setFeedback] = useState('');
  const [welcome, setWelcome] = useState(firstLaunch);
  const [tutorialHidden, setTutorialHidden] = useState(false);
  const [cueRequest, setCueRequest] = useState({ key: '', nonce: 0 });
  const legal = useMemo(() => (observation ? getLegalCommands(observation) : []), [observation]);
  const progress = useMemo(
    () =>
      observation
        ? getTicketProgress(observation, observation.self.id, observation.self.tickets)
        : [],
    [observation],
  );
  const ownTurn = !!observation && observation.activePlayer === observation.self.id && !props.busy;
  const can = (command: GameCommand) =>
    ownTurn && legal.some((item) => JSON.stringify(item) === JSON.stringify(command));
  const lessonBase =
    props.tutorial && observation && !tutorialHidden ? getTutorialLesson(observation) : null;
  useEffect(() => {
    if (lessonBase?.complete) rememberWelcome('complete');
  }, [lessonBase?.complete]);
  useEffect(() => {
    setSelection(null);
    setTicketIds([]);
    setInspectedTicket(null);
    setInspectedCard(null);
    setOptionIndex(0);
    setManualPayment(null);
    setFeedback('');
    setRules(false);
    setRulesPage(0);
    setTopView(false);
    setTutorialHidden(false);
    setCueRequest({ key: '', nonce: 0 });
  }, [props.sessionId]);
  useEffect(() => {
    setSelection(null);
    setInspectedCard(null);
    setManualPayment(null);
    setOptionIndex(0);
    setFeedback('');
  }, [observation?.activePlayer, observation?.turn]);
  useEffect(() => {
    setTicketIds([]);
    if (['draw', 'tickets', 'tunnel'].includes(observation?.phase ?? '')) setRules(false);
  }, [observation?.phase]);
  if (!observation)
    return (
      <>
        <Menu {...props} onRules={() => setRules(true)} />
        {rules && <Rules onClose={() => setRules(false)} />}
        {welcome && (
          <TutorialWelcome
            onStart={() => {
              setWelcome(false);
              rememberWelcome('seen');
              props.onStartTutorial();
            }}
            onDismiss={() => {
              setWelcome(false);
              rememberWelcome('seen');
            }}
          />
        )}
      </>
    );

  const phase = observation.phase;
  const choosingTickets =
    (phase === 'setup' || phase === 'tickets') && observation.self.ticketOptions.length > 0;
  const edge =
    selection?.kind === 'edge' ? observation.edges.find((item) => item.id === selection.id) : null;
  const city =
    selection?.kind === 'station'
      ? observation.cities.find((item) => item.id === selection.id)
      : null;
  const paymentOptions =
    phase === 'tunnel'
      ? getTunnelPaymentOptions(observation)
      : edge
        ? getClaimOptions(observation, edge.id)
        : city
          ? getStationOptions(observation, city.id)
          : [];
  const option = paymentOptions[optionIndex % Math.max(1, paymentOptions.length)];
  const paying = ownTurn && (phase === 'tunnel' || (phase === 'action' && !!(edge || city)));
  const paymentIds = paying ? (manualPayment ?? option?.cardIds ?? []) : [];
  const paymentValid = paying && paymentMatches(paymentIds, paymentOptions, observation.self.hand);
  const clear = () => {
    setSelection(null);
    setInspectedTicket(null);
    setInspectedCard(null);
    setOptionIndex(0);
    setManualPayment(null);
    setFeedback('');
  };
  const send = (command: GameCommand) => {
    if (!ownTurn) return;
    setFeedback('');
    props.onClearError();
    props.onCommand(command);
  };
  const controls: TableControl[] = [];
  let headline = phaseNames[phase];
  let notice = '';
  let detailLines: string[] = [];
  let highlightedCities: string[] = [];
  const addPaymentControls = (confirmId: string, confirmLabel: string) => {
    if (paymentOptions.length > 1)
      controls.push({ id: 'paymentOption', label: 'Другая оплата', enabled: ownTurn });
    if (manualPayment !== null)
      controls.push({ id: 'autoPayment', label: 'Автооплата', enabled: ownTurn });
    controls.push({ id: confirmId, label: confirmLabel, enabled: paymentValid });
  };
  if (!ownTurn && phase !== 'finished') {
    headline =
      observation.players.find((player) => player.id === observation.activePlayer)?.name ??
      'Соперник';
    notice = 'Сейчас ходит соперник. Можно осмотреть поле и билеты.';
    detailLines = [
      observation.events.at(-1)?.message ?? 'Ожидаем ход.',
      `У вас ${observation.self.trainsRemaining} вагонов и ${observation.self.hand.length} карт.`,
    ];
  } else if (choosingTickets) {
    const minimum = phase === 'setup' ? 2 : 1;
    notice = `Оставьте не меньше ${minimum} билетов. Выбрано ${ticketIds.length}.`;
    detailLines = [
      'Билет: соединить оба города своей сетью к концу партии.',
      'Выполнен: +очки. Не выполнен: −очки.',
      phase === 'setup'
        ? 'Можно оставить все четыре. Отклонённые билеты уходят из партии.'
        : 'Можно оставить все три. Остальные уйдут вниз колоды.',
    ];
    controls.push({
      id: 'acceptTickets',
      label: 'Оставить билеты',
      enabled: ticketIds.length >= minimum && ownTurn,
    });
  } else if (phase === 'draw') {
    notice = 'Возьмите вторую карту вагонов слева.';
    detailLines = [
      'Подходит открытая цветная карта или закрытая колода.',
      'Второй открытый локомотив брать нельзя.',
      'После добора ход автоматически перейдёт сопернику.',
    ];
  } else if (phase === 'tunnel') {
    const tunnel = observation.pendingTunnel;
    headline = tunnel
      ? `Тоннель: ${cityName(observation, observation.edges.find((item) => item.id === tunnel.edgeId)?.a ?? '')} — ${cityName(observation, observation.edges.find((item) => item.id === tunnel.edgeId)?.b ?? '')}`
      : 'Доплата за тоннель';
    notice = `Доплата: ${tunnel?.extraCost ?? 0} карт. ${manualPayment !== null && !paymentValid ? 'Выбранные карты не подходят.' : `Выбрано: ${paymentLabel(paymentIds, observation.self.hand)}.`}`;
    detailLines = [
      `Открыты: ${tunnel?.revealed.map((card) => `${colorNames[card.color]} ${colorSymbols[card.color]}`).join(', ') ?? '—'}.`,
      `Оплата тем же цветом: ${colorNames[tunnel?.color ?? 'wild']}.`,
      'Отказ вернёт базовые карты, но завершит ход.',
    ];
    addPaymentControls('payTunnel', 'Доплатить');
    controls.push({
      id: 'declineTunnel',
      label: 'Отказаться',
      enabled: can({ type: 'resolveTunnel', pay: false }),
    });
  } else if (phase === 'action' && edge) {
    headline = `${cityName(observation, edge.a)} — ${cityName(observation, edge.b)}`;
    const owner = observation.players.find((player) => player.id === edge.owner);
    const otherParallel = edge.parallel
      ? observation.edges.find(
          (item) => item.id !== edge.id && item.parallel === edge.parallel && item.owner !== null,
        )
      : null;
    const reason = owner
      ? `Маршрут принадлежит: ${owner.name}.`
      : !isRouteAvailable(observation, edge.id)
        ? otherParallel?.owner === observation.self.id
          ? 'Вы уже заняли парную линию. Обе линии одному игроку занимать нельзя.'
          : 'Парная линия занята. В партии 2–3 игроков вторая линия закрыта.'
        : observation.self.trainsRemaining < edge.length
          ? `Не хватает вагонов: нужно ${edge.length}, осталось ${observation.self.trainsRemaining}.`
          : observation.self.hand.filter((card) => card.color === 'wild').length < edge.ferries
            ? `Для парома нужно не меньше ${edge.ferries} локомотивов.`
            : 'Не хватает карт одного цвета для полной оплаты.';
    notice =
      owner || !paymentOptions.length
        ? reason
        : manualPayment !== null && !paymentValid
          ? `Этот набор не подходит. Выберите ${edge.length} карт нужного цвета или верните автооплату.`
          : `Оплата: ${paymentLabel(paymentIds, observation.self.hand)}.`;
    detailLines = [
      `${colorNames[edge.color]} ${colorSymbols[edge.color]} · ${edge.length} карт и вагонов · ${ROUTE_POINTS[edge.length] ?? edge.length} очков.`,
      edge.tunnel
        ? 'Тоннель: после оплаты возможна доплата 0–3 карты.'
        : edge.ferries
          ? `Паром: в оплате не меньше ${edge.ferries} локомотивов.`
          : 'Обычный маршрут: оплата завершит ход.',
      'Нижняя зона: выбирайте карты вручную. Локомотив заменяет цвет.',
      `Осталось вагонов: ${observation.self.trainsRemaining}.`,
    ];
    highlightedCities = [edge.a, edge.b];
    if (!owner)
      addPaymentControls('claimRoute', edge.tunnel ? 'Попытка тоннеля' : 'Занять маршрут');
    controls.push({ id: 'cancel', label: 'Закрыть маршрут', enabled: true });
  } else if (phase === 'action' && city) {
    headline = city.name;
    const stationOwner = observation.players.find((player) => player.stations.includes(city.id));
    const cost = 4 - observation.self.stationsRemaining;
    notice = stationOwner
      ? `Станция игрока: ${stationOwner.name}.`
      : manualPayment !== null && !paymentValid
        ? `Этот набор не подходит. Нужны ${cost} карт одного цвета или локомотивы.`
        : `Станция стоит ${cost} карт одного цвета.`;
    detailLines = [
      'Станция позволяет использовать 1 соседний чужой участок для билетов.',
      'Свой путь и очки за маршруты она не увеличивает.',
      `Каждая сохранённая станция: +4 в конце. Осталось: ${observation.self.stationsRemaining}.`,
      paymentOptions.length
        ? `Оплата: ${paymentLabel(paymentIds, observation.self.hand)}.`
        : 'Для станции нужны свободный город и карты одного цвета.',
    ];
    if (!stationOwner && observation.self.stationsRemaining > 0)
      addPaymentControls('buildStation', 'Построить станцию');
    controls.push({ id: 'cancel', label: 'Закрыть город', enabled: true });
  } else if (phase === 'action') {
    notice = 'За ход выберите одно действие.';
    detailLines = [
      'Слева: взять две карты вагонов или один открытый локомотив.',
      'Пробел: поле. Колесо: масштаб. Перетаскивание: сдвиг карты.',
      'Новые билеты: взять три и оставить не меньше одного.',
      `У вас ${observation.self.trainsRemaining} вагонов. Билетов: ${observation.self.tickets.length}.`,
    ];
  } else if (phase === 'finished') {
    const standings = props.result?.standings ?? [];
    const self = standings.find((standing) => standing.playerId === observation.self.id);
    headline = self?.winner ? 'Вы победили' : 'Партия завершена';
    notice = standings
      .map((standing) => `${standing.winner ? 'Победа · ' : ''}${standing.name}: ${standing.score}`)
      .join(' / ');
    detailLines = self
      ? [
          `Ваши маршруты: ${self.routeScore} · билеты: ${self.ticketScore}.`,
          `Станции: +${self.stationScore} · European Express: +${self.expressScore}.`,
          `Выполнено билетов: ${self.completedTickets}/${self.totalTickets}.`,
          `Самый длинный путь: ${self.longestPath} вагонов.`,
        ]
      : [];
    controls.push({ id: 'newGame', label: 'Новая партия', enabled: true });
  }
  const ticket = observation.self.tickets.find((item) => item.id === inspectedTicket);
  if (!rules && ticket && !['setup', 'tickets', 'draw', 'tunnel'].includes(phase)) {
    const complete = progress.find((item) => item.ticket.id === ticket.id)?.complete ?? false;
    headline = ticketName(observation, ticket);
    notice = complete
      ? `Билет соединён: +${ticket.points} в конце партии.`
      : `Соедините города. В конце: +${ticket.points} или −${ticket.points}.`;
    detailLines = [
      'Оба города должны соединяться вашей непрерывной сетью.',
      'Станция может добавить один чужой участок для билетов.',
      'Выбранный билет нельзя вернуть. Очки за него считаются в конце.',
    ];
    highlightedCities = [ticket.a, ticket.b];
    controls.length = 0;
    controls.push({ id: 'cancel', label: 'Закрыть билет', enabled: true });
    if (phase === 'finished')
      controls.push({ id: 'newGame', label: 'Новая партия', enabled: true });
  }
  if (
    !rules &&
    inspectedCard &&
    !['setup', 'tickets', 'draw', 'tunnel', 'finished'].includes(phase) &&
    !edge &&
    !city
  ) {
    headline = `${colorNames[inspectedCard]} ${colorSymbols[inspectedCard]}`;
    notice =
      inspectedCard === 'wild'
        ? 'Локомотив заменяет карту любого цвета.'
        : 'Карта оплачивает одну клетку маршрута своего цвета.';
    detailLines = [
      'Серую линию оплачивают любым одним цветом.',
      'Весь маршрут занимают за один ход и одну оплату.',
      'В руке можно хранить любое число карт.',
    ];
    controls.push({ id: 'cancel', label: 'Закрыть карту', enabled: true });
  }
  if (rules) {
    const page = rulesPages[rulesPage]!;
    headline = page.title;
    notice = `Памятка · лист ${rulesPage + 1}/${rulesPages.length}`;
    detailLines = page.lines;
    controls.length = 0;
    controls.push({
      id: 'rulesPage',
      label: rulesPage === rulesPages.length - 1 ? 'Первый лист' : 'Следующий лист',
      enabled: true,
    });
    if (!props.tutorial) controls.push({ id: 'tutorial', label: 'Пройти обучение', enabled: true });
  }
  if (!rules && ownTurn && phase === 'action') {
    controls.push({
      id: 'drawTickets',
      label: 'Взять билеты',
      enabled: can({ type: 'drawTickets' }),
      placement: 'bell',
    });
    if (can({ type: 'pass' }))
      controls.push({
        id: 'pass',
        label: 'Нет ходов: пропустить',
        enabled: true,
        placement: 'bell',
      });
  }
  if (feedback && !['draw', 'tickets', 'setup', 'tunnel'].includes(phase)) notice = feedback;
  if (props.error) {
    notice = props.error;
    controls.push({ id: 'clearError', label: 'Понятно', enabled: true });
  }
  if (observation.finalTurnsRemaining !== null && phase !== 'finished' && detailLines.length < 5)
    detailLines.push(`Последние ходы: ${observation.finalTurnsRemaining}.`);
  controls.push(
    {
      id: 'plan',
      label: topView ? 'За стол · Пробел' : 'Поле · Пробел',
      enabled: true,
      placement: 'dock',
    },
    {
      id: 'rules',
      label: rules ? 'Закрыть памятку' : 'Памятка',
      enabled: !ownTurn || !['draw', 'tickets', 'tunnel'].includes(phase),
      placement: 'dock',
    },
    { id: 'menu', label: 'Меню · Esc', enabled: true, placement: 'dock' },
  );
  const shownTickets = choosingTickets ? observation.self.ticketOptions : observation.self.tickets;
  const view: TableView = {
    headline,
    notice,
    detailLines,
    controls,
    goals: shownTickets.map((item) => ({
      id: item.id,
      label: ticketName(observation, item),
      progress: choosingTickets
        ? `${item.long ? 'Длинный · ' : ''}В конце +${item.points} / −${item.points}`
        : progress.find((value) => value.ticket.id === item.id)?.complete
          ? `Соединён · +${item.points} в конце`
          : `Соединить · +${item.points} / −${item.points}`,
      selected: choosingTickets ? ticketIds.includes(item.id) : inspectedTicket === item.id,
      enabled: choosingTickets ? ownTurn : true,
      completed:
        !choosingTickets && progress.find((value) => value.ticket.id === item.id)?.complete,
      points: item.points,
      long: item.long,
    })),
    routeStationIds: highlightedCities,
    enabledMarketIndices: observation.market.flatMap((_, index) =>
      can({ type: 'draw', source: index }) ? [index] : [],
    ),
    deckEnabled: can({ type: 'draw', source: 'deck' }),
    enabledEdgeIds: [
      ...new Set(
        legal.flatMap((command) => (ownTurn && command.type === 'claim' ? [command.edgeId] : [])),
      ),
    ],
    selectedCardIds: paymentIds,
    revealedCards: observation.pendingTunnel?.revealed,
  };
  const interact = (intent: TableInteraction) => {
    if (intent.kind !== 'control') setRules(false);
    if (intent.kind === 'control') {
      if (!view.controls.some((control) => control.id === intent.id && control.enabled)) return;
      switch (intent.id) {
        case 'menu':
          props.onMenu();
          return;
        case 'plan':
          setTopView((value) => !value);
          return;
        case 'rules':
          setRules((value) => !value);
          setRulesPage(0);
          return;
        case 'rulesPage':
          setRulesPage((value) => (value + 1) % rulesPages.length);
          return;
        case 'tutorial':
          props.onStartTutorial();
          return;
        case 'clearError':
          props.onClearError();
          return;
        case 'newGame':
          props.onStart(
            {
              playerCount: observation.playerCount as 2 | 3 | 4 | 5,
              playerName: observation.self.name,
            },
            props.difficulty,
          );
          clear();
          return;
        case 'cancel':
          clear();
          return;
        case 'paymentOption':
          setOptionIndex((value) => value + 1);
          setManualPayment(null);
          return;
        case 'autoPayment':
          setManualPayment(null);
          return;
        case 'acceptTickets': {
          const ids = observation.self.ticketOptions
            .filter((item) => ticketIds.includes(item.id))
            .map((item) => item.id);
          send({ type: 'chooseTickets', ticketIds: ids });
          setTicketIds([]);
          return;
        }
        case 'drawTickets':
          if (can({ type: 'drawTickets' })) {
            clear();
            send({ type: 'drawTickets' });
          }
          return;
        case 'pass':
          if (can({ type: 'pass' })) {
            clear();
            send({ type: 'pass' });
          }
          return;
        case 'claimRoute':
          if (edge && paymentValid) {
            send({ type: 'claim', edgeId: edge.id, cardIds: paymentIds });
            clear();
          }
          return;
        case 'buildStation':
          if (city && paymentValid) {
            send({ type: 'buildStation', cityId: city.id, cardIds: paymentIds });
            clear();
          }
          return;
        case 'payTunnel':
          if (paymentValid) {
            send({ type: 'resolveTunnel', pay: true, cardIds: paymentIds });
            clear();
          }
          return;
        case 'declineTunnel':
          send({ type: 'resolveTunnel', pay: false });
          clear();
          return;
      }
      return;
    }
    if (intent.kind === 'objective') {
      if (choosingTickets && ownTurn) {
        if (!observation.self.ticketOptions.some((item) => item.id === intent.id)) return;
        setTicketIds((current) =>
          current.includes(intent.id)
            ? current.filter((id) => id !== intent.id)
            : [...current, intent.id],
        );
      } else if (observation.self.tickets.some((item) => item.id === intent.id)) {
        clear();
        setInspectedTicket(intent.id);
      }
      return;
    }
    if (intent.kind === 'deck' || intent.kind === 'market') {
      const command: GameCommand = {
        type: 'draw',
        source: intent.kind === 'deck' ? 'deck' : Number(intent.id),
      };
      if (can(command)) {
        clear();
        send(command);
      }
      return;
    }
    if (intent.kind === 'card') {
      const card = observation.self.hand.find((item) => item.id === intent.id);
      if (!card) return;
      if (paying) {
        setInspectedCard(null);
        setManualPayment((current) => {
          const ids = current ?? option?.cardIds ?? [];
          return ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id];
        });
      } else if (!['setup', 'tickets', 'draw', 'tunnel'].includes(phase)) {
        clear();
        setInspectedCard(card.color);
      }
      return;
    }
    if (intent.kind === 'edge' || intent.kind === 'station') {
      setSelection({ kind: intent.kind, id: intent.id });
      setInspectedTicket(null);
      setInspectedCard(null);
      setOptionIndex(0);
      setManualPayment(null);
      setFeedback('');
      return;
    }
  };
  let lesson = lessonBase;
  if (lesson && choosingTickets && ticketIds.length >= (phase === 'setup' ? 2 : 1))
    lesson = {
      ...lesson,
      action: 'Билеты отмечены. Нажмите «Оставить билеты» на листе справа.',
      focus: 'paper',
      target: { kind: 'control', id: 'acceptTickets' },
    };
  if (lesson?.id === 'claim-first-route' && edge && ownTurn && phase === 'action')
    lesson = {
      ...lesson,
      action: topView
        ? 'Маршрут выбран. Нажмите пробел к столу. На листе справа проверьте оплату и подтвердите маршрут.'
        : paymentOptions.length
          ? 'На листе справа нажмите «Занять маршрут» или «Попытка тоннеля». Выделенные карты уйдут в оплату.'
          : 'На выбранный участок карт не хватает. Выберите другой участок или доберите карты.',
      focus: 'paper',
      target: { kind: 'control', id: 'claimRoute' },
    };
  const lessonKey = lesson
    ? `${props.sessionId}:${lesson.id}:${lesson.target?.kind}:${lesson.target?.id}`
    : '';
  const requested = cueRequest.key === lessonKey;
  const guidance =
    lesson?.target && (lesson.focus !== 'board' || topView || requested)
      ? { key: `${lessonKey}:${requested ? cueRequest.nonce : 0}`, target: lesson.target }
      : undefined;
  return (
    <main className={`game-shell world-only phase-${phase}`}>
      <div className="table-scene">
        <Diorama
          observation={observation}
          selection={selection}
          view={view}
          onInteract={interact}
          topView={topView}
          onBoardModeChange={setTopView}
          reset={props.sessionId}
          guidance={guidance}
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {headline}. {notice}
      </p>
      {lesson && (
        <TutorialOverlay
          lesson={lesson}
          onShow={() => {
            setRules(false);
            setCueRequest({ key: lessonKey, nonce: cueRequest.nonce + 1 });
          }}
          onSkip={props.onMenu}
          onFinish={() => setTutorialHidden(true)}
          onRestart={props.onStartTutorial}
        />
      )}
    </main>
  );
}

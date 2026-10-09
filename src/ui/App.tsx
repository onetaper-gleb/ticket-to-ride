import { useEffect, useMemo, useState } from 'react';
import { getLegalCommands, previewOrder } from '../core';
import type {
  AppProps,
  BotDifficulty,
  CardColor,
  District,
  GameCommand,
  TrainOrder,
} from '../shared/types';
import Diorama, { type MapSelection } from '../scene/Diorama';
import type { TableControl, TableInteraction, TableView } from '../scene/interaction';
import './styles.css';

const districtNames: Record<District, string> = {
  harbor: 'Порт',
  'old-town': 'Старый город',
  industrial: 'Промзона',
  garden: 'Сады',
};
const districtIcons: Record<District, string> = {
  harbor: '01',
  'old-town': '02',
  industrial: '03',
  garden: '04',
};
const colorNames: Record<CardColor | 'gray', string> = {
  red: 'Красные',
  blue: 'Синие',
  green: 'Зелёные',
  yellow: 'Жёлтые',
  wild: 'Универсальные',
  gray: 'Любой один цвет',
};
const colorSymbols: Record<CardColor | 'gray', string> = {
  red: '◆',
  blue: '●',
  green: '▲',
  yellow: '■',
  wild: '✦',
  gray: '◇',
};
const phaseNames = {
  setup: 'Выберите задания',
  action: 'Основное действие',
  draw: 'Второй материал',
  discard: 'Сбросьте излишек',
  orders: 'Назначьте рейсы',
  finished: 'Операция завершена',
};
const Waves = [6, 8, 10, 12];
const trainNumber = (id: string) => id.match(/t(\d+)$/)?.[1] ?? id;
const isSame = (a: GameCommand, b: GameCommand) => JSON.stringify(a) === JSON.stringify(b);

function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="rules-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-heading">
          <span className="eyebrow">Памятка диспетчера</span>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть правила">
            ×
          </button>
        </div>
        <h2 id="rules-title">Памятка диспетчера</h2>
        <p>
          Речной уходит под воду. Восстанавливайте железную дорогу и доставляйте группы жителей в
          два убежища. Линиями пользуются все бригады.
        </p>
        <ol className="rules-steps">
          <li>
            <b>Одно действие за ход.</b> Возьмите две карты, восстановите одну линию, купите
            экспресс за любые две карты или пропустите.
          </li>
          <li>
            <b>Затем отдайте приказы.</b> Для каждого поезда выберите станцию и убежище. Приказы
            бесплатны. Нажмите «Закончить ход».
          </li>
          <li>
            <b>Поезда едут после всех ходов.</b> Один участок за раунд, два у экспресса. Погрузка и
            выгрузка завершают движение. Вместимость — две группы.
          </li>
          <li>
            <b>Волна приходит в конце раунда.</b> После 6, 8, 10 и 12 закрываются отмеченные
            станции. Поезд на затопленной станции потерян до конца партии. После погрузки нельзя
            сразу уехать: следите за прогнозом.
          </li>
        </ol>
        <div className="rules-score">
          <span>
            <b>2</b> за группу
          </span>
          <span>
            <b>3</b> за приоритетную
          </span>
          <span>
            <b>+3</b> за задание района
          </span>
          <span>
            <b>+1</b> за полезный ремонт*
          </span>
        </div>
        <p className="muted">
          * После доставки по восстановленной вами линии; максимум 4 очка за ремонт. Задание:
          доставить две группы из указанного района. При равных очках важны количество доставленных
          и приоритетных групп.
        </p>
        <p className="muted">
          Открытая универсальная карта заменяет весь добор. Универсальная вслепую — обычная карта.
          Не больше 10 карт в руке. Рискованный рейс требует подтверждения; очередь жителей не
          резервируется.
        </p>
        <button className="button primary full" onClick={onClose}>
          Вернуться к игре <span>→</span>
        </button>
      </section>
    </div>
  );
}

function Menu(props: AppProps & { onRules: () => void }) {
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>(props.difficulty);
  const [name, setName] = useState('Ваша бригада');
  const [seed, setSeed] = useState('');
  return (
    <main className="menu">
      <header className="menu-nav">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            Ⅱ
          </span>
          Последний рейс
        </span>
        <button className="quiet-button" onClick={props.onRules}>
          Правила
        </button>
      </header>
      <div className="menu-content">
        <section className="menu-intro">
          <span className="eyebrow">Речной / Диспетчерская</span>
          <h1>Последний рейс</h1>
          <p>Восстанавливайте пути. Отправляйте поезда. Вывозите жителей до следующей волны.</p>
          <div className="menu-board" aria-hidden="true">
            <div className="menu-board-paper">
              <span className="board-stamp">
                РЕЧНОЙ
                <br />
                <small>ЖЕЛЕЗНОДОРОЖНАЯ СХЕМА</small>
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
              Ⅱ<small>МАТЕРИАЛЫ</small>
            </div>
            <div className="menu-paper-card card-back-two">
              ◆<small>РЕМОНТ</small>
            </div>
            <span className="board-caption">Два поезда. Общая железная дорога.</span>
          </div>
          <div className="menu-features">
            <span>2–4 бригады</span>
            <span>12 раундов</span>
            <span>4 волны</span>
          </div>
        </section>
        <section className="start-panel">
          <div className="section-heading">
            <span className="eyebrow">Новая партия</span>
            <span className="muted">Соло с ботами</span>
          </div>
          <h2>Ваша бригада</h2>
          <label className="field-label" htmlFor="brigade-name">
            Название
          </label>
          <input
            id="brigade-name"
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваша бригада"
          />
          <label className="field-label">Всего бригад</label>
          <div className="segmented">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                className={playerCount === n ? 'active' : ''}
                onClick={() => setPlayerCount(n)}
              >
                {n}
                <small>
                  {n - 1} {n === 2 ? 'бот' : 'бота'}
                </small>
              </button>
            ))}
          </div>
          <label className="field-label">Соперники</label>
          <div className="segmented two">
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
              Обычные<small>Планируют рейсы</small>
            </button>
          </div>
          <details className="seed-detail">
            <summary>
              Код партии <span>необязательно</span>
            </summary>
            <input
              aria-label="Код партии"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="Одинаковый код — одинаковая раздача"
              maxLength={64}
            />
          </details>
          <button
            className="button primary full start-button"
            onClick={() =>
              props.onStart(
                {
                  playerCount,
                  playerName: name.trim() || 'Ваша бригада',
                  ...(seed.trim() ? { seed: seed.trim() } : {}),
                },
                difficulty,
              )
            }
          >
            Начать эвакуацию <span>→</span>
          </button>
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
        <span>Речной, железнодорожная эвакуационная служба</span>
        <span>Настольная стратегия</span>
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

export default function App(props: AppProps) {
  const observation = props.observation;
  const [rules, setRules] = useState(false);
  const [rulesPage, setRulesPage] = useState(0);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [topView, setTopView] = useState(false);
  const [reset, setReset] = useState(0);
  const [objectives, setObjectives] = useState<District[]>([]);
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrainOrder | null>(null);
  const [orderStep, setOrderStep] = useState<'pickup' | 'refuge' | 'ready'>('pickup');
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [feedback, setFeedback] = useState('');
  const legal = useMemo(() => (observation ? getLegalCommands(observation) : []), [observation]);
  const ownTurn = !!observation && observation.activePlayer === observation.self.id && !props.busy;
  const can = (command: GameCommand) => ownTurn && legal.some((c) => isSame(c, command));
  useEffect(() => {
    setSelection(null);
    setSelectedTrainId(null);
    setDraft(null);
    setRiskAccepted(false);
    setFeedback('');
    setObjectives([]);
    setRules(false);
    if (!observation || observation.revision === 0) setTopView(false);
  }, [!!observation, observation?.activePlayer, observation?.revision === 0]);
  useEffect(() => {
    if (observation?.phase === 'action') {
      setSelection(null);
      setSelectedTrainId(null);
      setDraft(null);
      setRiskAccepted(false);
    }
  }, [observation?.phase]);
  if (!observation)
    return (
      <>
        <Menu {...props} onRules={() => setRules(true)} />
        {rules && <Rules onClose={() => setRules(false)} />}
      </>
    );
  const phase = observation.phase;
  const train = observation.trains.find(
    (t) => t.id === selectedTrainId && t.playerId === observation.self.id,
  );
  const edge =
    selection?.kind === 'edge' ? observation.edges.find((e) => e.id === selection.id) : null;
  const station =
    selection?.kind === 'station' ? observation.stations.find((s) => s.id === selection.id) : null;
  const stationName = (id: string | null) =>
    observation.stations.find((s) => s.id === id)?.name ?? '—';
  const preview = train && draft ? previewOrder(observation, train, draft) : null;
  const risky = !!preview && preview.path.length > 0 && !preview.safe;
  const orderReady =
    !!train &&
    !train.disabled &&
    !!draft &&
    orderStep === 'ready' &&
    (draft.mode === 'position'
      ? !!draft.destination
      : !!draft.returnTo && (!!draft.destination || train.cargo.length > 0));
  const clear = () => {
    setSelection(null);
    setSelectedTrainId(null);
    setDraft(null);
    setRiskAccepted(false);
    setFeedback('');
  };
  const send = (command: GameCommand) => {
    setFeedback('');
    props.onClearError();
    props.onCommand(command);
  };
  const commitOrder = () => {
    if (!ownTurn || phase !== 'orders' || !orderReady || !train || !draft) return;
    if (risky && !riskAccepted) {
      setFeedback('Красная печать подтверждает риск этого рейса.');
      return;
    }
    send({
      type: 'order',
      trainId: train.id,
      order: { ...draft, confirmRisk: risky && riskAccepted },
    });
    clear();
  };
  const controls: TableControl[] = [];
  let headline = phaseNames[phase];
  let notice = '';
  let detailLines: string[] = [];
  if (!ownTurn && phase !== 'finished') {
    headline =
      observation.players.find((p) => p.id === observation.activePlayer)?.name ?? 'Другая бригада';
    notice = 'Соперник планирует. Можно осмотреть поле.';
    detailLines = [observation.events.at(-1)?.message ?? 'Ожидаем приказ.'];
  } else if (phase === 'setup') {
    notice = `Выберите два задания на карточках. Отмечено ${objectives.length}/2.`;
    detailLines = [
      'Две доставленные группы из района дают +3 очка.',
      'Карточки лежат рядом с журналом диспетчера.',
    ];
    controls.push({
      id: 'acceptObjectives',
      label: 'Принять задания',
      enabled: objectives.length === 2,
    });
  } else if (phase === 'action' && edge) {
    headline = `${stationName(edge.a)} — ${stationName(edge.b)}`;
    const available = can({ type: 'repair', edgeId: edge.id });
    notice = edge.open
      ? 'Этот участок уже открыт.'
      : available
        ? 'Нажмите этот участок ещё раз — ремонт.'
        : 'Материалов для ремонта не хватает или путь закрыт водой.';
    detailLines = [
      `Цена: ${edge.cost} · ${colorNames[edge.color]}`,
      'Открытой дорогой пользуются все бригады.',
    ];
  } else if (phase === 'action' && train) {
    headline = `Поезд ${trainNumber(train.id)}`;
    notice = can({ type: 'express', trainId: train.id })
      ? 'Нажмите поезд ещё раз — экспресс за 2 карты.'
      : 'Экспресс для этого поезда сейчас недоступен.';
    detailLines = [
      stationName(train.stationId),
      `На борту: ${train.cargo.length}/2`,
      'Экспресс проходит до двух участков за раунд.',
      'Погрузка или выгрузка завершает движение.',
    ];
  } else if (phase === 'action') {
    notice = 'Карты — слева. Ремонт — на рельсах. Экспресс — на своём поезде.';
    detailLines = [
      'Одно основное действие за ход.',
      'Две обычные карты или одна открытая универсальная.',
      'Наведите мышь вниз, чтобы поднять руку.',
    ];
  } else if (phase === 'draw') {
    notice = 'Возьмите вторую карту со стола или из колоды.';
    detailLines = ['Открытая универсальная недоступна.', 'Выбор дороги не прерывает добор.'];
  } else if (phase === 'discard') {
    notice = `Сбросьте лишние карты из руки: ${Math.max(0, observation.self.hand.length - 10)}.`;
    detailLines = [
      'В руке можно оставить не больше 10 карт.',
      'Рука поднята, пока обязательный сброс не закончен.',
    ];
  } else if (phase === 'orders' && train && draft) {
    headline = `Приказ поезду ${trainNumber(train.id)}`;
    notice =
      orderStep === 'pickup'
        ? draft.mode === 'position'
          ? 'Выберите станцию позиции на макете.'
          : 'Выберите станцию, где забрать жителей.'
        : orderStep === 'refuge'
          ? 'Теперь выберите убежище на макете.'
          : risky && !riskAccepted
            ? 'Рейс опасен. Нужна красная печать согласия.'
            : 'Нажмите конечную станцию ещё раз — приказ.';
    detailLines = [
      `Откуда: ${stationName(train.stationId)} · груз ${train.cargo.length}/2`,
      draft.mode === 'position'
        ? `Позиция: ${stationName(draft.destination)}`
        : `Забрать: ${stationName(draft.destination)}`,
      ...(draft.mode !== 'position' ? [`Убежище: ${stationName(draft.returnTo)}`] : []),
    ];
    if (orderReady) {
      if (preview?.pickupRound !== null && preview?.pickupRound !== undefined)
        detailLines.push(`Погрузка: раунд ${preview.pickupRound}`);
      if (preview?.deliveryRound !== null && preview?.deliveryRound !== undefined)
        detailLines.push(`Доставка: раунд ${preview.deliveryRound}`);
      else if (preview?.arrivalRound !== null && preview?.arrivalRound !== undefined)
        detailLines.push(`Прибытие: раунд ${preview.arrivalRound}`);
      if (preview?.path.length === 0) detailLines.push('Путь закрыт: поезд будет ждать ремонта.');
      else if (risky) detailLines.push(preview?.reason ?? 'Поезд не успевает до закрытия.');
      else if (preview) detailLines.push('Открытый путь безопасен. Очередь не закреплена.');
    }
    if (!train.cargo.length)
      controls.push({
        id: 'position',
        label: draft.mode === 'position' ? 'Режим: позиция' : 'Режим: эвакуация',
        enabled: true,
      });
    if (!train.cargo.length && draft.mode === 'evacuate')
      controls.push({
        id: 'repeat',
        label: draft.repeat ? 'Повтор рейса: да' : 'Повтор рейса: нет',
        enabled: true,
      });
    if (risky)
      controls.push({
        id: 'risk',
        label: riskAccepted ? 'Риск подтверждён' : 'Подтвердить риск',
        enabled: !riskAccepted,
        danger: true,
      });
    controls.push({ id: 'cancel', label: 'Отменить выбор', enabled: true });
    if (!train.cargo.length && train.order.mode !== 'idle')
      controls.push({ id: 'stopTrain', label: 'Остановить поезд', enabled: true });
  } else if (phase === 'orders') {
    notice = 'Выберите свой поезд, затем станцию и убежище на макете.';
    detailLines = [
      'Приказы бесплатны. Старые рейсы продолжаются.',
      'Звонок завершит ход. Поезда едут после всех бригад.',
    ];
  } else if (phase === 'finished') {
    headline =
      props.result?.cityOutcome === 'failure' ? 'Вода оказалась быстрее' : 'Операция завершена';
    const result = props.result;
    notice = result ? `Спасены ${result.saved}/${result.total} групп.` : 'Последний раунд окончен.';
    detailLines = result
      ? [
          `Отрезаны водой: ${result.lost} · не доставлены: ${result.stranded}`,
          ...result.standings.map(
            (p) =>
              `${p.winner ? 'Победа · ' : ''}${p.name}: ${p.score} очков / ${p.delivered} групп`,
          ),
        ]
      : [];
    controls.push({ id: 'newGame', label: 'Новая операция', enabled: true });
  }
  if (
    station &&
    !train &&
    phase !== 'setup' &&
    phase !== 'finished' &&
    phase !== 'draw' &&
    phase !== 'discard'
  ) {
    headline = station.name;
    detailLines = [
      station.safe
        ? 'Убежище: жители в безопасности.'
        : station.flooded
          ? 'Станция закрыта водой.'
          : `${station.groups.length} групп · закрытие после ${station.floodRound}`,
      ...detailLines.slice(0, 2),
    ];
  }
  if (rules) {
    headline = 'Памятка диспетчера';
    notice = `Лист ${rulesPage + 1}/2. Сначала действие. Затем приказы. Звонок — конец хода.`;
    detailLines = [
      'Добор: две карты или одна открытая универсальная.',
      'Ремонт: нажмите рельс дважды.',
      'Экспресс: нажмите свой поезд дважды, цена 2 карты.',
      'Рейс: поезд → станция → убежище → ещё раз убежище.',
      'Груз: 2 группы. Один участок за раунд.',
      'Волны после 6, 8, 10, 12. Погрузка — остановка.',
      'Очки: 2 за группу, 3 за приоритетную, +3 за задание.',
      'Риск подтвердите печатью; сброс — по картам в руке.',
    ].slice(rulesPage * 4, rulesPage * 4 + 4);
    controls.length = 0;
    controls.push({
      id: 'rulesPage',
      label: rulesPage ? 'Первый лист' : 'Второй лист',
      enabled: true,
    });
  }
  if (feedback) notice = feedback;
  if (props.error) notice = props.error;
  if (ownTurn && phase === 'action')
    controls.push({
      id: 'pass',
      label: 'Сохранить материалы',
      enabled: can({ type: 'pass' }),
      placement: 'bell',
    });
  if (ownTurn && phase === 'orders')
    controls.push({
      id: 'endTurn',
      label: 'Закончить ход',
      enabled: can({ type: 'endTurn' }),
      placement: 'bell',
    });
  if (props.error) controls.push({ id: 'clearError', label: 'Понятно', enabled: true });
  controls.push(
    { id: 'plan', label: topView ? 'За стол' : 'Вид сверху', enabled: true, placement: 'dock' },
    { id: 'rules', label: rules ? 'Закрыть памятку' : 'Памятка', enabled: true, placement: 'dock' },
    { id: 'menu', label: 'Меню · Esc', enabled: true, placement: 'dock' },
  );
  const view: TableView = {
    headline,
    notice,
    detailLines,
    controls,
    goals: (phase === 'setup'
      ? observation.self.objectiveOptions
      : observation.self.objectives
    ).map((id) => ({
      id,
      label: districtNames[id],
      progress:
        phase === 'setup'
          ? 'Доставить 2 группы · +3'
          : `${Math.min(2, observation.self.delivered.filter((g) => g.district === id).length)}/2 доставлены`,
      selected: phase === 'setup' ? objectives.includes(id) : true,
      enabled: ownTurn && phase === 'setup',
    })),
    selectedTrainId,
    routeStationIds: preview?.path ?? [],
    enabledMarketIndices: observation.market.flatMap((_, i) =>
      can({ type: 'draw', source: i }) ? [i] : [],
    ),
    deckEnabled: can({ type: 'draw', source: 'deck' }),
    discardEnabled: ownTurn && phase === 'discard',
    enabledEdgeIds: legal.flatMap((c) => (ownTurn && c.type === 'repair' ? [c.edgeId] : [])),
    enabledTrainIds: observation.trains
      .filter((t) => t.playerId === observation.self.id && !t.disabled)
      .map((t) => t.id),
  };
  const interact = (intent: TableInteraction) => {
    if (intent.kind !== 'control') setRules(false);
    if (intent.kind === 'control') {
      if (!view.controls.some((c) => c.id === intent.id && c.enabled)) return;
      switch (intent.id) {
        case 'menu':
          props.onMenu();
          return;
        case 'plan':
          setTopView(!topView);
          setReset((n) => n + 1);
          return;
        case 'rules':
          setRules(!rules);
          setRulesPage(0);
          return;
        case 'rulesPage':
          setRulesPage((page) => 1 - page);
          return;
        case 'clearError':
          props.onClearError();
          return;
        case 'newGame':
          props.onStart(
            {
              playerCount: observation.playerCount as 2 | 3 | 4,
              playerName: observation.self.name,
            },
            props.difficulty,
          );
          clear();
          return;
        case 'acceptObjectives': {
          const districts = observation.self.objectiveOptions.filter((d) => objectives.includes(d));
          const command: GameCommand = { type: 'chooseObjectives', districts };
          if (can(command)) send(command);
          return;
        }
        case 'pass':
          if (can({ type: 'pass' })) {
            send({ type: 'pass' });
            clear();
          }
          return;
        case 'endTurn':
          if (can({ type: 'endTurn' })) {
            send({ type: 'endTurn' });
            clear();
          }
          return;
        case 'cancel':
          clear();
          return;
        case 'risk':
          setRiskAccepted(true);
          setFeedback('');
          return;
        case 'position':
          if (draft) {
            setDraft({
              ...draft,
              mode: draft.mode === 'position' ? 'evacuate' : 'position',
              destination: null,
              repeat: false,
            });
            setOrderStep('pickup');
            setRiskAccepted(false);
            setFeedback('');
          }
          return;
        case 'repeat':
          if (draft) {
            setDraft({ ...draft, repeat: !draft.repeat });
            setRiskAccepted(false);
            setFeedback('');
          }
          return;
        case 'stopTrain':
          if (train && ownTurn && phase === 'orders') {
            send({
              type: 'order',
              trainId: train.id,
              order: { mode: 'idle', destination: null, returnTo: null, repeat: false },
            });
            clear();
          }
          return;
      }
      return;
    }
    if (intent.kind === 'objective') {
      const district = observation.self.objectiveOptions.find((d) => d === intent.id);
      if (!district || !ownTurn || phase !== 'setup') return;
      setObjectives((current) =>
        current.includes(district)
          ? current.filter((d) => d !== district)
          : current.length < 2
            ? [...current, district]
            : current,
      );
      return;
    }
    if (intent.kind === 'market' || intent.kind === 'deck') {
      const source = intent.kind === 'deck' ? 'deck' : Number(intent.id);
      const command: GameCommand = { type: 'draw', source };
      if (can(command)) {
        send(command);
        clear();
      }
      return;
    }
    if (intent.kind === 'card') {
      const command: GameCommand = { type: 'discard', cardId: intent.id };
      if (can(command)) send(command);
      else {
        const card = observation.self.hand.find((c) => c.id === intent.id);
        if (card) setFeedback(`${colorNames[card.color]} материалы. Ремонт выбирается на рельсах.`);
      }
      return;
    }
    if (intent.kind === 'edge') {
      if (
        selection?.kind === 'edge' &&
        selection.id === intent.id &&
        can({ type: 'repair', edgeId: intent.id })
      ) {
        send({ type: 'repair', edgeId: intent.id });
        clear();
        return;
      }
      setSelection({ kind: 'edge', id: intent.id });
      setFeedback('');
      // Inspecting rails during draw never replaces the second-card instruction.
      if (phase === 'action') {
        setSelectedTrainId(null);
        setDraft(null);
        setRiskAccepted(false);
      }
      return;
    }
    if (intent.kind === 'train') {
      const selected = observation.trains.find(
        (t) => t.id === intent.id && t.playerId === observation.self.id,
      );
      if (!selected || selected.disabled) {
        setFeedback('Это поезд другой бригады или он закрыт водой.');
        return;
      }
      if (selectedTrainId === selected.id && can({ type: 'express', trainId: selected.id })) {
        send({ type: 'express', trainId: selected.id });
        clear();
        return;
      }
      setSelectedTrainId(selected.id);
      setSelection(null);
      setFeedback('');
      setRiskAccepted(false);
      if (phase === 'orders' && ownTurn) {
        setDraft({
          mode: selected.cargo.length ? 'return' : 'evacuate',
          destination: selected.cargo.length ? selected.order.destination : null,
          returnTo: null,
          repeat: selected.order.repeat,
        });
        setOrderStep(selected.cargo.length ? 'refuge' : 'pickup');
      }
      return;
    }
    if (intent.kind === 'station') {
      const target = observation.stations.find((s) => s.id === intent.id);
      if (!target) return;
      setSelection({ kind: 'station', id: target.id });
      setFeedback('');
      if (!ownTurn || phase !== 'orders' || !train || !draft || target.flooded) return;
      const destination = draft.mode === 'position' ? draft.destination : draft.returnTo;
      if (orderStep === 'ready' && destination === target.id) {
        commitOrder();
        return;
      }
      setRiskAccepted(false);
      if (draft.mode === 'position') {
        setDraft({ ...draft, destination: target.id });
        setOrderStep('ready');
      } else if (target.safe) {
        setDraft({ ...draft, returnTo: target.id });
        setOrderStep(draft.destination || train.cargo.length ? 'ready' : 'pickup');
      } else if (!train.cargo.length) {
        setDraft({ ...draft, destination: target.id, returnTo: null });
        setOrderStep('refuge');
      }
    }
  };
  return (
    <main className={`game-shell world-only phase-${phase}`}>
      <div className="table-scene">
        <Diorama
          observation={observation}
          selection={selection}
          view={view}
          onInteract={interact}
          topView={topView}
          reset={reset}
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {headline}. {notice}
      </p>
    </main>
  );
}

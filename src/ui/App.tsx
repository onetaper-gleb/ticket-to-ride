import { useEffect, useMemo, useState } from 'react';
import { getLegalCommands, previewOrder } from '../core';
import type {
  AppProps,
  BotDifficulty,
  CardColor,
  District,
  Edge,
  GameCommand,
  Observation,
  Train,
  TrainOrder,
} from '../shared/types';
import Diorama, { type MapSelection } from '../scene/Diorama';
import './styles.css';

const districtNames: Record<District, string> = {
  harbor: 'Порт',
  'old-town': 'Старый город',
  industrial: 'Промзона',
  garden: 'Сады',
};
const districtIcons: Record<District, string> = {
  harbor: '⚓',
  'old-town': '⌂',
  industrial: '⚙',
  garden: '✿',
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
        <h2 id="rules-title">Каждый рейс — выбор.</h2>
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
          Я готов к отправлению <span>→</span>
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
      <div className="menu-scenery" aria-hidden="true">
        <div className="menu-island island-one" />
        <div className="menu-island island-two" />
        <div className="menu-island island-three" />
        <div className="menu-track track-one" />
        <div className="menu-track track-two" />
        <div className="menu-track track-three" />
        <div className="menu-town">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="menu-train">
          ▰<span>▰</span>
        </div>
        <div className="map-coordinate coord-one">55° 44′ N</div>
        <div className="map-coordinate coord-two">РЕЧНОЙ / СЕВЕРНЫЙ ХОЛМ</div>
        <div className="menu-wave wave-one" />
        <div className="menu-wave wave-two" />
      </div>
      <header className="menu-nav">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">╱╱</span> ПОСЛЕДНИЙ РЕЙС
        </a>
        <button className="quiet-button" onClick={props.onRules}>
          Как играть <span>↗</span>
        </button>
      </header>
      <div className="menu-content">
        <div className="menu-intro">
          <span className="eyebrow">
            <i className="status-dot" /> Эвакуационная операция · Речной
          </span>
          <h1>
            Пока ещё
            <br />
            ходят <em>поезда.</em>
          </h1>
          <p>
            Вода поднимается. Дороги закрываются.
            <br />У вас два поезда и двенадцать раундов,
            <br />
            чтобы успеть за теми, кто ждёт.
          </p>
          <div className="menu-features">
            <span>3D-стратегия</span>
            <span>2–4 бригады</span>
            <span>Соло с ботами</span>
          </div>
        </div>
        <section className="start-panel">
          <div className="section-heading">
            <span className="eyebrow">Начать операцию</span>
            <span className="tiny-badge">СОЛО MVP</span>
          </div>
          <h2>Вы — диспетчер.</h2>
          <p className="muted">
            Планируйте рейсы и состязайтесь с другими бригадами за лучший вклад в спасение города.
          </p>
          <label className="field-label" htmlFor="brigade-name">
            Название бригады
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
              Лёгкие<small>Для первого рейса</small>
            </button>
            <button
              className={difficulty === 'normal' ? 'active' : ''}
              onClick={() => setDifficulty('normal')}
            >
              Обычные<small>Планируют маршруты</small>
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
              Продолжить сохранённую партию ↗
            </button>
          )}
          <div className="start-note">
            <span className="status-dot" /> Партия сохраняется автоматически на этом устройстве
          </div>
        </section>
      </div>
      <footer className="menu-footer">
        <span>Общая дорога. Разные планы. Один город.</span>
        <span>12 РАУНДОВ · 4 ВОЛНЫ · ПОСЛЕДНИЙ РЕЙС</span>
      </footer>
      {props.error && (
        <div className="toast" role="alert">
          {props.error}
          <button onClick={props.onClearError}>×</button>
        </div>
      )}
    </main>
  );
}

function TrainEditor({
  train,
  observation,
  enabled,
  onCommand,
}: {
  train: Train;
  observation: Observation;
  enabled: boolean;
  onCommand: (c: GameCommand) => void;
}) {
  const initial = (): TrainOrder => ({
    ...train.order,
    mode: train.cargo.length
      ? train.order.mode === 'evacuate'
        ? 'evacuate'
        : 'return'
      : train.order.mode === 'idle' || train.order.mode === 'return'
        ? 'evacuate'
        : train.order.mode,
    destination:
      train.order.destination ??
      observation.stations.find((s) => !s.safe && !s.flooded && s.groups.length)?.id ??
      null,
    returnTo: train.order.returnTo ?? observation.stations.find((s) => s.safe)?.id ?? null,
  });
  const [order, setOrder] = useState<TrainOrder>(initial);
  const [risk, setRisk] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setOrder(initial());
    setRisk(false);
  }, [train.id, JSON.stringify(train.order), train.cargo.length]);
  const preview = previewOrder(observation, train, order);
  const waitingForRepair = preview.path.length === 0;
  const riskyRoute = !waitingForRepair && !preview.safe;
  const stationName = (id: string | null) =>
    observation.stations.find((s) => s.id === id)?.name ?? '—';
  return (
    <article className={`train-card ${train.disabled ? 'disabled' : ''}`}>
      <button
        className="train-heading"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="train-number">▰ {trainNumber(train.id)}</span>
        <span className="train-location">
          {stationName(train.stationId)}
          <small>
            {train.disabled
              ? 'Поезд потерян'
              : train.cargo.length
                ? `${train.cargo.length}/2 групп на борту`
                : train.order.mode === 'idle'
                  ? 'Ожидает приказа'
                  : `${train.order.mode === 'position' ? 'На позицию' : 'Рейс'} → ${stationName(train.cargo.length ? train.order.returnTo : train.order.destination)}`}
          </small>
        </span>
        <span className="train-chevron">{expanded ? '−' : '+'}</span>
      </button>
      {train.expressRound === observation.round && !train.disabled && (
        <span className="express-badge">↟ Экспресс в этом раунде</span>
      )}
      {expanded && !train.disabled && (
        <div className="train-editor">
          {!train.cargo.length && (
            <div className="segmented compact">
              <button
                disabled={!enabled}
                className={order.mode === 'evacuate' ? 'active' : ''}
                onClick={() => {
                  setOrder({ ...order, mode: 'evacuate' });
                  setRisk(false);
                }}
              >
                Эвакуация
              </button>
              <button
                disabled={!enabled}
                className={order.mode === 'position' ? 'active' : ''}
                onClick={() => {
                  setOrder({ ...order, mode: 'position' });
                  setRisk(false);
                }}
              >
                Позиция
              </button>
            </div>
          )}
          {!train.cargo.length && (
            <label className="field-label">
              {order.mode === 'position' ? 'Станция позиции' : 'Забрать жителей'}
              <select
                disabled={!enabled}
                value={order.destination ?? ''}
                onChange={(e) => {
                  setOrder({ ...order, destination: e.target.value });
                  setRisk(false);
                }}
              >
                {observation.stations
                  .filter((s) => !s.flooded && (order.mode === 'position' || !s.safe))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.safe ? '' : `· ${s.groups.length} гр. · волна ${s.floodRound}`}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {order.mode !== 'position' && (
            <label className="field-label">
              Доставить в убежище
              <select
                disabled={!enabled}
                value={order.returnTo ?? ''}
                onChange={(e) => {
                  setOrder({ ...order, returnTo: e.target.value });
                  setRisk(false);
                }}
              >
                {observation.stations
                  .filter((s) => s.safe)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {!train.cargo.length && order.mode === 'evacuate' && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={order.repeat}
                disabled={!enabled}
                onChange={(e) => setOrder({ ...order, repeat: e.target.checked })}
              />{' '}
              Повторять безопасный рейс
            </label>
          )}
          <div
            className={`route-preview ${waitingForRepair ? 'waiting' : preview.safe ? 'safe' : 'risk'}`}
          >
            <b>
              {waitingForRepair
                ? '⌁ Ожидает ремонта'
                : preview.safe
                  ? '✓ Безопасный маршрут'
                  : '△ Рейс под угрозой'}
            </b>
            <span>
              {preview.pickupRound !== null ? `Погрузка: раунд ${preview.pickupRound} · ` : ''}
              {preview.deliveryRound !== null
                ? `Доставка: раунд ${preview.deliveryRound}`
                : preview.arrivalRound !== null
                  ? `Прибытие: раунд ${preview.arrivalRound}`
                  : waitingForRepair
                    ? 'Срок появится после открытия пути'
                    : 'Нет работающего пути'}
            </span>
            {preview.reason && <small>{preview.reason}</small>}
            <small>Прогноз по открытым линиям. Места в очереди не закреплены.</small>
          </div>
          {riskyRoute && (
            <label className="check-label risk-check">
              <input
                type="checkbox"
                checked={risk}
                disabled={!enabled}
                onChange={(e) => setRisk(e.target.checked)}
              />{' '}
              Подтверждаю риск этого приказа
            </label>
          )}
          <button
            className="button secondary full small"
            disabled={
              !enabled || (riskyRoute && !risk) || (!train.cargo.length && !order.destination)
            }
            onClick={() =>
              onCommand({
                type: 'order',
                trainId: train.id,
                order: { ...order, confirmRisk: riskyRoute && risk },
              })
            }
          >
            Назначить рейс →
          </button>
          {enabled && !train.cargo.length && train.order.mode !== 'idle' && (
            <button
              className="text-button"
              onClick={() =>
                onCommand({
                  type: 'order',
                  trainId: train.id,
                  order: { mode: 'idle', destination: null, returnTo: null, repeat: false },
                })
              }
            >
              Остановить в ожидании ←
            </button>
          )}
          {!enabled && (
            <small className="muted">Менять рейсы можно после основного действия.</small>
          )}
        </div>
      )}
    </article>
  );
}

function ObjectiveSelection({
  observation,
  enabled,
  onCommand,
}: {
  observation: Observation;
  enabled: boolean;
  onCommand: (c: GameCommand) => void;
}) {
  const [chosen, setChosen] = useState<District[]>([]);
  const options = observation.self.objectiveOptions;
  return (
    <div className="objective-selection">
      <span className="eyebrow">Личные задания</span>
      <h2>
        Каким районам
        <br />
        вы поможете?
      </h2>
      <p className="muted">
        Выберите два из трёх. Доставьте по две группы из района, чтобы получить +3 очка.
      </p>
      {options.map((d) => (
        <button
          key={d}
          className={`objective-option ${chosen.includes(d) ? 'selected' : ''}`}
          disabled={!enabled || (!chosen.includes(d) && chosen.length === 2)}
          onClick={() =>
            setChosen(chosen.includes(d) ? chosen.filter((v) => v !== d) : [...chosen, d])
          }
        >
          <span className="district-icon">{districtIcons[d]}</span>
          <span>
            {districtNames[d]}
            <small>Доставить две группы · +3 очка</small>
          </span>
          <span className="check-box">{chosen.includes(d) ? '✓' : ''}</span>
        </button>
      ))}
      <button
        className="button primary full"
        disabled={!enabled || chosen.length !== 2}
        onClick={() => onCommand({ type: 'chooseObjectives', districts: chosen })}
      >
        Принять задания <span>{chosen.length}/2 →</span>
      </button>
    </div>
  );
}

function RepairList({
  observation,
  selection,
  legal,
  enabled,
  onCommand,
  onSelect,
}: {
  observation: Observation;
  selection: MapSelection;
  legal: GameCommand[];
  enabled: boolean;
  onCommand: (c: GameCommand) => void;
  onSelect: (s: MapSelection) => void;
}) {
  const selectedEdge =
    selection?.kind === 'edge' ? observation.edges.find((e) => e.id === selection.id) : null;
  const [showAll, setShowAll] = useState(false);
  const edges = selectedEdge
    ? [selectedEdge]
    : observation.edges.filter((e) => !e.open).slice(0, showAll ? 100 : 5);
  const name = (id: string) => observation.stations.find((s) => s.id === id)?.name ?? id;
  const render = (edge: Edge) => {
    const command: GameCommand = { type: 'repair', edgeId: edge.id };
    const closed = observation.stations.some(
      (s) => (s.id === edge.a || s.id === edge.b) && s.flooded,
    );
    const can = legal.some((c) => isSame(c, command));
    return (
      <div key={edge.id} className={`repair-row ${selection?.id === edge.id ? 'selected' : ''}`}>
        <button className="repair-info" onClick={() => onSelect({ kind: 'edge', id: edge.id })}>
          <span className={`material-symbol ${edge.color}`}>{colorSymbols[edge.color]}</span>
          <span>
            {name(edge.a)}
            <small>↔ {name(edge.b)}</small>
          </span>
        </button>
        <button
          className="repair-cost"
          disabled={!enabled || !can}
          onClick={() => onCommand(command)}
          aria-label={`Восстановить ${name(edge.a)} — ${name(edge.b)}, ${edge.cost} ${edge.cost === 1 ? 'карта' : 'карты'}`}
          title={
            !enabled
              ? 'Восстановить линию можно основным действием своего хода'
              : closed
                ? 'Станция затоплена'
                : edge.open
                  ? 'Линия уже работает'
                  : can
                    ? 'Восстановить линию'
                    : `Нужно ${edge.cost} карт: ${colorNames[edge.color]}`
          }
        >
          <b>{closed ? '×' : edge.open ? '✓' : edge.cost}</b>
          <small>{closed ? 'закрыта' : edge.open ? 'открыта' : can ? 'чинить' : 'нет карт'}</small>
        </button>
      </div>
    );
  };
  return (
    <>
      <div className="action-explanation">
        Нажмите на линию на карте или выберите ниже. Общая сеть помогает всем бригадам.
      </div>
      <div className="repair-list">{edges.map(render)}</div>
      {!selectedEdge && (
        <button className="text-button" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Показать меньше' : 'Все повреждённые линии'} <span>↗</span>
        </button>
      )}
      {selectedEdge && (
        <button className="text-button" onClick={() => onSelect(null)}>
          Все линии ←
        </button>
      )}
    </>
  );
}

export default function App(props: AppProps) {
  const [rules, setRules] = useState(false);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [tab, setTab] = useState<'cards' | 'repair' | 'express'>('cards');
  const [topView, setTopView] = useState(false);
  const [reset, setReset] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const observation = props.observation;
  const legal = useMemo(() => (observation ? getLegalCommands(observation) : []), [observation]);
  useEffect(() => {
    if (observation?.revision === 0) {
      setSelection(null);
      setTab('cards');
      setTopView(false);
      setShowLog(false);
    }
  }, [observation?.revision]);
  useEffect(() => {
    if (selection?.kind === 'edge') setTab('repair');
  }, [selection]);
  useEffect(() => {
    if (observation?.phase === 'draw') setTab('cards');
  }, [observation?.phase]);
  if (!observation)
    return (
      <>
        <Menu {...props} onRules={() => setRules(true)} />
        {rules && <Rules onClose={() => setRules(false)} />}
      </>
    );
  const ownTurn = observation.activePlayer === observation.self.id && !props.busy;
  const phase = observation.phase;
  const enabled = ownTurn && (phase === 'action' || phase === 'draw');
  const can = (command: GameCommand) => enabled && legal.some((c) => isSame(c, command));
  const active = observation.players.find((p) => p.id === observation.activePlayer);
  const nextWave = Waves.find((w) => w >= observation.round) ?? 12;
  const saved = observation.players.reduce((n, p) => n + p.delivered.length, 0);
  const ownTrains = observation.trains.filter((t) => t.playerId === observation.self.id);
  const selectedStation =
    selection?.kind === 'station' ? observation.stations.find((s) => s.id === selection.id) : null;
  const result = props.result;
  return (
    <main className="game-shell">
      <header className="game-header">
        <button
          className="brand"
          onClick={props.onMenu}
          title="Вернуться в меню. Партия сохранена."
        >
          <span className="brand-mark">╱╱</span>
          <span>
            ПОСЛЕДНИЙ РЕЙС<small>РЕЧНОЙ · ЭВАКУАЦИЯ</small>
          </span>
        </button>
        <div className="round-display">
          <span>РАУНД</span>
          <b>
            {String(observation.round).padStart(2, '0')}
            <small>/ 12</small>
          </b>
        </div>
        <div className="wave-status">
          <span className="wave-icon">≈</span>
          <span>
            Следующая волна
            <small>
              После раунда {nextWave} · {nextWave - observation.round} до закрытия
            </small>
          </span>
        </div>
        <button className="quiet-button" onClick={() => setRules(true)}>
          Правила <span>↗</span>
        </button>
      </header>
      <div className="game-grid">
        <aside className="brigade-panel">
          <div className="panel-title">
            <span className="eyebrow">Ваша бригада</span>
            <span className="auto-save">● Автосохранение</span>
          </div>
          <h2>{observation.self.name}</h2>
          <div className="brigade-stats">
            <span>
              <b>{observation.self.score}</b>
              <small>очков</small>
            </span>
            <span>
              <b>{observation.self.delivered.length}</b>
              <small>групп спасено</small>
            </span>
          </div>
          <div className="objectives-block">
            <div className="section-heading">
              <span className="eyebrow">Личные задания</span>
              <span className="muted">+3 каждое</span>
            </div>
            {observation.self.objectives.length ? (
              observation.self.objectives.map((d) => {
                const delivered = observation.self.delivered.filter((g) => g.district === d).length;
                return (
                  <div key={d} className={`objective-progress ${delivered >= 2 ? 'complete' : ''}`}>
                    <span className="district-icon">{districtIcons[d]}</span>
                    <span>
                      {districtNames[d]}
                      <span className="progress-track">
                        <i style={{ width: `${(Math.min(delivered, 2) / 2) * 100}%` }} />
                      </span>
                    </span>
                    <b>{Math.min(delivered, 2)}/2</b>
                  </div>
                );
              })
            ) : (
              <p className="muted">Выберите два района в начале операции.</p>
            )}
          </div>
          <div className="section-heading train-section">
            <span className="eyebrow">Ваши поезда</span>
            <span className="muted">2 места в каждом</span>
          </div>
          {ownTrains.map((train) => (
            <TrainEditor
              key={train.id}
              train={train}
              observation={observation}
              enabled={ownTurn && phase === 'orders'}
              onCommand={props.onCommand}
            />
          ))}
          <div className="leaderboard">
            <span className="eyebrow">Бригады</span>
            {observation.players.map((p) => (
              <div key={p.id} className={p.id === observation.activePlayer ? 'current' : ''}>
                <span className="player-flag" style={{ background: p.color }}>
                  {p.id + 1}
                </span>
                <span>
                  {p.name}
                  <small>
                    {p.delivered.length} групп · {p.handCount} карт
                  </small>
                </span>
                <b>{p.score}</b>
              </div>
            ))}
          </div>
        </aside>
        <section className="map-panel">
          <div className="map-topbar">
            <div>
              <span className="eyebrow">Карта операции</span>
              <h2>
                Город Речной <span>14 станций</span>
              </h2>
            </div>
            <div className="camera-tools">
              <button
                aria-label={topView ? 'Объёмный вид' : 'Вид сверху'}
                title={topView ? 'Объёмный вид' : 'Вид сверху'}
                className={topView ? 'active' : ''}
                onClick={() => setTopView(!topView)}
              >
                ▧
              </button>
              <button
                aria-label="Сбросить камеру"
                title="Сбросить камеру"
                onClick={() => setReset(reset + 1)}
              >
                ↺
              </button>
            </div>
          </div>
          <div className="map-canvas">
            <Diorama
              observation={observation}
              selection={selection}
              onSelect={setSelection}
              topView={topView}
              reset={reset}
            />
            <div className="map-compass" aria-hidden="true">
              N <span>↑</span>
            </div>
            <div className="map-legend">
              <span>
                <i className="legend-line open" />
                Открыто
              </span>
              <span>
                <i className="legend-line repair" />
                Ремонт
              </span>
              <span>
                <i className="legend-dot" />
                Убежище
              </span>
            </div>
            {selectedStation && (
              <div className="station-detail">
                <button
                  className="icon-button"
                  aria-label="Закрыть станцию"
                  onClick={() => setSelection(null)}
                >
                  ×
                </button>
                <span className="eyebrow">
                  {selectedStation.safe
                    ? 'УБЕЖИЩЕ'
                    : selectedStation.district
                      ? districtNames[selectedStation.district]
                      : 'СТАНЦИЯ'}
                </span>
                <h3>{selectedStation.name}</h3>
                <p>
                  {selectedStation.safe
                    ? 'Высокая станция. Вода сюда не поднимется.'
                    : selectedStation.flooded
                      ? 'Станция закрыта водой.'
                      : `${selectedStation.groups.length} групп ждут · закрытие после раунда ${selectedStation.floodRound}`}
                </p>
                {!selectedStation.safe && !selectedStation.flooded && (
                  <small>Назначьте рейс в панели своего поезда.</small>
                )}
              </div>
            )}
          </div>
          <div className="city-progress">
            <span>
              <b>{saved}</b> / {observation.totalGroups} групп в убежищах
            </span>
            <div className="city-progress-bar">
              <i style={{ width: `${(saved / observation.totalGroups) * 100}%` }} />
              <i
                className="lost-progress"
                style={{
                  width: `${(observation.lostGroups.length / observation.totalGroups) * 100}%`,
                }}
              />
            </div>
            <span className="muted">{observation.lostGroups.length} отрезаны водой</span>
          </div>
          <div className="dispatch-radio">
            <span className="radio-icon">⌁</span>
            <div>
              <span className="eyebrow">Диспетчерская</span>
              <p>
                {observation.events.at(-1)?.message ?? 'Бригады на местах. Планируйте первый рейс.'}
              </p>
            </div>
            <button className="text-button" onClick={() => setShowLog(!showLog)}>
              {showLog ? 'Скрыть' : 'Журнал'} ↗
            </button>
          </div>
          {showLog && (
            <div className="event-log" aria-label="Журнал операции">
              {observation.events
                .slice(-30)
                .reverse()
                .map((e) => (
                  <p key={e.id}>
                    <b>Р{e.round}</b> {e.message}
                  </p>
                ))}
            </div>
          )}
        </section>
        <aside className="action-panel">
          <div className={`turn-status ${ownTurn ? 'your-turn' : 'bot-turn'}`}>
            <span className="status-dot" />
            <span>
              {phase === 'finished'
                ? 'Итоги операции'
                : ownTurn
                  ? 'Ваш ход'
                  : `${active?.name ?? 'Бригада'} планирует`}
              <small>
                {phase === 'finished'
                  ? 'Все рейсы завершены'
                  : ownTurn
                    ? phaseNames[phase]
                    : props.busy
                      ? 'Бот выбирает действие…'
                      : 'Ожидание бригады'}
              </small>
            </span>
          </div>
          {!ownTurn && phase !== 'finished' ? (
            <div className="bot-thinking" role="status" aria-live="polite">
              <span className="thinking-symbol" aria-hidden="true">
                ⌁
              </span>
              <span className="eyebrow">Ход другой бригады</span>
              <h2>
                {active?.name ?? 'Бригада'}
                <br />
                планирует рейсы.
              </h2>
              <p>
                Бот выбирает материалы, восстанавливает линии и отправляет поезда. Скоро ваш ход.
              </p>
              <div className="thinking-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <small>Можно изучать карту, прогноз и приказы поездов.</small>
            </div>
          ) : phase === 'setup' ? (
            <ObjectiveSelection
              observation={observation}
              enabled={ownTurn}
              onCommand={props.onCommand}
            />
          ) : phase === 'finished' ? (
            <div className="action-finished">
              <span className="eyebrow">Операция закрыта</span>
              <h2>
                Последний рейс
                <br />
                прибыл.
              </h2>
              <p className="muted">Посмотрите результаты и попробуйте другой план.</p>
              <button className="button primary full" onClick={props.onMenu}>
                В меню →
              </button>
            </div>
          ) : (
            <>
              <div className="action-section-heading">
                <span className="eyebrow">
                  {phase === 'orders' ? '02 / Приказы' : '01 / Основное действие'}
                </span>
                <h2>
                  {phase === 'orders'
                    ? 'Куда отправимся?'
                    : phase === 'discard'
                      ? 'Оставьте 10 карт.'
                      : phase === 'draw'
                        ? 'Ещё один материал.'
                        : 'Ваш следующий шаг.'}
                </h2>
              </div>
              {(phase === 'action' || phase === 'draw') && (
                <>
                  <div className="action-tabs">
                    <button
                      disabled={phase === 'draw'}
                      className={tab === 'cards' ? 'active' : ''}
                      onClick={() => setTab('cards')}
                    >
                      Материалы
                    </button>
                    <button
                      disabled={phase === 'draw'}
                      className={tab === 'repair' ? 'active' : ''}
                      onClick={() => setTab('repair')}
                    >
                      Ремонт
                    </button>
                    <button
                      disabled={phase === 'draw'}
                      className={tab === 'express' ? 'active' : ''}
                      onClick={() => setTab('express')}
                    >
                      Экспресс
                    </button>
                  </div>
                  {tab === 'cards' && (
                    <>
                      <p className="action-explanation">
                        {phase === 'draw'
                          ? 'Выберите вторую карту. Открытая универсальная сейчас недоступна.'
                          : 'Возьмите две обычные карты или одну открытую универсальную.'}
                      </p>
                      <div className="market">
                        {observation.market.map((card, index) => (
                          <button
                            key={`${index}-${card.id}`}
                            className={`material-card ${card.color}`}
                            disabled={!can({ type: 'draw', source: index })}
                            onClick={() => props.onCommand({ type: 'draw', source: index })}
                            aria-label={`Взять ${colorNames[card.color].toLowerCase()} материал с рынка`}
                          >
                            <span className="card-corner">{colorSymbols[card.color]}</span>
                            <span className="card-symbol">{colorSymbols[card.color]}</span>
                            <small>
                              {card.color === 'wild'
                                ? 'УНИВЕРС.'
                                : colorNames[card.color].toUpperCase()}
                            </small>
                          </button>
                        ))}
                      </div>
                      <button
                        className="deck-button"
                        disabled={!can({ type: 'draw', source: 'deck' })}
                        onClick={() => props.onCommand({ type: 'draw', source: 'deck' })}
                      >
                        <span className="deck-illustration">╱╱</span>
                        <span>
                          Взять вслепую
                          <small>
                            {observation.deckCount} в колоде · {observation.discardCount} в сбросе
                          </small>
                        </span>
                        <b>→</b>
                      </button>
                    </>
                  )}
                  {tab === 'repair' && (
                    <RepairList
                      observation={observation}
                      selection={selection}
                      legal={legal}
                      enabled={enabled}
                      onCommand={props.onCommand}
                      onSelect={setSelection}
                    />
                  )}{' '}
                  {tab === 'express' && (
                    <>
                      <p className="action-explanation">
                        За любые две карты поезд пройдёт до двух линий в этом раунде. Погрузка или
                        выгрузка остановит движение.
                      </p>
                      {ownTrains.map((train) => (
                        <button
                          className="express-option"
                          key={train.id}
                          disabled={!can({ type: 'express', trainId: train.id })}
                          onClick={() => props.onCommand({ type: 'express', trainId: train.id })}
                        >
                          <span>↟</span>
                          <span>
                            Поезд {trainNumber(train.id)}
                            <small>
                              {train.disabled ? 'Недоступен' : 'Экспресс на один раунд'}
                            </small>
                          </span>
                          <b>2 карты</b>
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
              {phase === 'discard' && (
                <div className="orders-hint">
                  <span>↓</span>
                  <p>
                    Нажмите на лишние карты в вашей руке внизу экрана. Нужно сбросить ещё{' '}
                    <b>{Math.max(0, observation.self.hand.length - 10)}</b>.
                  </p>
                </div>
              )}
              {phase === 'orders' && (
                <>
                  <div className="orders-hint">
                    <span>←</span>
                    <p>
                      Откройте свой поезд слева, выберите станцию и убежище. Поезда с приказами едут
                      автоматически.
                    </p>
                  </div>
                  <div className="movement-note">
                    <b>Когда поедут поезда?</b>
                    <p>
                      После хода каждой бригады, одновременно. Приказ можно менять до конца своего
                      хода.
                    </p>
                  </div>
                  <button
                    className="button primary full end-turn"
                    disabled={!ownTurn}
                    onClick={() => props.onCommand({ type: 'endTurn' })}
                  >
                    Закончить ход <span>→</span>
                  </button>
                </>
              )}
              {phase === 'action' && (
                <button
                  className="button pass-button full"
                  disabled={!can({ type: 'pass' })}
                  onClick={() => props.onCommand({ type: 'pass' })}
                >
                  Пропустить действие →
                </button>
              )}
              <div className="forecast">
                <div className="section-heading">
                  <span className="eyebrow">Прогноз воды</span>
                  <span>≈</span>
                </div>
                {Waves.map((w) => (
                  <div
                    key={w}
                    className={w < observation.round ? 'passed' : w === nextWave ? 'next' : ''}
                  >
                    <b>{String(w).padStart(2, '0')}</b>
                    <span>
                      {observation.stations
                        .filter((s) => s.floodRound === w)
                        .map((s) => s.name)
                        .join(', ') || 'Конец операции'}
                    </span>
                    <small>{w < observation.round ? '✓' : 'раунд'}</small>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
      <footer className="hand-panel">
        <div className="hand-heading">
          <span className="eyebrow">Ваши материалы</span>
          <span>
            <b>{observation.self.hand.length}</b> / 10 карт
          </span>
        </div>
        <div className="hand-cards">
          {observation.self.hand.length ? (
            observation.self.hand.map((card) => (
              <button
                key={card.id}
                className={`hand-card ${card.color} ${phase === 'discard' ? 'discardable' : ''}`}
                disabled={phase !== 'discard' || !ownTurn}
                onClick={() => props.onCommand({ type: 'discard', cardId: card.id })}
                aria-label={`${colorNames[card.color]}. ${phase === 'discard' ? 'Сбросить карту' : 'Карта в руке'}`}
              >
                <span>{colorSymbols[card.color]}</span>
                <small>
                  {card.color === 'wild' ? 'УНИВ.' : colorNames[card.color].toUpperCase()}
                </small>
              </button>
            ))
          ) : (
            <span className="muted empty-hand">
              Рука пуста. Наберите материалы на следующем ходу.
            </span>
          )}
        </div>
        <div className="initiative">
          <span className="eyebrow">Порядок хода</span>
          <div>
            {observation.turnOrder.map((id) => (
              <span
                key={id}
                className={id === observation.activePlayer ? 'active' : ''}
                style={{ borderColor: observation.players.find((p) => p.id === id)?.color }}
              >
                {id + 1}
              </span>
            ))}
          </div>
        </div>
      </footer>
      {props.error && (
        <div className="toast" role="alert">
          <span>{props.error}</span>
          <button onClick={props.onClearError} aria-label="Закрыть сообщение">
            ×
          </button>
        </div>
      )}
      {rules && <Rules onClose={() => setRules(false)} />}{' '}
      {phase === 'finished' && result && (
        <div className="modal-backdrop">
          <section
            className="result-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
          >
            <span className="eyebrow">Речной · Итоги операции</span>
            <h1 id="result-title">
              {result.cityOutcome === 'excellent'
                ? 'Город держится.'
                : result.cityOutcome === 'failure'
                  ? 'Вода оказалась быстрее.'
                  : 'Каждый рейс был важен.'}
            </h1>
            <p>
              {result.saved} из {result.total} групп добрались до убежищ. {result.lost} отрезаны
              водой{result.stranded ? `, ${result.stranded} не доставлены` : ''}.
            </p>
            <div className="results-table">
              {result.standings.map((p, index) => (
                <div key={p.playerId} className={p.winner ? 'winner' : ''}>
                  <span className="place">
                    {p.winner ? '★' : String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="result-player">
                    {p.name}
                    <small>
                      {p.delivered} групп · {p.priority} приоритетных · {p.objectivesCompleted}{' '}
                      заданий · {p.repairScore} за ремонт
                    </small>
                  </span>
                  <strong>
                    {p.score}
                    <small>очков</small>
                  </strong>
                </div>
              ))}
            </div>
            <div className="result-actions">
              <button
                className="button primary"
                onClick={() =>
                  props.onStart(
                    {
                      playerCount: observation.playerCount as 2 | 3 | 4,
                      playerName: observation.self.name,
                    },
                    props.difficulty,
                  )
                }
              >
                Ещё одна операция →
              </button>
              <button className="button secondary" onClick={props.onMenu}>
                В меню
              </button>
            </div>
            <small className="muted">
              Общая дорога открывает новые планы. Попробуйте другую очередь рейсов.
            </small>
          </section>
        </div>
      )}
    </main>
  );
}

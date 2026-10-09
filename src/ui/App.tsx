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
          <span className="eyebrow">Речной / Операция 01</span>
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
      <h2>Выберите два района</h2>
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
    if (selection?.kind === 'edge' && observation?.phase === 'action') setTab('repair');
  }, [selection, observation?.phase]);
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
    <main className={`game-shell phase-${phase}`}>
      <div className="table-scene">
        <Diorama
          observation={observation}
          selection={selection}
          onSelect={setSelection}
          topView={topView}
          reset={reset}
          onCardSelect={(cardId: string) => {
            if (ownTurn && phase === 'discard') props.onCommand({ type: 'discard', cardId });
          }}
        />
      </div>
      <header className="game-header">
        <button className="brand" onClick={props.onMenu} title="В меню. Партия сохранена.">
          <span className="brand-mark" aria-hidden="true">
            Ⅱ
          </span>
          <span>
            Последний рейс<small>Речной</small>
          </span>
        </button>
        <div className="round-display">
          <span>Раунд</span>
          <b>
            {String(observation.round).padStart(2, '0')}
            <small>/12</small>
          </b>
        </div>
        <div className="wave-status">
          <span className="wave-icon" aria-hidden="true">
            ≈
          </span>
          <span>
            Волна после {nextWave}
            <small>{nextWave - observation.round} раундов до закрытия</small>
          </span>
        </div>
        <div className="header-saved">
          <b>
            {saved}
            <small>/{observation.totalGroups}</small>
          </b>
          <span>в убежищах</span>
        </div>
        <span className="auto-save" title="Партия сохраняется после каждого действия">
          <i className="status-dot" />
          Автосохранение
        </span>
        <button className="quiet-button" onClick={() => setRules(true)}>
          Правила
        </button>
        <button className="quiet-button" onClick={props.onMenu}>
          Меню
        </button>
      </header>
      <div className="scene-tools">
        <span className="scene-title">
          Речной <small>14 станций</small>
        </span>
        <div className="camera-tools">
          <button
            aria-label={topView ? 'Объёмный вид' : 'Вид сверху'}
            title={topView ? 'Объёмный вид' : 'Вид сверху'}
            className={topView ? 'active' : ''}
            onClick={() => setTopView(!topView)}
          >
            {topView ? '3D' : 'Сверху'}
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
      <aside className="brigade-panel hud-sheet">
        <div className="brigade-identity">
          <span className="player-flag" style={{ background: observation.self.color }}>
            {observation.self.id + 1}
          </span>
          <div>
            <span className="eyebrow">Ваша бригада</span>
            <h2>{observation.self.name}</h2>
          </div>
          <b className="brigade-score">
            {observation.self.score}
            <small>очков</small>
          </b>
        </div>
        <div className="section-heading train-section">
          <span className="eyebrow">Поезда</span>
          <span className="muted">2 места</span>
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
        <details className="hud-disclosure objectives-block">
          <summary>
            Задания <span>{observation.self.objectives.length}</span>
          </summary>
          {observation.self.objectives.length ? (
            observation.self.objectives.map((d) => {
              const delivered = observation.self.delivered.filter((g) => g.district === d).length;
              return (
                <div key={d} className={`objective-progress ${delivered >= 2 ? 'complete' : ''}`}>
                  <span className="district-icon">{districtIcons[d]}</span>
                  <span>
                    {districtNames[d]}
                    <span className="progress-track">
                      <i style={{ width: `${Math.min(delivered, 2) * 50}%` }} />
                    </span>
                  </span>
                  <b>{Math.min(delivered, 2)}/2</b>
                </div>
              );
            })
          ) : (
            <p className="muted">Выберите районы в начале операции.</p>
          )}
        </details>
        <details className="hud-disclosure leaderboard">
          <summary>
            Бригады <span>{observation.playerCount}</span>
          </summary>
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
        </details>
        <details className="hud-disclosure forecast">
          <summary>
            Прогноз воды <span>4 волны</span>
          </summary>
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
              <small>{w < observation.round ? 'Закрыто' : 'После раунда'}</small>
            </div>
          ))}
        </details>
      </aside>
      {selectedStation && (
        <section className="station-detail hud-sheet">
          <button
            className="icon-button"
            aria-label="Закрыть станцию"
            onClick={() => setSelection(null)}
          >
            ×
          </button>
          <span className="eyebrow">
            {selectedStation.safe
              ? 'Убежище'
              : selectedStation.district
                ? districtNames[selectedStation.district]
                : 'Станция'}
          </span>
          <h3>{selectedStation.name}</h3>
          <p>
            {selectedStation.safe
              ? 'Высокая станция. Здесь жители в безопасности.'
              : selectedStation.flooded
                ? 'Станция закрыта водой.'
                : `${selectedStation.groups.length} групп ждут · закрытие после ${selectedStation.floodRound}`}
          </p>
          {!selectedStation.safe && !selectedStation.flooded && (
            <small className="muted">Назначьте рейс в панели поезда.</small>
          )}
        </section>
      )}
      <aside className="action-panel hud-sheet">
        <div className={`turn-status ${ownTurn ? 'your-turn' : 'bot-turn'}`} role="status">
          <span className="status-dot" />
          <span>
            {phase === 'finished'
              ? 'Операция завершена'
              : ownTurn
                ? 'Ваш ход'
                : (active?.name ?? 'Другая бригада')}
            <small>
              {phase === 'finished'
                ? 'Все рейсы завершены'
                : ownTurn
                  ? phaseNames[phase]
                  : props.busy
                    ? 'Планирует рейсы…'
                    : 'Ожидание бригады'}
            </small>
          </span>
          <span className="turn-seat">{observation.activePlayer + 1}</span>
        </div>
        {!ownTurn && phase !== 'finished' ? (
          <div className="bot-thinking">
            <p>Можно изучать карту и прогноз, пока другая бригада выбирает ход.</p>
            <div className="thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : phase === 'setup' ? (
          <ObjectiveSelection
            observation={observation}
            enabled={ownTurn}
            onCommand={props.onCommand}
          />
        ) : phase === 'finished' ? (
          <div className="action-finished">
            <h2>Итоги операции</h2>
            <p className="muted">Посмотрите результаты и начните новую партию.</p>
            <button className="button primary full" onClick={props.onMenu}>
              В меню →
            </button>
          </div>
        ) : (
          <>
            <div className="action-section-heading">
              <h2>
                {phase === 'orders'
                  ? 'Приказы поездов'
                  : phase === 'discard'
                    ? 'Оставьте 10 карт'
                    : phase === 'draw'
                      ? 'Вторая карта'
                      : 'Действие'}
              </h2>
              <span className="eyebrow">{phase === 'orders' ? '02 / 02' : '01 / 02'}</span>
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
                        ? 'Выберите вторую карту. Открытая универсальная недоступна.'
                        : 'Две обычные карты или одна открытая универсальная.'}
                    </p>
                    <div className="market">
                      {observation.market.map((card, index) => (
                        <button
                          key={`${index}-${card.id}`}
                          className={`material-card ${card.color}`}
                          disabled={!can({ type: 'draw', source: index })}
                          onClick={() => props.onCommand({ type: 'draw', source: index })}
                          aria-label={`Взять ${colorNames[card.color].toLowerCase()} материал с рынка`}
                          title={colorNames[card.color]}
                        >
                          <span className="card-corner">{colorSymbols[card.color]}</span>
                          <span className="card-symbol">{colorSymbols[card.color]}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="deck-button"
                      disabled={!can({ type: 'draw', source: 'deck' })}
                      onClick={() => props.onCommand({ type: 'draw', source: 'deck' })}
                    >
                      <span className="deck-illustration" aria-hidden="true">
                        Ⅱ
                      </span>
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
                )}
                {tab === 'express' && (
                  <>
                    <p className="action-explanation">
                      Две карты: поезд проедет до двух участков в этом раунде. Погрузка или выгрузка
                      остановит движение.
                    </p>
                    {ownTrains.map((train) => (
                      <button
                        className="express-option"
                        key={train.id}
                        disabled={!can({ type: 'express', trainId: train.id })}
                        onClick={() => props.onCommand({ type: 'express', trainId: train.id })}
                      >
                        <span className="express-number">{trainNumber(train.id)}</span>
                        <span>
                          Поезд {trainNumber(train.id)}
                          <small>{train.disabled ? 'Недоступен' : 'Экспресс на один раунд'}</small>
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
                <p>
                  Сбросьте <b>{Math.max(0, observation.self.hand.length - 10)}</b> карт. Нажмите на
                  карту в руке или её символ внизу экрана.
                </p>
              </div>
            )}
            {phase === 'orders' && (
              <>
                <div className="orders-hint">
                  <p>
                    Откройте поезд слева и назначьте рейс. Текущие приказы продолжают действовать.
                  </p>
                </div>
                <p className="movement-note">
                  Все поезда поедут после хода каждой бригады. Приказы можно менять до конца хода.
                </p>
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
                className="text-button pass-button full"
                disabled={!can({ type: 'pass' })}
                onClick={() => props.onCommand({ type: 'pass' })}
              >
                Пропустить действие →
              </button>
            )}
          </>
        )}
      </aside>
      <div className="table-status">
        <div className="dispatch-radio">
          <span className="eyebrow">Журнал</span>
          <p>
            {observation.events.at(-1)?.message ?? 'Бригады на местах. Планируйте первый рейс.'}
          </p>
          <button className="text-button" onClick={() => setShowLog(!showLog)}>
            {showLog ? 'Скрыть' : 'Открыть'}
          </button>
        </div>
        {showLog && (
          <div className="event-log hud-sheet" aria-label="Журнал операции">
            {observation.events
              .slice(-30)
              .reverse()
              .map((e) => (
                <p key={e.id}>
                  <b>Р{e.round}</b>
                  {e.message}
                </p>
              ))}
          </div>
        )}
      </div>
      <footer className="hand-panel">
        <div className="hand-heading">
          <span>Рука</span>
          <b>
            {observation.self.hand.length}
            <small>/10</small>
          </b>
        </div>
        <div className="hand-cards" aria-label="Ваши материалы">
          {observation.self.hand.length ? (
            observation.self.hand.map((card, index) => (
              <button
                key={card.id}
                className={`hand-card ${card.color} ${phase === 'discard' ? 'discardable' : ''}`}
                disabled={phase !== 'discard' || !ownTurn}
                onClick={() => props.onCommand({ type: 'discard', cardId: card.id })}
                aria-label={`${colorNames[card.color]}, карта ${index + 1}. ${phase === 'discard' ? 'Сбросить карту' : 'Карта в руке'}`}
                title={colorNames[card.color]}
              >
                <span>{colorSymbols[card.color]}</span>
              </button>
            ))
          ) : (
            <span className="muted empty-hand">Нет карт</span>
          )}
        </div>
        <div className="initiative">
          <span>Ход</span>
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
      </footer>
      {props.error && (
        <div className="toast" role="alert">
          <span>{props.error}</span>
          <button onClick={props.onClearError} aria-label="Закрыть сообщение">
            ×
          </button>
        </div>
      )}
      {rules && <Rules onClose={() => setRules(false)} />}
      {phase === 'finished' && result && (
        <div className="modal-backdrop">
          <section
            className="result-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
          >
            <span className="eyebrow">Речной / Итоги операции</span>
            <h1 id="result-title">
              {result.cityOutcome === 'excellent'
                ? 'Город держится'
                : result.cityOutcome === 'failure'
                  ? 'Вода оказалась быстрее'
                  : 'Операция завершена'}
            </h1>
            <p>
              {result.saved} из {result.total} групп добрались до убежищ. {result.lost} отрезаны
              водой{result.stranded ? `, ${result.stranded} не доставлены` : ''}.
            </p>
            <div className="results-table">
              {result.standings.map((p, index) => (
                <div key={p.playerId} className={p.winner ? 'winner' : ''}>
                  <span className="place">{String(index + 1).padStart(2, '0')}</span>
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
          </section>
        </div>
      )}
    </main>
  );
}

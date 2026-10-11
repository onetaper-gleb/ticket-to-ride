import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppProps, BotDifficulty } from '../shared/types';
import { MenuDiorama, type MenuSceneState } from '../scene/Diorama';
import { TutorialWelcome } from '../ui/TutorialOverlay';
import { rulesPages } from '../ui/rules-pages';
import wordmark from '../../public/menu/art/europe-mark.svg?raw';
import continueIcon from '../../public/menu/art/icons/continue.svg?raw';
import startIcon from '../../public/menu/art/icons/start.svg?raw';
import friendsIcon from '../../public/menu/art/icons/friends.svg?raw';
import tutorialIcon from '../../public/menu/art/icons/tutorial.svg?raw';
import rulesIcon from '../../public/menu/art/icons/rules.svg?raw';
import settingsIcon from '../../public/menu/art/icons/settings.svg?raw';
import './session-menu.css';

export type MenuSaveSlot = 'current' | 'tutorial';
export interface MenuSaveStatus {
  loading: boolean;
  error: string | null;
}
type MenuProps = Pick<
  AppProps,
  | 'canContinue'
  | 'canContinueTutorial'
  | 'difficulty'
  | 'error'
  | 'onClearError'
  | 'onStart'
  | 'onContinue'
  | 'onStartTutorial'
  | 'onContinueTutorial'
  | 'onOpenNetwork'
> & {
  saves: Record<MenuSaveSlot, MenuSaveStatus>;
  onRetrySave: (slot: MenuSaveSlot) => void;
};
const icons = {
  continue: continueIcon,
  new: startIcon,
  friends: friendsIcon,
  tutorial: tutorialIcon,
  rules: rulesIcon,
};
const welcomeKey = 'europe-onboarding-v1';
function needsWelcome() {
  try {
    return !localStorage.getItem(welcomeKey);
  } catch {
    return true;
  }
}
function rememberWelcome() {
  try {
    localStorage.setItem(welcomeKey, 'seen');
  } catch {
    /* Storage is optional. */
  }
}

/** Native accepted menu print, connected only through existing session callbacks. */
export default function SessionMenu(props: MenuProps) {
  const stage = useRef<HTMLElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const settings = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const scrollNote = useRef<HTMLParagraphElement>(null);
  const party = useRef<HTMLDialogElement>(null);
  const rules = useRef<HTMLDialogElement>(null);
  const partyOrigin = useRef<HTMLElement | null>(null);
  const rulesOrigin = useRef<HTMLElement | null>(null);
  const [scene, setScene] = useState<MenuSceneState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4 | 5>(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>(props.difficulty);
  const [name, setName] = useState('Вы');
  const [seed, setSeed] = useState('');
  const [ruleIndex, setRuleIndex] = useState(0);
  const [partyOpen, setPartyOpen] = useState(false);
  const [welcome, setWelcome] = useState(needsWelcome);
  const page = rulesPages[ruleIndex];
  const version = JSON.stringify([
    props.saves,
    props.canContinue,
    props.canContinueTutorial,
    props.error,
    !!props.onOpenNetwork,
  ]);

  const updateScroll = () => {
    const list = nav.current,
      container = frame.current,
      note = scrollNote.current;
    if (!list || !container || !note) return;
    const desktop = ['desktop', 'ultrawide'].includes(stage.current?.dataset.layout ?? '');
    const overflow = desktop && list.scrollHeight > container.clientHeight + 1;
    container.dataset.overflow = String(overflow);
    note.hidden = !overflow;
    if (overflow) {
      const above = list.scrollTop > 2;
      const below = list.scrollTop + list.clientHeight < list.scrollHeight - 2;
      note.textContent = above
        ? below
          ? '↕ Прокрутите меню'
          : '↑ Действия выше'
        : 'Ещё действия ↓';
      list.setAttribute('aria-describedby', note.id);
    } else {
      note.textContent = '';
      list.removeAttribute('aria-describedby');
    }
  };
  useLayoutEffect(updateScroll, [version, scene]);
  useEffect(() => {
    const element = stage.current;
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setAttempt((value) => value + 1);
    };
    element?.addEventListener('menu-layout-complete', updateScroll);
    window.addEventListener('pageshow', restore);
    return () => {
      element?.removeEventListener('menu-layout-complete', updateScroll);
      window.removeEventListener('pageshow', restore);
    };
  }, []);
  const openParty = (origin: HTMLElement, fromSettings = false) => {
    partyOrigin.current = origin;
    party.current?.showModal();
    setPartyOpen(true);
    party.current?.querySelector<HTMLElement>(fromSettings ? 'select' : 'h2')?.focus();
  };
  const openRules = (origin: HTMLElement) => {
    rulesOrigin.current = origin;
    rules.current?.showModal();
    rules.current?.querySelector<HTMLElement>('h2')?.focus();
  };
  const startTutorial = () => {
    rememberWelcome();
    if (props.canContinueTutorial) props.onContinueTutorial();
    else props.onStartTutorial();
  };
  const row = (
    id: keyof typeof icons,
    label: string,
    hint: string,
    disabled: boolean,
    action: (origin: HTMLButtonElement) => void,
    primary = false,
  ) => (
    <button
      type="button"
      key={id}
      className={`row ${id}${primary ? ' primary' : ''}`}
      data-continued={id === 'tutorial' && props.canContinueTutorial}
      disabled={disabled}
      onClick={(event) => action(event.currentTarget)}
    >
      <span className="icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icons[id] }} />
      <span className="copy">
        <span className="label">{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
    </button>
  );
  const errorRetry = (slot: MenuSaveSlot) =>
    props.saves[slot].error && (
      <div className="save-error" role="status">
        <p id={`menu-error-${slot}`}>
          Не удалось проверить {slot === 'current' ? 'обычное' : 'учебное'} сохранение.{' '}
          {props.saves[slot].error}
        </p>
        <button
          type="button"
          className="retry"
          aria-describedby={`menu-error-${slot}`}
          onClick={() => props.onRetrySave(slot)}
        >
          Повторить проверку
        </button>
      </div>
    );
  const currentHint = props.saves.current.loading
    ? 'Проверяем сохранение…'
    : props.saves.current.error
      ? 'Проверка не завершена'
      : props.canContinue
        ? 'Обычная партия'
        : 'Нет сохранённой партии';
  const tutorialHint = props.saves.tutorial.loading
    ? 'Проверяем сохранение…'
    : props.saves.tutorial.error
      ? 'Проверка не завершена'
      : 'До первого маршрута';
  return (
    <div className="session-menu" data-scene={scene}>
      <main
        className="menu-stage"
        ref={stage}
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLElement && event.target.matches('.row,.settings,.retry'))
            event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }}
      >
        <MenuDiorama
          stage={stage}
          board={board}
          settings={settings}
          attempt={attempt}
          layoutVersion={version + scene}
          onState={setScene}
        />
        <section className="menu-stack" aria-label="Главное меню">
          <div className="board" ref={board}>
            <header className="board-header">
              <h1 className="sr-only">Ticket to Ride: Europe</h1>
              <div
                className="wordmark"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: wordmark }}
              />
            </header>
            <div className="actions-frame" ref={frame}>
              <nav className="actions" aria-label="Действия" ref={nav} onScroll={updateScroll}>
                {row(
                  'continue',
                  'Продолжить',
                  currentHint,
                  !props.canContinue || props.saves.current.loading || !!props.saves.current.error,
                  props.onContinue,
                  props.canContinue,
                )}
                {errorRetry('current')}
                {row(
                  'new',
                  'Начать партию',
                  '',
                  false,
                  (origin) => openParty(origin),
                  !props.canContinue,
                )}
                {props.onOpenNetwork &&
                  row('friends', 'Играть с друзьями', '', false, props.onOpenNetwork)}
                {row(
                  'tutorial',
                  props.canContinueTutorial ? 'Продолжить обучение' : 'Обучение',
                  tutorialHint,
                  props.saves.tutorial.loading || !!props.saves.tutorial.error,
                  startTutorial,
                )}
                {errorRetry('tutorial')}
                {row('rules', 'Правила', '', false, openRules)}
                {props.error && (
                  <div className="save-error" role="alert">
                    <p>{props.error}</p>
                    <button type="button" className="plain" onClick={props.onClearError}>
                      Закрыть сообщение
                    </button>
                  </div>
                )}
              </nav>
              <p id="menu-scroll-note" className="scroll-affordance" ref={scrollNote} hidden />
            </div>
          </div>
          <button
            type="button"
            className="settings"
            ref={settings}
            onClick={(event) => openParty(event.currentTarget, true)}
          >
            <span
              className="icon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: settingsIcon }}
            />
            <span className="label">Настройки партии</span>
          </button>
        </section>
        {scene !== 'ready' && (
          <div className="scene-status" role="status">
            {scene === 'loading' ? (
              'Загружаем сцену…'
            ) : (
              <>
                <span>Не удалось загрузить 3D-сцену. Меню доступно.</span>
                <button
                  type="button"
                  className="retry"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Повторить загрузку сцены
                </button>
              </>
            )}
          </div>
        )}
      </main>
      <dialog
        ref={party}
        aria-labelledby="menu-party-title"
        onClose={() => {
          setPartyOpen(false);
          partyOrigin.current?.focus();
        }}
      >
        <h2 id="menu-party-title" tabIndex={-1}>
          Параметры новой партии
        </h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            party.current?.close();
            props.onStart(
              {
                playerCount,
                playerName: name.trim() || 'Вы',
                ...(seed.trim() ? { seed: seed.trim() } : {}),
              },
              difficulty,
            );
          }}
        >
          <label className="field">
            Всего мест
            <select
              aria-label="Всего мест"
              value={playerCount}
              onChange={(event) => setPlayerCount(Number(event.target.value) as 2 | 3 | 4 | 5)}
            >
              {[2, 3, 4, 5].map((count) => (
                <option key={count}>{count}</option>
              ))}
            </select>
          </label>
          <p>
            {playerCount - 1} {playerCount === 2 ? 'бот' : 'бота'}
          </p>
          <label className="field">
            Сложность ботов
            <select
              aria-label="Сложность ботов"
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as BotDifficulty)}
            >
              <option value="easy">Лёгкие</option>
              <option value="normal">Обычные</option>
            </select>
          </label>
          <label className="field">
            Ваше имя
            <input
              aria-label="Ваше имя"
              maxLength={24}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </label>
          <details>
            <summary>Код партии (необязательно)</summary>
            <label className="field">
              Код партии
              <input
                aria-label="Код партии"
                maxLength={64}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                autoComplete="off"
              />
            </label>
          </details>
          {props.canContinue && (
            <p className="warning">Новая партия заменит обычное сохранение. Обучение сохранится.</p>
          )}
          {props.saves.current.loading || props.saves.current.error ? (
            <p className="warning">
              Сохранение ещё не проверено. Новая партия может заменить обычное сохранение.
            </p>
          ) : null}
          <div className="footer">
            <button type="button" className="plain" onClick={() => party.current?.close()}>
              Назад
            </button>
            <button type="submit" className="submit">
              Сесть за стол{props.canContinue ? ' — новая партия' : ''}
            </button>
          </div>
          <div className="footer">
            <button
              type="button"
              className="plain"
              onClick={(event) => openRules(event.currentTarget)}
            >
              Правила
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        className="menu-rules"
        ref={rules}
        aria-labelledby="menu-rules-title"
        onClose={() => rulesOrigin.current?.focus()}
      >
        <h2 id="menu-rules-title" tabIndex={-1}>
          Ticket to Ride: Europe
        </h2>
        <h3>{page.title}</h3>
        <ul>
          {page.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {page.illustrations?.map((illustration) => (
          <figure key={illustration.id}>
            <img
              className="rules-image"
              src={`${import.meta.env.BASE_URL}rules-illustrations/${illustration.id}.svg`}
              alt={illustration.alt}
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
            <figcaption>{illustration.caption}</figcaption>
          </figure>
        ))}
        <p aria-live="polite">
          Лист {ruleIndex + 1} из {rulesPages.length}
        </p>
        <div className="footer">
          <button
            type="button"
            className="plain"
            disabled={ruleIndex === 0}
            onClick={() => setRuleIndex((value) => value - 1)}
          >
            Назад
          </button>
          <button
            type="button"
            className="plain"
            disabled={ruleIndex === rulesPages.length - 1}
            onClick={() => setRuleIndex((value) => value + 1)}
          >
            Следующий лист
          </button>
        </div>
        <div className="footer">
          <button type="button" className="submit" onClick={() => rules.current?.close()}>
            Вернуться {partyOpen ? 'к параметрам' : 'в меню'}
          </button>
        </div>
      </dialog>
      {welcome && (
        <TutorialWelcome
          onStart={() => {
            rememberWelcome();
            setWelcome(false);
            props.onStartTutorial();
          }}
          onDismiss={() => {
            rememberWelcome();
            setWelcome(false);
          }}
        />
      )}
    </div>
  );
}

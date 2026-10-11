import { useCallback, useEffect, useRef, useState } from 'react';
import App from '../ui/App';
import SessionMenu, { type MenuSaveSlot, type MenuSaveStatus } from './SessionMenu';
import { applyCommand, createGame, getGameResult, getLegalCommands, getObservation } from '../core';
import { chooseBotCommand } from '../bots';
import type {
  BotDifficulty,
  GameCommand,
  GameOptions,
  GameState,
  TurnAcknowledgement,
  AppProps,
} from '../shared/types';
import { loadMatch, saveMatch, type Save } from './storage';
import { getTurnAcknowledgement, restoreTurnAcknowledgement } from './turn-handoff';
import { tutorialCommandAllowed } from '../ui/tutorial';

export interface GameSessionProps {
  onOpenNetwork?: () => void;
}

export default function GameSession({ onOpenNetwork }: GameSessionProps = {}) {
  const [state, setState] = useState<GameState | null>(null);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;
  const [saved, setSaved] = useState<Save | null>(null);
  const [tutorialSave, setTutorialSave] = useState<Save | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<TurnAcknowledgement | null>(null);
  const pendingTurnRef = useRef<TurnAcknowledgement | null>(null);
  function updatePendingTurn(value: TurnAcknowledgement | null) {
    pendingTurnRef.current = value;
    setPendingTurn(value);
  }
  const tutorialMode = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<GameState | null>(null);
  const sessionEpoch = useRef(0);
  const botFailures = useRef(0);
  const saveReadGeneration = useRef({ current: 0, tutorial: 0 });
  const mounted = useRef(false);
  const [menuSaves, setMenuSaves] = useState<Record<MenuSaveSlot, MenuSaveStatus>>({
    current: { loading: true, error: null },
    tutorial: { loading: true, error: null },
  });
  current.current = state;
  const readSave = useCallback((slot: MenuSaveSlot) => {
    const epoch = sessionEpoch.current;
    const generation = ++saveReadGeneration.current[slot];
    const version = createGame({ seed: 'version-check' }).rulesVersion;
    setMenuSaves((value) => ({ ...value, [slot]: { loading: true, error: null } }));
    loadMatch(version, slot)
      .then((value) => {
        if (
          mounted.current &&
          generation === saveReadGeneration.current[slot] &&
          ((epoch === sessionEpoch.current && !current.current) || tutorialMode.current)
        ) {
          if (slot === 'current') setSaved((existing) => existing ?? value);
          else if (epoch === sessionEpoch.current) setTutorialSave((existing) => existing ?? value);
        }
        if (mounted.current && generation === saveReadGeneration.current[slot])
          setMenuSaves((status) => ({ ...status, [slot]: { loading: false, error: null } }));
      })
      .catch((reason) => {
        if (
          mounted.current &&
          generation === saveReadGeneration.current[slot] &&
          epoch === sessionEpoch.current
        )
          setMenuSaves((status) => ({
            ...status,
            [slot]: { loading: false, error: String(reason?.message ?? reason) },
          }));
      })
      .finally(() => {
        if (
          mounted.current &&
          generation === saveReadGeneration.current[slot] &&
          epoch !== sessionEpoch.current
        )
          setMenuSaves((status) => ({ ...status, [slot]: { loading: false, error: null } }));
      });
  }, []);
  useEffect(() => {
    mounted.current = true;
    readSave('current');
    readSave('tutorial');
    return () => {
      mounted.current = false;
    };
  }, [readSave]);
  const persist = useCallback(
    (
      next: GameState,
      turn: TurnAcknowledgement | null,
      nextDifficulty: BotDifficulty,
      slot: 'current' | 'tutorial',
    ) => {
      const save: Save = {
        schemaVersion: 2,
        savedAt: new Date().toISOString(),
        difficulty: nextDifficulty,
        state: next,
        pendingTurn: turn,
      };
      let writing: Promise<void>;
      try {
        writing = saveMatch(next, nextDifficulty, slot, turn);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Не удалось сохранить действие. Повторите попытку.',
        );
        return false;
      }
      if (slot === 'tutorial') setTutorialSave(save);
      else setSaved(save);
      writing.catch(() =>
        setError('Последнее состояние сохранено в браузере, но основное хранилище недоступно.'),
      );
      return true;
    },
    [],
  );
  const commit = useCallback(
    (command: GameCommand, expected?: { epoch: number; revision: number }) => {
      const previous = current.current;
      if (!previous || pendingTurnRef.current) return false;
      if (
        expected &&
        (expected.epoch !== sessionEpoch.current || expected.revision !== previous.revision)
      )
        return false;
      if (
        previous.activePlayer === 0 &&
        tutorialMode.current &&
        !tutorialCommandAllowed(getObservation(previous, 0), command)
      )
        return false;
      const transition = applyCommand(previous, command);
      if (transition.error) {
        setError(transition.error);
        return false;
      }
      const turn = getTurnAcknowledgement(previous, transition);
      setError(null);
      if (
        !persist(
          transition.state,
          turn,
          difficultyRef.current,
          tutorialMode.current ? 'tutorial' : 'current',
        )
      )
        return false;
      current.current = transition.state;
      updatePendingTurn(turn);
      setState(transition.state);
      return true;
    },
    [persist],
  );
  useEffect(() => {
    if (!state || pendingTurn || state.phase === 'finished' || state.activePlayer === 0) return;
    const expected = { epoch: sessionEpoch.current, revision: state.revision };
    const timer = window.setTimeout(
      () => {
        if (
          expected.epoch !== sessionEpoch.current ||
          pendingTurnRef.current ||
          current.current?.revision !== expected.revision
        )
          return;
        const observation = getObservation(state, state.activePlayer);
        let command: GameCommand;
        try {
          command = chooseBotCommand(observation, difficulty);
        } catch {
          const fallback = getLegalCommands(observation)[0];
          if (!fallback) {
            setError('Нет доступного хода. Вернитесь в меню и продолжите сохранение.');
            return;
          }
          command = fallback;
        }
        const ok = commit(command, expected);
        if (!ok) {
          botFailures.current++;
          const fallback = getLegalCommands(observation)[0];
          if (fallback) commit(fallback, expected);
          else setError('Бот не смог завершить ход. Вернитесь в меню и продолжите сохранение.');
        } else botFailures.current = 0;
      },
      tutorial ? 550 : state.phase === 'action' ? 360 : 100,
    );
    return () => window.clearTimeout(timer);
  }, [state, difficulty, commit, tutorial, pendingTurn]);
  function start(options: GameOptions, nextDifficulty: BotDifficulty) {
    const seed =
      options.seed?.trim() || `europe-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
    const next = createGame({ ...options, seed });
    setError(null);
    if (!persist(next, null, nextDifficulty, 'current')) return;
    sessionEpoch.current++;
    updatePendingTurn(null);
    tutorialMode.current = false;
    setTutorial(false);
    current.current = next;
    difficultyRef.current = nextDifficulty;
    setDifficulty(nextDifficulty);
    setState(next);
  }
  function continueMatch() {
    if (!saved) return;
    sessionEpoch.current++;
    updatePendingTurn(restoreTurnAcknowledgement(saved.state, saved.pendingTurn));
    tutorialMode.current = false;
    setTutorial(false);
    current.current = saved.state;
    difficultyRef.current = saved.difficulty;
    setDifficulty(saved.difficulty);
    setState(saved.state);
    setError(null);
  }
  function startTutorial(savedLesson = false) {
    const next =
      savedLesson && tutorialSave
        ? tutorialSave.state
        : createGame({
            seed: 'europe-first-route-v1',
            playerCount: 2,
            playerName: 'Ваша компания',
          });
    const turn =
      savedLesson && tutorialSave
        ? restoreTurnAcknowledgement(next, tutorialSave.pendingTurn)
        : null;
    setError(null);
    if (!persist(next, turn, 'easy', 'tutorial')) return;
    sessionEpoch.current++;
    tutorialMode.current = true;
    setTutorial(true);
    current.current = next;
    updatePendingTurn(turn);
    difficultyRef.current = 'easy';
    setState(next);
    setDifficulty('easy');
  }
  const appProps: AppProps = {
    sessionId: sessionEpoch.current,
    observation: state ? getObservation(state, 0) : null,
    result: state ? getGameResult(state) : null,
    busy: !!state && !pendingTurn && state.phase !== 'finished' && state.activePlayer !== 0,
    pendingTurn: pendingTurn,
    error: error,
    canContinue: !!saved,
    difficulty: difficulty,
    tutorial: tutorial,
    canContinueTutorial: !!tutorialSave && tutorialSave.state.phase !== 'finished',
    onStartTutorial: () => startTutorial(),
    onContinueTutorial: () => startTutorial(true),
    onStart: start,
    onContinue: continueMatch,
    onOpenNetwork: onOpenNetwork,
    onCommand: (command, expected) => {
      if (current.current?.activePlayer !== 0 || expected.sessionId !== sessionEpoch.current)
        return false;
      return commit(command, { epoch: expected.sessionId, revision: expected.revision });
    },
    onEndTurn: (expected) => {
      if (
        expected.sessionId === sessionEpoch.current &&
        pendingTurnRef.current?.revision === expected.revision &&
        current.current?.revision === expected.revision
      ) {
        if (
          !persist(
            current.current,
            null,
            difficultyRef.current,
            tutorialMode.current ? 'tutorial' : 'current',
          )
        )
          return;
        updatePendingTurn(null);
      }
    },
    onMenu: () => {
      sessionEpoch.current++;
      updatePendingTurn(null);
      tutorialMode.current = false;
      setTutorial(false);
      current.current = null;
      setState(null);
      setError(null);
    },
    onClearError: () => setError(null),
  };
  return state ? (
    <App {...appProps} />
  ) : (
    <SessionMenu {...appProps} saves={menuSaves} onRetrySave={readSave} />
  );
}

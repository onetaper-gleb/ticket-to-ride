import { useCallback, useEffect, useRef, useState } from 'react';
import App from '../ui/App';
import { applyCommand, createGame, getGameResult, getLegalCommands, getObservation } from '../core';
import { chooseBotCommand } from '../bots';
import type { BotDifficulty, GameCommand, GameOptions, GameState } from '../shared/types';
import { loadMatch, saveMatch, type Save } from './storage';
import { tutorialCommandAllowed } from '../ui/tutorial';

export default function GameSession() {
  const [state, setState] = useState<GameState | null>(null);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const [saved, setSaved] = useState<Save | null>(null);
  const [tutorialSave, setTutorialSave] = useState<Save | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const tutorialMode = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<GameState | null>(null);
  const sessionEpoch = useRef(0);
  const botFailures = useRef(0);
  current.current = state;
  useEffect(() => {
    let mounted = true;
    const epoch = sessionEpoch.current;
    const version = createGame({ seed: 'version-check' }).rulesVersion;
    loadMatch(version)
      .then((value) => {
        if (
          mounted &&
          ((epoch === sessionEpoch.current && !current.current) || tutorialMode.current)
        )
          setSaved((existing) => existing ?? value);
      })
      .catch((reason) => {
        if (mounted && epoch === sessionEpoch.current) setError(String(reason.message ?? reason));
      });
    loadMatch(version, 'tutorial')
      .then((value) => {
        if (mounted && epoch === sessionEpoch.current) setTutorialSave(value);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const save: Save = { schemaVersion: 1, savedAt: new Date().toISOString(), difficulty, state };
    if (tutorial) setTutorialSave(save);
    else setSaved(save);
    saveMatch(state, difficulty, tutorial ? 'tutorial' : 'current').catch(() =>
      setError(
        'Браузер не разрешил сохранить партию. Можно продолжать играть, пока вкладка открыта.',
      ),
    );
  }, [state, difficulty, tutorial]);
  const commit = useCallback(
    (command: GameCommand, expected?: { epoch: number; revision: number }) => {
      const previous = current.current;
      if (!previous) return;
      if (
        expected &&
        (expected.epoch !== sessionEpoch.current || expected.revision !== previous.revision)
      )
        return;
      if (
        tutorialMode.current &&
        previous.activePlayer === 0 &&
        !tutorialCommandAllowed(getObservation(previous, 0), command)
      ) {
        setError(
          'В учебном рейсе выполните действие из подсказки. Обычная партия доступна из меню.',
        );
        return false;
      }
      const transition = applyCommand(previous, command);
      if (transition.error) {
        setError(transition.error);
        return false;
      }
      current.current = transition.state;
      setState(transition.state);
      setError(null);
      return true;
    },
    [],
  );
  useEffect(() => {
    if (!state || state.phase === 'finished' || state.activePlayer === 0) return;
    const expected = { epoch: sessionEpoch.current, revision: state.revision };
    const timer = window.setTimeout(
      () => {
        if (
          expected.epoch !== sessionEpoch.current ||
          current.current?.revision !== expected.revision
        )
          return;
        const observation = getObservation(state, state.activePlayer);
        let command: GameCommand;
        try {
          command = tutorial
            ? getLegalCommands(observation).find(
                (c) => c.type === 'chooseObjectives' || c.type === 'pass' || c.type === 'endTurn',
              )!
            : chooseBotCommand(observation, difficulty);
        } catch {
          command = getLegalCommands(observation).find((c) => c.type !== 'order') ?? {
            type: 'endTurn',
          };
        }
        const ok = commit(command, expected);
        if (!ok) {
          botFailures.current++;
          const fallback = getLegalCommands(observation).find((c) => c.type !== 'order');
          if (fallback) commit(fallback, expected);
          else setError('Бот не смог завершить ход. Вернитесь в меню и продолжите сохранение.');
        } else botFailures.current = 0;
      },
      tutorial ? 850 : state.phase === 'action' ? 360 : 100,
    );
    return () => window.clearTimeout(timer);
  }, [state, difficulty, commit, tutorial]);
  function start(options: GameOptions, nextDifficulty: BotDifficulty) {
    sessionEpoch.current++;
    tutorialMode.current = false;
    setTutorial(false);
    const seed =
      options.seed?.trim() || `river-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
    const next = createGame({ ...options, seed });
    current.current = next;
    setDifficulty(nextDifficulty);
    setState(next);
    setError(null);
  }
  function continueMatch() {
    if (!saved) return;
    sessionEpoch.current++;
    tutorialMode.current = false;
    setTutorial(false);
    current.current = saved.state;
    setDifficulty(saved.difficulty);
    setState(saved.state);
    setError(null);
  }
  function startTutorial(savedLesson = false) {
    sessionEpoch.current++;
    tutorialMode.current = true;
    setTutorial(true);
    const next =
      savedLesson && tutorialSave
        ? tutorialSave.state
        : createGame({ seed: 'first-rescue-v1', playerCount: 2, playerName: 'Учебная бригада' });
    current.current = next;
    setState(next);
    setDifficulty('easy');
    setError(null);
  }
  return (
    <App
      sessionId={sessionEpoch.current}
      observation={state ? getObservation(state, 0) : null}
      result={state ? getGameResult(state) : null}
      busy={!!state && state.phase !== 'finished' && state.activePlayer !== 0}
      error={error}
      canContinue={!!saved}
      difficulty={difficulty}
      tutorial={tutorial}
      canContinueTutorial={!!tutorialSave && tutorialSave.state.players[0]!.delivered.length === 0}
      onStartTutorial={() => startTutorial()}
      onContinueTutorial={() => startTutorial(true)}
      onStart={start}
      onContinue={continueMatch}
      onCommand={(command) => {
        if (current.current?.activePlayer === 0) commit(command);
      }}
      onMenu={() => {
        sessionEpoch.current++;
        tutorialMode.current = false;
        setTutorial(false);
        current.current = null;
        setState(null);
        setError(null);
      }}
      onClearError={() => setError(null)}
    />
  );
}

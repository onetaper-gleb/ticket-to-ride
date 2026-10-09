import { useEffect, useRef } from 'react';
import type { TutorialLesson } from './tutorial';
import './tutorial.css';

interface TutorialOverlayProps {
  lesson: TutorialLesson;
  onShow: () => void;
  onSkip: () => void;
  onFinish: () => void;
  onRestart: () => void;
}

export default function TutorialOverlay({
  lesson,
  onShow,
  onSkip,
  onFinish,
  onRestart,
}: TutorialOverlayProps) {
  return (
    <aside
      className="tutorial-coach"
      data-focus={lesson.focus ?? 'none'}
      data-lesson={lesson.id}
      aria-label="Обучение: первый рейс"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="tutorial-coach-heading">
        <span className="tutorial-kicker">Первый рейс · обучение</span>
        <span className="tutorial-step">
          {lesson.step}/{lesson.total}
        </span>
      </div>
      <div
        className="tutorial-progress"
        role="progressbar"
        aria-label="Шаг обучения"
        aria-valuemin={1}
        aria-valuemax={lesson.total}
        aria-valuenow={lesson.step}
      >
        {Array.from({ length: lesson.total }, (_, index) => (
          <span key={index} className={index < lesson.step ? 'passed' : ''} />
        ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h2>{lesson.title}</h2>
        <p className="tutorial-explanation">{lesson.text}</p>
        <p className="tutorial-action">
          <span>Сейчас</span>
          {lesson.action}
        </p>
      </div>
      <div className="tutorial-coach-actions">
        {lesson.complete ? (
          <>
            <p className="tutorial-menu-note">
              В меню можно начать партию или продолжить сохранённую.
            </p>
            <button className="button primary" onClick={onFinish}>
              К обычной игре <span aria-hidden="true">→</span>
            </button>
            <button className="tutorial-link" onClick={onRestart}>
              Повторить урок
            </button>
          </>
        ) : (
          <>
            {lesson.focus && (
              <button className="button secondary small" onClick={onShow}>
                Показать предмет <span aria-hidden="true">↗</span>
              </button>
            )}
            <button className="tutorial-link" onClick={onSkip}>
              Выйти из обучения
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

interface TutorialWelcomeProps {
  onStart: () => void;
  onDismiss: () => void;
}

export function TutorialWelcome({ onStart, onDismiss }: TutorialWelcomeProps) {
  const startButton = useRef<HTMLButtonElement>(null);
  const dismissButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    startButton.current?.focus();
  }, []);

  return (
    <div className="tutorial-welcome-backdrop">
      <section
        className="tutorial-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-welcome-title"
        aria-describedby="tutorial-welcome-description"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onDismiss();
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            (document.activeElement === startButton.current
              ? dismissButton
              : startButton
            ).current?.focus();
          }
          event.stopPropagation();
        }}
      >
        <span className="tutorial-kicker">Речной · эвакуационная операция</span>
        <h1 id="tutorial-welcome-title">Успеть до воды</h1>
        <p id="tutorial-welcome-description" className="tutorial-welcome-goal">
          Доставляйте жителей в два убежища до подъёма воды. Победит бригада с наибольшим числом
          очков.
        </p>
        <p className="tutorial-welcome-city">
          Спасённые всеми бригадами жители — общий результат города. Партия длится до 12 раундов.
        </p>
        <div
          className="tutorial-route"
          aria-label="Первый рейс: Северный холм — Старый рынок — Северный холм"
        >
          <div>
            <span className="tutorial-route-icon" aria-hidden="true">
              T1
            </span>
            <strong>Северный холм</strong>
            <small>Отправление</small>
          </div>
          <span className="tutorial-route-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="tutorial-route-icon residents" aria-hidden="true">
              2
            </span>
            <strong>Старый рынок</strong>
            <small>Забрать жителей</small>
          </div>
          <span className="tutorial-route-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="tutorial-route-icon refuge" aria-hidden="true">
              ⌂
            </span>
            <strong>Северный холм</strong>
            <small>Доставить · очки</small>
          </div>
        </div>
        <p className="tutorial-welcome-invitation">
          В обучении вы выберете бонусы, возьмёте материалы и выполните этот рейс на настоящем поле.
          Инструктор оставит жителей вам.
        </p>
        <div className="tutorial-welcome-actions">
          <button ref={startButton} className="button primary" onClick={onStart}>
            Пройти обучение <span aria-hidden="true">→</span>
          </button>
          <button ref={dismissButton} className="button secondary" onClick={onDismiss}>
            Играть без обучения
          </button>
        </div>
        <p className="tutorial-menu-note">
          Обучение доступно в меню. Оно сохраняется отдельно от обычной партии.
        </p>
      </section>
    </div>
  );
}

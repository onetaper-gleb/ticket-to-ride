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
      aria-label="Обучение: первый маршрут"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="tutorial-coach-heading">
        <span className="tutorial-kicker">Europe · первый маршрут</span>
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
        style={{ gridTemplateColumns: `repeat(${lesson.total}, 1fr)` }}
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
            <button className="button primary" onClick={onFinish}>
              Продолжить партию <span aria-hidden="true">→</span>
            </button>
            <button className="tutorial-link" onClick={onSkip}>
              В меню
            </button>
            <button className="tutorial-link" onClick={onRestart}>
              Повторить обучение
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

export function TutorialWelcome({
  onStart,
  onDismiss,
}: {
  onStart: () => void;
  onDismiss: () => void;
}) {
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
        <span className="tutorial-kicker">Ticket to Ride: Europe · классические правила</span>
        <h1 id="tutorial-welcome-title">Соедините Европу</h1>
        <p id="tutorial-welcome-description" className="tutorial-welcome-goal">
          Собирайте карты вагонов, занимайте маршруты и соединяйте города из своих билетов.
          Побеждает игрок с наибольшим числом очков.
        </p>
        <p className="tutorial-welcome-city">
          Выполненный билет прибавляет очки, невыполненный вычитает. Занятые маршруты принадлежат
          игрокам.
        </p>
        <div
          className="tutorial-route"
          aria-label="Карты вагонов — занять маршрут — соединить города"
        >
          <div>
            <span className="tutorial-route-icon" aria-hidden="true">
              ▰
            </span>
            <strong>Карты вагонов</strong>
            <small>Собрать один цвет</small>
          </div>
          <span className="tutorial-route-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="tutorial-route-icon residents" aria-hidden="true">
              Ⅱ
            </span>
            <strong>Маршрут</strong>
            <small>Занять участок</small>
          </div>
          <span className="tutorial-route-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="tutorial-route-icon refuge" aria-hidden="true">
              ✓
            </span>
            <strong>Билет</strong>
            <small>Соединить города</small>
          </div>
        </div>
        <p className="tutorial-welcome-invitation">
          Обучение покажет управление до первого занятого маршрута. Оно проходит по обычным правилам
          и сохраняется отдельно.
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
          Приблизить поле — пробел. За столом выбирайте предметы движением мыши и нажимайте ЛКМ.
        </p>
      </section>
    </div>
  );
}

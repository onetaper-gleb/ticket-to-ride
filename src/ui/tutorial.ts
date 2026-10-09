import type { GameCommand, Observation, TrainOrder } from '../shared/types';

export interface TutorialLesson {
  id: string;
  step: number;
  total: number;
  title: string;
  text: string;
  action: string;
  focus: 'goals' | 'deck' | 'board' | 'dock' | 'paper' | null;
  target?: {
    kind: 'station' | 'train' | 'control' | 'objective' | 'deck';
    id: string;
  };
  complete: boolean;
}

const TOTAL_STEPS = 8;
const TRAIN_ID = 'p0-t1';

function firstRoute(order: TrainOrder): boolean {
  return (
    order.mode === 'evacuate' &&
    order.destination === 'market' &&
    order.returnTo === 'hill' &&
    !order.repeat &&
    !order.confirmRisk
  );
}

function lesson(
  step: number,
  fields: Omit<TutorialLesson, 'step' | 'total' | 'complete'>,
  complete = false,
): TutorialLesson {
  return { ...fields, step, total: TOTAL_STEPS, complete };
}

/** Advances only after the core has accepted an action or delivered actual cargo. */
export function getTutorialLesson(observation: Observation): TutorialLesson {
  const train = observation.trains.find((item) => item.id === TRAIN_ID);
  if (observation.round >= 3 && observation.self.delivered.length > 0) {
    return lesson(
      8,
      {
        id: 'delivered',
        title: 'Первый рейс выполнен',
        text: `В убежище доставлены ${observation.self.delivered.length} группы. Ваш счёт — ${observation.self.score}. Обычная группа даёт 2 очка, приоритетная — 3. Личный бонус добавляет 3. Очки появляются после доставки.`,
        action:
          'В обычной партии выбирайте новые рейсы и успевайте до воды. Ремонт открывает линии всем; экспресс ускоряет свой поезд на один шаг.',
        focus: 'board',
        target: { kind: 'station', id: 'hill' },
      },
      true,
    );
  }

  if (observation.activePlayer !== observation.self.id) {
    const loaded = Boolean(train?.cargo.length);
    const passedThisRound = observation.events.some(
      (event) =>
        event.round === observation.round &&
        event.playerId === observation.self.id &&
        event.kind === 'pass',
    );
    const waitingStep =
      observation.phase === 'setup'
        ? 1
        : loaded
          ? passedThisRound
            ? 7
            : 6
          : train && firstRoute(train.order)
            ? 5
            : 2;
    return lesson(waitingStep, {
      id: `instructor-${observation.phase}-${loaded ? 'loaded' : 'empty'}`,
      title: 'Ход инструктора',
      text:
        observation.phase === 'setup'
          ? 'Инструктор выбирает свои бонусы. В обучении он оставляет жителей на Старом рынке вам.'
          : 'Сначала ходят все бригады. Затем поезда делают шаг одновременно. Нажатие на город само по себе поезд не двигает.',
      action: 'Подождите движения. Следующий шаг появится автоматически.',
      focus: observation.phase === 'setup' ? null : 'board',
      ...(observation.phase === 'setup'
        ? {}
        : { target: { kind: 'train' as const, id: TRAIN_ID } }),
    });
  }

  if (observation.phase === 'setup') {
    return lesson(1, {
      id: 'objectives',
      title: 'Выберите два личных бонуса',
      text: 'Карточки слева внизу — задания бригады. Доставьте 2 группы из выбранного района и получите +3 очка. Вывозить можно людей из любого района.',
      action:
        'Переведите мышь в левый нижний угол. Отметьте два района, затем нажмите «Принять задания» на листе справа.',
      focus: 'goals',
      target: { kind: 'objective', id: observation.self.objectiveOptions[0]! },
    });
  }

  if (observation.phase === 'discard') {
    return lesson(3, {
      id: 'discard',
      title: 'В руке помещается 10 карт',
      text: 'Лишние материалы нужно сбросить перед приказами. Выбранная карта приподнята над рукой.',
      action: 'В нижней зоне выберите лишнюю карту и нажмите ЛКМ.',
      focus: null,
    });
  }

  if (observation.round === 1) {
    if (observation.phase === 'action') {
      return lesson(2, {
        id: 'first-material',
        title: 'Одно основное действие за ход',
        text: 'Можно набрать материалы, отремонтировать линию или ускорить поезд. Сейчас возьмём карты для будущего ремонта. Первый маршрут уже открыт.',
        action:
          'Переведите мышь в левую область. Двигайтесь вниз и вправо к закрытой колоде (нижняя справа). ЛКМ берёт выделенную карту; рамка показывает выбор.',
        focus: 'deck',
        target: { kind: 'deck', id: 'deck' },
      });
    }
    if (observation.phase === 'draw') {
      return lesson(3, {
        id: 'second-material',
        title: 'Доберите вторую карту',
        text: 'Две карты из закрытой колоды считаются одним действием. Материалы появились у вас в руке. Открытая универсальная карта занимает весь добор.',
        action: 'Ещё раз нажмите на закрытую колоду слева. Затем будут доступны приказы поездам.',
        focus: 'deck',
        target: { kind: 'deck', id: 'deck' },
      });
    }
    if (train && firstRoute(train.order)) {
      return lesson(5, {
        id: 'first-departure',
        title: 'Приказ принят. Пора отправляться',
        text: 'Поезд T1 поедет на Старый рынок и вернётся в Северный холм. После ваших приказов ходит инструктор; затем начнётся движение.',
        action:
          'Переведите мышь в правый нижний угол. Выберите звонок «Закончить ход» и нажмите ЛКМ.',
        focus: 'dock',
        target: { kind: 'control', id: 'endTurn' },
      });
    }
    return lesson(4, {
      id: 'first-order',
      title: 'Назначьте рейс поезду T1',
      text: 'Жителей нужно забрать со станции и довезти до убежища. У T1 два места. Старый рынок соединён с Северным холмом работающей линией.',
      action:
        'Из центра нажмите пробел: поле приблизится и появится курсор. Выберите оранжевый T1 → Старый рынок → Северный холм. Повторный клик по убежищу подтверждает приказ.',
      focus: 'board',
      target: { kind: 'train', id: TRAIN_ID },
    });
  }

  if (observation.phase === 'action') {
    return lesson(6, {
      id: 'loaded',
      title: 'Жители в поезде. Рейс ещё не окончен',
      text: `T1 на Старом рынке: ${train?.cargo.length ?? 0} из 2 мест занято. Очки появятся в убежище. Приказ сохранён — поезд уже знает обратный путь.`,
      action:
        'Для этого короткого рейса новые материалы не нужны. Нажмите «Пропустить действие» — это переход к приказам, а не конец хода.',
      focus: 'board',
      target: { kind: 'train', id: TRAIN_ID },
    });
  }

  return lesson(7, {
    id: 'return-home',
    title: 'Завершите обратный рейс',
    text: 'Заново назначать тот же маршрут не нужно. После завершения раунда T1 вернётся в убежище и высадит жителей.',
    action: 'Нажмите звонок «Закончить ход». Дождитесь возвращения поезда и изменения счёта.',
    focus: 'dock',
    target: { kind: 'control', id: 'endTurn' },
  });
}

/** A teaching constraint on human intent; the core still owns all legality checks. */
export function tutorialCommandAllowed(observation: Observation, command: GameCommand): boolean {
  if (
    observation.activePlayer !== observation.self.id ||
    (observation.round >= 3 && observation.self.delivered.length > 0) ||
    observation.phase === 'finished'
  )
    return false;
  if (observation.phase === 'setup') return command.type === 'chooseObjectives';
  if (observation.phase === 'discard') return command.type === 'discard';
  if (observation.round === 1) {
    if (observation.phase === 'action' || observation.phase === 'draw')
      return command.type === 'draw' && command.source === 'deck';
    if (observation.phase !== 'orders') return false;
    const train = observation.trains.find((item) => item.id === TRAIN_ID);
    if (train && firstRoute(train.order)) return command.type === 'endTurn';
    return command.type === 'order' && command.trainId === TRAIN_ID && firstRoute(command.order);
  }
  if (observation.phase === 'action') return command.type === 'pass';
  return observation.phase === 'orders' && command.type === 'endTurn';
}

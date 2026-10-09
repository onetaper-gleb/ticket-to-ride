import { getLegalCommands } from '../core';
import type { GameCommand, Observation } from '../shared/types';
import type { TableInteraction } from '../scene/interaction';

export interface TutorialLesson {
  id: string;
  step: number;
  total: number;
  title: string;
  text: string;
  action: string;
  focus: 'goals' | 'deck' | 'paper' | 'board' | 'dock' | null;
  target?: TableInteraction;
  complete: boolean;
}

export function getTutorialLesson(observation: Observation): TutorialLesson {
  const base = { total: 4, complete: false };
  const ownRoutes = observation.edges.filter((edge) => edge.owner === observation.self.id);
  if (ownRoutes.length > 0) {
    return {
      ...base,
      id: 'first-route-complete',
      step: 4,
      title: 'Первый маршрут ваш',
      text: `Вы заняли участок и получили очки. Теперь соединяйте города из билетов своей сетью. Выполненный билет прибавит очки в конце партии, невыполненный вычтет их.`,
      action:
        'Продолжайте эту партию или вернитесь в меню. Памятка объясняет тоннели, паромы и станции.',
      focus: 'board',
      target: { kind: 'edge', id: ownRoutes[0]!.id },
      complete: true,
    };
  }
  if (observation.phase === 'finished') {
    return {
      ...base,
      id: 'finished-without-route',
      step: 3,
      title: 'Партия закончилась',
      text: 'В этой партии вы не заняли маршрут. Обучение завершится после первого построенного участка.',
      action: 'Начните обучение снова из меню.',
      focus: 'dock',
      target: { kind: 'control', id: 'menu' },
    };
  }
  if (observation.activePlayer !== observation.self.id) {
    return {
      ...base,
      id: `waiting-${observation.phase}`,
      step: observation.self.tickets.length ? 2 : 1,
      title: 'Сейчас ходит соперник',
      text: 'Игроки ходят по очереди. Занятые маршруты становятся их собственностью. Чужие карты и билеты скрыты.',
      action: 'Пока соперник выбирает действие, осмотрите поле и города из своих билетов.',
      focus: null,
    };
  }
  if (observation.phase === 'setup' || observation.phase === 'tickets') {
    const setup = observation.phase === 'setup';
    return {
      ...base,
      id: setup ? 'choose-starting-tickets' : 'choose-new-tickets',
      step: setup ? 1 : 2,
      title: setup ? 'Билеты задают вашу цель' : 'Новые билеты — новый риск',
      text: setup
        ? 'Соедините два города своей сетью. Выполненный билет прибавит его очки, невыполненный вычтет.'
        : 'Из трёх новых билетов нужно оставить хотя бы один. Уже выбранные билеты нельзя вернуть.',
      action: `Выберите ${setup ? 'минимум два билета' : 'хотя бы один билет'} слева внизу. Подтвердите их на листе справа.`,
      focus: 'goals',
      target: { kind: 'objective', id: observation.self.ticketOptions[0]?.id ?? '' },
    };
  }
  if (observation.phase === 'draw') {
    return {
      ...base,
      id: 'second-train-card',
      step: 2,
      title: 'Завершите добор',
      text: 'За ход можно взять две карты вагонов. Открытый локомотив занимает весь добор, поэтому второй открытой картой его взять нельзя.',
      action:
        'Возьмите вторую цветную карту слева или нажмите закрытую колоду. Локомотив вслепую считается обычным выбором.',
      focus: 'deck',
      target: { kind: 'deck', id: 'deck' },
    };
  }
  if (observation.phase === 'tunnel') {
    return {
      ...base,
      id: 'tunnel-surcharge',
      step: 3,
      title: 'Тоннель потребовал доплату',
      text: `Из колоды открыты три карты. Совпавший цвет и локомотивы добавили ${observation.pendingTunnel?.extraCost ?? 0} к цене.`,
      action:
        'На листе справа доплатите картами того же цвета либо откажитесь. При отказе базовые карты вернутся, ход закончится.',
      focus: 'paper',
      target: { kind: 'control', id: 'declineTunnel' },
    };
  }
  const claim = getLegalCommands(observation).find((command) => command.type === 'claim');
  if (claim?.type === 'claim') {
    const edge = observation.edges.find((item) => item.id === claim.edgeId)!;
    const city = (id: string) => observation.cities.find((item) => item.id === id)?.name ?? id;
    return {
      ...base,
      id: 'claim-first-route',
      step: 3,
      title: 'Теперь можно занять маршрут',
      text: `Например, вам хватает карт на ${city(edge.a)} — ${city(edge.b)}. За участок сразу начислят очки. Вагоны на поле отмечают занятые участки.`,
      action:
        'Нажмите пробел, выберите свободный участок курсором. Вернитесь пробелом к столу и нажмите «Занять маршрут» на листе справа.',
      focus: 'board',
      target: { kind: 'edge', id: edge.id },
    };
  }
  return {
    ...base,
    id: 'collect-train-cards',
    step: 2,
    title: 'Соберите карты для маршрута',
    text: 'Для участка нужны карты одного цвета: столько, сколько клеток на линии. Серый участок оплачивается любым одним цветом. Локомотив заменяет цвет.',
    action:
      'В левой зоне выберите открытую карту или закрытую колоду и нажмите ЛКМ. Добор карт занимает весь ход.',
    focus: 'deck',
    target: { kind: 'deck', id: 'deck' },
  };
}

export function tutorialCommandAllowed(_observation: Observation, _command: GameCommand): boolean {
  return true;
}

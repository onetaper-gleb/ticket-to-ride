import type { CardColor, District, Edge, Group, Station } from '../shared/types';

export const RULES_VERSION = 'last-train-0.1.0';
export const COLORS: Exclude<CardColor, 'wild'>[] = ['red', 'blue', 'yellow', 'green'];
export const DISTRICTS: District[] = ['harbor', 'old-town', 'industrial', 'garden'];
export const DISTRICT_NAMES: Record<District, string> = {
  harbor: 'Порт',
  'old-town': 'Старый город',
  industrial: 'Промзона',
  garden: 'Сады',
};
export const PLAYER_COLORS = ['#ef9e48', '#55b6d5', '#b28ade', '#8abf78'];
export const LAST_ROUND = 12;
export const HAND_LIMIT = 10;
export const CAPACITY = 2;
export const REPAIR_SCORE_CAP = 4;
export const FIRST_PLAYERS: Record<number, number[]> = {
  2: [0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0],
  3: [0, 1, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2],
  4: [0, 1, 2, 3, 0, 2, 1, 3, 2, 0, 3, 1],
};

type StationDefinition = [string, string, number, number, number | null, District | null];
const stationDefinitions: StationDefinition[] = [
  ['hill', 'Северный холм', -6, -6, null, null],
  ['upper', 'Верхний вокзал', 6, -6, null, null],
  ['ridge', 'Тихая аллея', -4, -3, 12, 'garden'],
  ['orchard', 'Яблоневый сад', 0, -3, 12, 'garden'],
  ['park', 'Зелёный парк', 4, -3, 12, 'garden'],
  ['bridge', 'Мостовая', 0, 0, 10, 'industrial'],
  ['works', 'Заводская', 2, 1, 10, 'industrial'],
  ['depot', 'Депо', 6, 0, 10, 'industrial'],
  ['market', 'Старый рынок', -4, 2, 8, 'old-town'],
  ['school', 'Школьная', -6, 4, 8, 'old-town'],
  ['square', 'Ратушная площадь', 0, 4, 8, 'old-town'],
  ['pier', 'Причал', -4, 7, 6, 'harbor'],
  ['quay', 'Набережная', 4, 7, 6, 'harbor'],
  ['dock', 'Сухой док', 0, 9, 6, 'harbor'],
];
type EdgeDefinition = [string, string, Edge['color'], number, boolean?];
const edgeDefinitions: EdgeDefinition[] = [
  ['hill', 'market', 'red', 1, true],
  ['market', 'pier', 'red', 2, true],
  ['upper', 'depot', 'blue', 1, true],
  ['depot', 'quay', 'blue', 2, true],
  ['market', 'school', 'yellow', 1, true],
  ['depot', 'works', 'red', 1, true],
  ['hill', 'ridge', 'green', 1, true],
  ['upper', 'park', 'green', 1, true],
  ['hill', 'orchard', 'green', 2],
  ['orchard', 'ridge', 'green', 1],
  ['orchard', 'park', 'yellow', 1],
  ['orchard', 'bridge', 'gray', 3],
  ['ridge', 'school', 'green', 2],
  ['market', 'square', 'yellow', 2],
  ['school', 'pier', 'red', 1],
  ['pier', 'dock', 'gray', 1],
  ['dock', 'quay', 'blue', 1],
  ['quay', 'square', 'blue', 2],
  ['square', 'bridge', 'yellow', 1],
  ['bridge', 'works', 'red', 1],
  ['works', 'park', 'green', 2],
  ['depot', 'park', 'blue', 1],
  ['market', 'bridge', 'gray', 2],
  ['square', 'dock', 'yellow', 2],
];

export function createBoard(playerCount: number): { stations: Station[]; edges: Edge[] } {
  const stations = stationDefinitions.map(([id, name, x, z, floodRound, district]) => {
    const groups: Group[] = district
      ? Array.from({ length: playerCount }, (_, index) => ({
          id: `${id}-g${index + 1}`,
          district,
          priority: (id === 'pier' || id === 'school') && index < 2,
        }))
      : [];
    return {
      id,
      name,
      x,
      z,
      height:
        floodRound === null
          ? 2.2
          : floodRound === 12
            ? 1.8
            : floodRound === 10
              ? 1.25
              : floodRound === 8
                ? 0.75
                : 0.3,
      floodRound,
      district,
      safe: floodRound === null,
      flooded: false,
      groups,
    };
  });
  const edges = edgeDefinitions.map(([a, b, color, cost, open = false]) => ({
    id: `${a}-${b}`,
    a,
    b,
    color,
    cost,
    open,
    initialOpen: open,
    builder: null,
    credited: false,
  }));
  return { stations, edges };
}

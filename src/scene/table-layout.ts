export const TABLE_LAYOUT = {
  table: { width: 46, depth: 34 },
  board: { width: 24, depth: 16 },
  stock: { x: -16.15, z: 1.1, width: 6.2, depth: 12.4 },
  paper: { x: 16.3, y: 2.15, z: 2.3, width: 6.65, height: 9.1 },
  score: { x: -16.15, y: 1.25, z: -9.55, width: 6.2, height: 4.5 },
  goals: { x: -14.25, z: 11.7 },
  dock: { x: 13.05, z: 12.3, spacing: 2.8 },
  bell: { x: 9.8, z: 11.6 },
} as const;

export const TABLE_CAMERA = {
  overview: { position: [0, 31, 34], target: [0, 0.0, 0.8] },
  board: { position: [0, 22, 5.0], target: [0, -0.5, 0] },
  deck: { position: [-16.15, 17.7, 11.8], target: [-16.15, -1.1, 1.1] },
  paper: { position: [16.3, 12.2, 12.3], target: [16.3, 2.15, 2.3] },
  goals: { position: [-14.25, 7.8, 18.7], target: [-14.25, -1.1, 11.7] },
  dock: { position: [14.2, 10.2, 21], target: [14.2, -1.1, 12.3] },
  hand: { position: [0, 30, 32], target: [0, 0.0, 0.8] },
} as const;

export function tableOverviewFit(aspect: number) {
  return Math.max(1, 16 / 9 / aspect);
}

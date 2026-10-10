import * as THREE from 'three';

export type MenuRect = { x: number; y: number; width: number; height: number };
export type MenuCompositionPreset = {
  kind: 'desktop' | 'ultrawide' | 'narrow' | 'compact' | 'column';
  board: MenuRect;
  settings: MenuRect;
  camera: readonly [number, number, number];
  railway: readonly [number, number, number];
  fov: number;
  buildingYaw: number;
};

export function menuCompositionPreset(width: number, height: number): MenuCompositionPreset {
  if (![width, height].every((v) => Number.isFinite(v) && v > 0))
    throw new Error('Menu viewport must have positive finite dimensions');
  const desktop = width >= 1100 && height >= 680;
  const narrow = width >= 760 && width < 1100 && height >= 760 && width / height < 1.25;
  const referenceScale = Math.min(width / 1672, height / 941);
  const centerOffset = Math.max(0, (width - 1672 * referenceScale) / 2);
  const board = desktop
    ? {
        x: centerOffset + 60 * referenceScale,
        y: 50 * referenceScale,
        width: Math.max(420, 510 * referenceScale),
        height: Math.max(454, 596 * referenceScale),
      }
    : narrow
      ? {
          x: 32,
          y: THREE.MathUtils.clamp(height * 0.272, 220, 360),
          width: Math.min(400, width - 64),
          height: 470,
        }
      : {
          x: width >= 760 ? 24 : 16,
          y: width >= 760 ? 40 : 24,
          width: Math.min(360, width - 32),
          height: 438,
        };
  const settings = desktop
    ? {
        x: centerOffset + 125 * referenceScale,
        y: 655 * referenceScale,
        width: Math.max(340, 390 * referenceScale),
        height: Math.max(64, 98 * referenceScale),
      }
    : {
        x: board.x + 16,
        y: board.y + board.height + (desktop || narrow ? 24 : 20),
        width: board.width - 32,
        height: narrow ? 64 : 56,
      };
  return {
    kind: desktop
      ? width > 1920
        ? 'ultrawide'
        : 'desktop'
      : narrow
        ? 'narrow'
        : width >= 760
          ? 'compact'
          : 'column',
    board,
    settings,
    camera: narrow ? [-0.58, 0.17, 7.1] : desktop ? [0.04, 0.52, 6.4] : [-0.65, 0.4, 5.5],
    railway: [narrow ? 2.0 : desktop ? 3.5 : 2.45, -0.65, -3.1],
    fov: 34,
    buildingYaw: THREE.MathUtils.degToRad(27),
  };
}

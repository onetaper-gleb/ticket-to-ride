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
  luggageAdvance: number;
  desktopPrint?: {
    actionsHeight: number;
    headerPaddingBottom: number;
    boardPaddingLeftExtra: number;
    copyPaddingLeft: number;
    settingsIconSize: number;
  };
  dom: {
    pad: number;
    hh: number;
    rh: number;
    th: number;
    gap: number;
    headgap: number;
    fs: number;
    tf: number;
    sf: number;
    is: number;
    im: number;
    ic: number;
    mark: number;
    hint: number;
    touch: number;
  };
};

export function menuCompositionPreset(width: number, height: number): MenuCompositionPreset {
  if (![width, height].every((v) => Number.isFinite(v) && v > 0))
    throw new Error('Menu viewport must have positive finite dimensions');
  const desktop = width >= 1100 && height >= 680;
  const narrow = width >= 760 && width < 1100 && height >= 760 && width / height < 1.25;
  let effectiveWidth = Math.min(width, 1920);
  if (effectiveWidth * (941 / 1672) > height + 1) effectiveWidth = (height * 1672) / 941;
  const q = THREE.MathUtils.clamp(effectiveWidth, 1280, 1920);
  const index = q <= 1672 ? 0 : 1;
  const knots = [1280, 1672, 1920];
  const t = (q - knots[index]) / (knots[index + 1] - knots[index]);
  const mix = (values: readonly number[]) =>
    THREE.MathUtils.lerp(values[index], values[index + 1], t);
  const compact = !desktop && !narrow && width >= 760;
  const fs = desktop ? mix([36.8, 46, 50.6]) : narrow ? 23 : compact ? 24 : 27;
  const dom = {
    pad: desktop ? mix([12, 12, 16]) : 12,
    hh: desktop ? mix([86, 122, 148]) : 80,
    rh: desktop ? mix([76, 94, 103]) : narrow ? 72 : compact ? 76 : 84,
    th: desktop ? mix([76, 94, 103]) : narrow ? 100 : compact ? 106 : 116,
    gap: desktop ? mix([4.5, 6, 7.5]) : 6,
    headgap: desktop ? mix([16, 12, 18]) : 12,
    fs,
    tf: desktop ? mix([27.43, 32, 36.57]) : fs,
    sf: desktop ? mix([24.375, 30, 33.75]) : fs,
    is: desktop ? mix([45.82, 56, 61.09]) : 32,
    im: desktop ? mix([2, 4, 4]) : 4,
    ic: desktop ? mix([75.38, 98, 109.31]) : 60,
    mark: desktop ? mix([300, 370, 414]) : 340,
    hint: desktop ? 24 : fs,
    touch: desktop ? 64 : narrow ? 60 : compact ? 64 : 72,
  };
  const board = {
    x: desktop ? Math.max(0, (width - q) / 2) + mix([46, 60, 69]) : narrow ? 32 : compact ? 24 : 16,
    y: desktop
      ? Math.max(0, (height - (q * 941) / 1672) / 2) + mix([38, 50, 57])
      : narrow
        ? THREE.MathUtils.clamp(height * 0.272, 220, 360)
        : compact
          ? 40
          : 24,
    width: desktop
      ? mix([420, 510, 580])
      : Math.min(narrow ? 400 : 360, width - (narrow ? 64 : 32)),
    // The print fit redistributes space inside the accepted physical frame.
    height:
      24 +
      2 * dom.pad +
      (desktop ? mix([96, 136, 164]) : dom.hh) +
      dom.headgap +
      3 * dom.rh +
      dom.th +
      3 * (desktop ? mix([6, 8, 10]) : dom.gap),
  };
  const settings = {
    x: board.x + (desktop ? mix([50, 65, 75]) : 16),
    y: board.y + board.height + (desktop ? mix([14, 9, 16]) : narrow ? 24 : 20),
    width: desktop ? mix([340, 390, 448]) : board.width - 32,
    height: desktop ? mix([76, 98, 112]) : narrow || compact ? 64 : 72,
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
    luggageAdvance: desktop ? mix([0.8, 0, 0]) : 0,
    desktopPrint: desktop
      ? {
          actionsHeight: 3 * dom.rh + dom.th + 3 * mix([6, 8, 10]) + mix([96, 136, 164]) - dom.hh,
          headerPaddingBottom: mix([11, 14, 16]),
          boardPaddingLeftExtra: mix([15, 19, 22]),
          copyPaddingLeft: mix([16, 20, 23]),
          settingsIconSize: mix([38.4, 48, 55]),
        }
      : undefined,
    dom,
  };
}

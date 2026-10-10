// Exponential smoothing preserves the same motion duration at every display refresh rate.
export function motionBlend(elapsedSeconds: number, timeConstant = 0.12, reducedMotion = false) {
  if (reducedMotion) return 1;
  return 1 - Math.exp(-Math.max(0, elapsedSeconds) / timeConstant);
}

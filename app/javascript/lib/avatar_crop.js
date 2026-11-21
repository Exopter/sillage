// Framing maths for a profile photo shown through a round viewport. A frame
// places the image over the square that bounds the circle (the "stage"): `x`
// and `y` are the image's top-left corner in stage pixels and `scale` is stage
// pixels per source pixel.

/** @typedef {{x: number, y: number, scale: number}} Frame */

export const MAX_ZOOM = 4
export const OUTPUT_SIZE = 512

/** Smallest scale at which the image still covers the whole stage.
 * @param {number} width @param {number} height @param {number} stage */
export function coverScale(width, height, stage) {
  return stage / Math.min(width, height)
}

/** Keeps the zoom in range and the stage fully covered by the image.
 * @param {Frame} frame @param {number} width @param {number} height @param {number} stage @returns {Frame} */
export function clampFrame(frame, width, height, stage) {
  const cover = coverScale(width, height, stage)
  const scale = Math.min(Math.max(frame.scale, cover), cover * MAX_ZOOM)
  /** @param {number} offset @param {number} size */
  const clamp = (offset, size) => Math.min(0, Math.max(stage - size * scale, offset))
  return { scale, x: clamp(frame.x, width), y: clamp(frame.y, height) }
}

/** @param {number} width @param {number} height @param {number} stage @returns {Frame} */
export function centeredFrame(width, height, stage) {
  const scale = coverScale(width, height, stage)
  return { scale, x: (stage - width * scale) / 2, y: (stage - height * scale) / 2 }
}

/** Zooms while keeping the source point under (`pivotX`, `pivotY`) in place.
 * @param {Frame} frame @param {number} scale @param {number} pivotX @param {number} pivotY
 * @param {number} width @param {number} height @param {number} stage @returns {Frame} */
export function zoomFrame(frame, scale, pivotX, pivotY, width, height, stage) {
  const next = clampFrame({ ...frame, scale }, width, height, stage).scale
  const ratio = next / frame.scale
  return clampFrame({
    scale: next,
    x: pivotX - (pivotX - frame.x) * ratio,
    y: pivotY - (pivotY - frame.y) * ratio
  }, width, height, stage)
}

/** Square of the source image visible in the stage, in source pixels.
 * @param {Frame} frame @param {number} stage */
export function sourceSquare(frame, stage) {
  return { x: (0 - frame.x) / frame.scale, y: (0 - frame.y) / frame.scale, size: stage / frame.scale }
}

/** The same framing on a stage resized by `ratio`.
 * @param {Frame} frame @param {number} ratio @returns {Frame} */
export function scaleFrame(frame, ratio) {
  return { x: frame.x * ratio, y: frame.y * ratio, scale: frame.scale * ratio }
}

/** @param {number} value @param {number} minimum @param {number} maximum */
export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * @param {number} width
 * @param {number} height
 * @param {{ id: string, mode: string }[]} widgets
 * @param {string} largeId
 */
export function signalLayoutPreset(width, height, widgets, largeId) {
  const gap = 10
  const padding = 8
  const minimumSideWidth = width < 960 ? 300 : 250
  const preferredLargeWidth = Math.max(420, Math.round(width * 0.68) - gap)
  const largeWidth = Math.max(360, Math.min(preferredLargeWidth, width - minimumSideWidth - gap - padding * 2))
  const sideWidth = Math.max(minimumSideWidth, width - largeWidth - gap - padding * 2)
  const sideWidgets = widgets.filter((widget) => widget.id !== largeId)
  const availableSideHeight = height - padding * 2 - gap
  const visibleSide = sideWidgets.filter((widget) => widget.mode !== "hidden")
  const hiddenHeight = sideWidgets.filter((widget) => widget.mode === "hidden").length * 38
  const miniHeight = visibleSide.length ? Math.max(150, (availableSideHeight - hiddenHeight) / visibleSide.length) : 38
  let top = padding
  /** @type {Record<string, { left: number, top: number, width: number, height: number }>} */
  const rectangles = {}

  rectangles[largeId] = { left: padding, top: padding, width: largeWidth, height: height - padding * 2 }
  sideWidgets.forEach((widget) => {
    const widgetHeight = widget.mode === "hidden" ? 38 : miniHeight
    rectangles[widget.id] = {
      left: padding + largeWidth + gap,
      top,
      width: sideWidth,
      height: widgetHeight
    }
    top += widgetHeight + gap
  })
  return rectangles
}

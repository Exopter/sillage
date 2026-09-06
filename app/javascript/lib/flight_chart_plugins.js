/** @param {number} height @param {{top: number, bottom: number}} room */
export function tooltipVerticalAlign(height, room) {
  const halfHeight = height / 2
  if (room.top < halfHeight) return "top"
  if (room.bottom < halfHeight) return "bottom"

  return "center"
}

/** @type {import("chart.js").Plugin<"line", {bounds?: {exit?: number, opening?: number, landing?: number}, labels?: Record<string, string>}>} */
export const OS_BOUNDS_PLUGIN = {
  id: "osBounds",
  beforeDatasetsDraw(chart, _args, options) {
    if (!options?.bounds) return

    const area = chart.chartArea
    const xScale = chart.scales?.x
    if (!xScale || !area) return

    /** @type {[string, number, number, string][]} */
    const ranges = [
      ["Plane", xScale.min, Number(options.bounds.exit), "rgba(46, 168, 255, 0.045)"],
      ["Jump", Number(options.bounds.exit), Number(options.bounds.opening), "rgba(47, 214, 198, 0.055)"],
      ["Canopy", Number(options.bounds.opening), Number(options.bounds.landing), "rgba(79, 123, 78, 0.09)"]
    ]
    const phases = ranges.filter(([, start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    const ctx = chart.ctx

    ctx.save()
    ctx.textBaseline = "top"
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace"
    phases.forEach(([ label, start, end, color ]) => {
      const visibleStart = Math.max(start, xScale.min)
      const visibleEnd = Math.min(end, xScale.max)
      if (visibleEnd <= visibleStart) return

      const x = xScale.getPixelForValue(visibleStart)
      const width = xScale.getPixelForValue(visibleEnd) - x
      ctx.fillStyle = color
      ctx.fillRect(x, area.top, width, area.bottom - area.top)
      if (width > 54) {
        ctx.fillStyle = "rgba(36, 49, 51, 0.56)"
        ctx.fillText(label.toUpperCase(), x + 8, area.top + 8)
      }
    })
    ctx.restore()
  },
  afterDatasetsDraw(chart, _args, options) {
    if (!options?.bounds) return

    const area = chart.chartArea
    const xScale = chart.scales?.x
    if (!xScale || !area) return

    const ctx = chart.ctx
    const labels = options.labels || {}
    /** @type {[string, number | undefined][]} */
    const values = [
      ["exit", options.bounds.exit],
      ["opening", options.bounds.opening],
      ["landing", options.bounds.landing]
    ]
    const bounds = values.filter(([, value]) => Number.isFinite(Number(value)))

    ctx.save()
    ctx.textBaseline = "top"
    ctx.font = "11px sans-serif"
    bounds.forEach(([key, value]) => {
      const x = xScale.getPixelForValue(Number(value))
      if (x < area.left || x > area.right) return

      ctx.strokeStyle = "rgba(232, 93, 79, 0.48)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, area.top)
      ctx.lineTo(x, area.bottom)
      ctx.stroke()

      const placeAfterLine = key === "landing"
      ctx.fillStyle = "rgba(36, 49, 51, 0.56)"
      ctx.textAlign = placeAfterLine ? "left" : "right"
      ctx.fillText(labels[key] || key, x + (placeAfterLine ? 5 : -5), area.top + 4)
    })
    ctx.restore()
  }
}

/** @type {import("chart.js").Plugin<"line", {elapsed?: number, color?: string, pointColor?: string}>} */
export const OS_PLAYBACK_PLUGIN = {
  id: "osPlayback",
  afterDatasetsDraw(chart, _args, options) {
    const elapsed = Number(options?.elapsed)
    if (!Number.isFinite(elapsed)) return

    const area = chart.chartArea
    const xScale = chart.scales?.x
    if (!xScale || !area) return

    const ctx = chart.ctx
    ctx.save()
    ctx.strokeStyle = options.color || "rgba(216, 145, 34, 0.9)"
    ctx.lineWidth = 2
    const x = xScale.getPixelForValue(elapsed)
    if (x >= area.left && x <= area.right) {
      ctx.beginPath()
      ctx.moveTo(x, area.top)
      ctx.lineTo(x, area.bottom)
      ctx.stroke()
    }

    ctx.fillStyle = options.pointColor || options.color || "rgba(216, 145, 34, 0.9)"
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)"
    chart.getActiveElements().forEach(({ datasetIndex, index }) => {
      const point = chart.getDatasetMeta(datasetIndex)?.data?.[index]
      if (!point) return
      if (point.x < area.left || point.x > area.right || point.y < area.top || point.y > area.bottom) return

      ctx.beginPath()
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.stroke()
    })
    ctx.restore()
  }
}

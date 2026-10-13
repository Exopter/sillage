import { Controller } from "@hotwired/stimulus"

/** @typedef {{ pointsValue: number[][] }} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLCanvasElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static values = { points: Array }
  connect() {
    const ctx = this.element.getContext("2d"), points = this.pointsValue
    if (!ctx || !points.length) return
    const lat0 = points[0][0] * Math.PI / 180
    const coords = points.map(([lat, lon]) => [(((lon - points[0][1]) + 540) % 360 - 180) * Math.cos(lat0), -lat])
    const xs = coords.map((p) => p[0]), ys = coords.map((p) => p[1])
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const dx = Math.max(...xs) - minX, dy = Math.max(...ys) - minY
    const w = this.element.width, h = this.element.height, scale = Math.min((w - 20) / (dx || 1e-6), (h - 20) / (dy || 1e-6))
    ctx.strokeStyle = getComputedStyle(this.element).getPropertyValue("--ex-state-live-text").trim()
    ctx.lineWidth = 3
    ctx.lineJoin = "round"
    ctx.beginPath()
    coords.forEach(([x, y], index) => {
      const px = (w - dx * scale) / 2 + (x - minX) * scale, py = (h - dy * scale) / 2 + (y - minY) * scale
      if (index) ctx.lineTo(px, py); else ctx.moveTo(px, py)
    })
    ctx.stroke()
  }
}

import { Controller } from "@hotwired/stimulus"
import { withTimeout } from "viewer_resources"

/** @typedef {{elapsed_seconds: number, ground_dbm: number|null, air_dbm: number|null, ground_noise_dbm: number|null, air_noise_dbm: number|null}} RadioRow
 * @typedef {{rowsValue: RadioRow[], durationValue: number, chartTarget: HTMLCanvasElement, hasChartTarget: boolean, statusTarget: HTMLElement}} Bindings
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["chart", "status"]
  static values = { rows: Array, duration: Number }
  /** @type {import("chart.js").Chart<"line", {x: number, y: number|null}[]> | null} */
  chart = null
  generation = 0

  async connect() {
    const generation = ++this.generation
    if (!this.hasChartTarget) return
    try {
      const { Chart, registerables } = await withTimeout(import("https://cdn.jsdelivr.net/npm/chart.js@4.4.9/+esm"), "Radio chart")
      if (generation !== this.generation) return
      Chart.register(...registerables)
      const styles = getComputedStyle(this.element)
      const ground = styles.getPropertyValue("--ds-aqua").trim()
      const air = styles.getPropertyValue("--ds-violet").trim()
      /** @type {[string, keyof RadioRow, string, boolean][]} */
      const metrics = [["Ground RX", "ground_dbm", ground, false], ["Air RX", "air_dbm", air, false],
        ["Ground noise", "ground_noise_dbm", ground, true], ["Air noise", "air_noise_dbm", air, true]]
      this.chart = new Chart(this.chartTarget, {
        type: "line",
        data: {datasets: metrics.map(([label, key, color, noise]) => ({label, data: radioSeries(this.rowsValue, key),
          borderColor: color, backgroundColor: color, borderDash: noise ? [4, 4] : [], borderWidth: noise ? 1 : 2,
          pointRadius: 1, pointHitRadius: 8, spanGaps: false}))},
        options: {responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
          interaction: {mode: "nearest", intersect: false},
          scales: {x: {type: "linear", min: 0, max: this.durationValue, title: {display: true, text: "Time since Signal session start (minutes)"},
            ticks: {callback: value => (Number(value) / 60).toFixed(1)}},
          y: {title: {display: true, text: "Received signal / noise (approx. dBm)"}}},
          plugins: {tooltip: {callbacks: {title: items => `${(items[0]?.parsed.x / 60).toFixed(2)} min`,
            label: item => `${item.dataset.label}: ${item.parsed.y?.toFixed(1) ?? "Unavailable"} dBm`}}}}
      })
      this.statusTarget.textContent = "Hover to inspect a report. Select a legend item to show or hide it."
    } catch {
      if (generation === this.generation) this.statusTarget.textContent = "The chart could not load. The summary and CSV export remain available."
    }
  }

  disconnect() {
    ++this.generation
    this.chart?.destroy()
    this.chart = null
  }
}

/** Keep every measurement and explicitly break missing periods.
 * @param {RadioRow[]} rows @param {keyof RadioRow} key
 */
export function radioSeries(rows, key) {
  /** @type {{x: number, y: number|null}[]} */
  const points = []
  let previous = null
  for (const row of rows) {
    const time = row.elapsed_seconds
    if (previous != null && time - previous > 3) points.push({x: previous + 0.001, y: null})
    points.push({x: time, y: row[key]})
    previous = time
  }
  return points
}

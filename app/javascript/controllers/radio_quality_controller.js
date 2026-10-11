import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {ReturnType<import("../lib/signal_telemetry").SignalTelemetry["snapshot"]>["radio"]} RadioReport
 * @typedef {{report: RadioReport, state: string, now: number}} RadioQuality
 * @typedef {{linkTargets: HTMLElement[]}} StimulusBindings
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["link"]

  /** @param {CustomEvent<RadioQuality>} event */
  update({detail: {report, state, now}}) {
    for (const link of this.linkTargets) {
      const ground = link.dataset.endpoint === "ground"
      const dbm = ground ? report?.groundDbm : report?.airDbm
      const margin = ground ? report?.groundMarginDb : report?.airMarginDb
      const available = finite(dbm) && finite(margin)
      const level = !available ? 0 : margin >= 30 ? 4 : margin >= 20 ? 3 : margin >= 10 ? 2 : 1
      const quality = level ? ["", "Weak", "Fair", "Good", "Strong"][level] : report ? "Unavailable" : state
      link.dataset.level = String(level)
      const label = link.querySelector("[data-quality-label]")
      const value = link.querySelector("[data-quality-value]")
      if (!label || !value) continue
      label.textContent = quality
      value.textContent = `${finite(dbm) ? `≈ ${Math.round(dbm)} dBm` : "RSSI ---"} · S/N ${finite(margin) ? `${margin > 0 ? "+" : ""}${Math.round(margin)} dB` : "---"}`
      const direction = ground ? "Air to Ground" : "Ground to Air"
      const noise = ground ? report?.groundNoiseDbm : report?.airNoiseDbm
      link.title = report
        ? `${direction}. Updated ${Math.max(0, Math.ceil((now - report.at) / 1000))} s ago. Noise: ${finite(noise) ? Math.round(noise) : "---"} dBm. RX errors: ${report.rxErrors}; corrected packets: ${report.fixed} (since radio boot). Ground TX buffer free: ${report.txFreePercent ?? "---"}%. Bars indicate estimated S/N margin: weak <10 dB, fair 10–19 dB, good 20–29 dB, strong ≥30 dB.`
        : `${direction}. ${state}.`
    }
  }
}

/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value) }

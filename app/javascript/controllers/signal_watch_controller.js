import { Controller } from "@hotwired/stimulus"

/** @typedef {{urlValue: string, stopValue: string, closeValue: string, startedValue: string, statusTarget: HTMLElement, clockTarget: HTMLElement,
 * valueTargets: HTMLElement[], flightLinkTarget: HTMLElement, stopTarget: HTMLButtonElement, recoveryTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// Follows a flight another computer is recording: its state, the latest
// position it uploaded, and the means to end it.
export default class extends TypedController {
  static values = { url: String, stop: String, close: String, started: String }
  static targets = ["status", "clock", "value", "flightLink", "stop", "recovery"]
  timer = 0
  clockTimer = 0
  ended = false

  connect() {
    this.ended = false
    void this.refresh()
    this.timer = window.setInterval(() => { void this.refresh() }, 3000)
    this.clockTimer = window.setInterval(() => this.renderClock(), 500)
  }

  disconnect() { clearInterval(this.timer); clearInterval(this.clockTimer) }

  renderClock() {
    if (this.ended) return
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(this.startedValue)) / 1000))
    this.clockTarget.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  }

  async refresh() {
    try {
      const response = await fetch(this.urlValue, { headers: { Accept: "application/json" }, cache: "no-store" })
      if (!response.ok) throw new Error("unavailable")
      this.apply(await response.json())
    } catch { this.statusTarget.textContent = "Connection interrupted. Reconnecting…" }
  }

  /** @param {{status: string, gateway_connected: boolean, stop_requested: boolean, flight_url?: string, latest_samples?: Array<Record<string, any>>}} state */
  apply(state) {
    this.ended = state.status === "completed"
    if (state.flight_url && this.flightLinkTarget.dataset.url !== state.flight_url) {
      const link = document.createElement("a")
      link.href = state.flight_url
      link.textContent = "Open flight"
      link.className = "signal-tool-button exds-btn exds-btn--secondary"
      this.flightLinkTarget.replaceChildren(link)
      this.flightLinkTarget.dataset.url = state.flight_url
    }
    this.statusTarget.textContent = this.ended ? "Flight ended and saved."
      : state.stop_requested ? "Ending. Waiting for the recording computer to save."
      : state.gateway_connected ? "Recording on the ground computer." : "The recording computer is not answering."
    this.stopTarget.hidden = this.ended
    this.stopTarget.disabled = state.stop_requested
    this.recoveryTarget.hidden = this.ended || state.gateway_connected
    const gps = (state.latest_samples || []).filter(sample => sample.kind === "gps").at(-1)
    const number = (/** @type {unknown} */ value, digits = 0, scale = 1) => typeof value === "number" && Number.isFinite(value) ? (value * scale).toFixed(digits) : "---"
    const age = gps?.recorded_at ? Math.max(0, Math.round((Date.now() - Date.parse(gps.recorded_at)) / 1000)) : null
    /** @type {Record<string, string>} */
    const readings = {
      altitude: number(gps?.altitude_m), speed: number(gps?.horizontal_speed_mps, 0, 3.6), heading: number(gps?.heading_deg),
      fix: gps ? `${gps.gps_fix >= 3 ? "3D fix" : gps.gps_fix === 2 ? "2D fix" : "No fix"} · ${number(gps.satellite_count)} sats` : "---",
      position: gps ? `${number(gps.latitude, 5)}, ${number(gps.longitude, 5)}` : "---",
      age: age == null ? "Waiting for telemetry" : age < 10 ? "Receiving telemetry" : `Last position ${age} s ago`
    }
    for (const target of this.valueTargets) target.textContent = readings[target.dataset.reading || ""] || "---"
  }

  /** @param {string} url */
  async post(url) {
    return fetch(url, { method: "POST", headers: { "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "", Accept: "application/json" } })
  }

  async stop() {
    const response = await this.post(this.stopValue)
    if (!response.ok) { this.statusTarget.textContent = "The flight could not be ended. Try again."; return }
    await this.refresh()
  }

  async closeDisconnected() {
    if (!window.confirm("Close this flight without the recording computer? The data it still holds is kept when it reconnects.")) return
    const response = await this.post(this.closeValue)
    if (!response.ok) { this.statusTarget.textContent = "The recording computer is answering again. Use End flight."; return }
    await this.refresh()
  }
}

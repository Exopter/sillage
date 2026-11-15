import { Controller } from "@hotwired/stimulus"

/** @typedef {{urlValue: string, stopValue: string, statusTarget: HTMLElement, telemetryTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))
export default class extends TypedController {
  static values = { url: String, stop: String }
  static targets = ["status", "telemetry"]
  connect() { this.refresh(); this.timer = setInterval(() => this.refresh(), 3000) }
  disconnect() { clearInterval(this.timer) }
  async refresh() {
    try {
      const response = await fetch(this.urlValue, { headers: { Accept: "application/json" } })
      if (!response.ok) throw new Error("Session unavailable")
      const state = await response.json()
      const gps = state.latest_samples?.findLast(/** @param {any} sample */ sample => sample.kind === "gps")
      this.telemetryTarget.textContent = gps ? `Latitude: ${gps.latitude ?? gps.lat}
Longitude: ${gps.longitude ?? gps.lon}
Altitude: ${gps.altitude_m ?? "Unavailable"} m
Received: ${gps.recorded_at}` : "Waiting for telemetry"
      this.statusTarget.textContent = state.status === "completed" ? "Session ended. You can record your debrief." : `${state.status} · ${state.gateway_connected ? "Gateway connected" : "Gateway disconnected"}${state.stop_requested ? " · Stop requested, awaiting gateway confirmation" : ""}`
    } catch { this.statusTarget.textContent = "Connection interrupted. Reconnecting…" }
  }
  async stop() {
    const response = await fetch(this.stopValue, { method: "POST", headers: { "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "", Accept: "application/json" } })
    if (!response.ok) { this.statusTarget.textContent = "Could not request stop. Please retry."; return }
    await this.refresh()
  }
}

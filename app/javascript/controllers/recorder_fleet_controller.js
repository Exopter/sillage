import { Controller } from "@hotwired/stimulus"

/** @typedef {{device_id:string, firmware:string|null, transports:string[], last_seen_at:string|null}} Recorder */
const LABELS = { "usb-c": "USB-C", ble: "Bluetooth", wifi: "Wi-Fi", "ground-radio": "Radio" }
const Base = /** @type {new (context:import("@hotwired/stimulus").Context) => Controller & {rowTargets:HTMLElement[]}} */ (/** @type {unknown} */ (Controller))
export default class extends Base {
  static targets = ["row"]
  /** @type {number | undefined} */ timer = undefined
  /** @type {AbortController|null} */ request = null
  connect() {
    void this.refresh()
    this.timer = window.setInterval(() => void this.refresh(), 5000)
  }
  disconnect() { window.clearInterval(this.timer); this.request?.abort() }
  async refresh() {
    if (this.request) return
    this.request = new AbortController()
    try {
      const response = await fetch("/api/v1/recorder-connections", { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.any([this.request.signal, AbortSignal.timeout(8000)]) })
      if (!response.ok) throw new Error("Connection status unavailable")
      const payload = await response.json()
      if (!this.request.signal.aborted) this.render(payload.recorders)
    } catch {
      if (!this.request.signal.aborted) this.rowTargets.forEach(row => {
        const status = row.querySelector("[data-recorder-connection]")
        if (status) { status.textContent = "Status unavailable"; status.className = "workspace-status is-draft" }
      })
    } finally { this.request = null }
  }
  /** @param {Recorder[]} recorders */
  render(recorders) {
    for (const row of this.rowTargets) {
      const recorder = recorders.find(item => item.device_id === row.dataset.deviceId)
      if (!recorder) continue
      const firmware = row.querySelector("[data-recorder-firmware]")
      const status = row.querySelector("[data-recorder-connection]")
      const seen = row.querySelector("[data-recorder-seen]")
      if (firmware) firmware.textContent = recorder.firmware || "Not reported"
      if (status) {
        status.textContent = recorder.transports.map(transport => LABELS[/** @type {keyof typeof LABELS} */ (transport)]).filter(Boolean).join(" · ") || "Offline"
        status.className = `workspace-status ${recorder.transports.length ? "is-installed" : "is-draft"}`
      }
      if (seen) seen.textContent = recorder.last_seen_at ? `Last seen ${new Date(recorder.last_seen_at).toLocaleString()}` : "Never seen"
    }
  }
}

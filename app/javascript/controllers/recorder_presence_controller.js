import { Controller } from "@hotwired/stimulus"
import { recorderConnectionObservations } from "aircraft_connection"

// Each page owns a separate expiring lease. Closing one tab cannot disconnect another.
export default class extends Controller {
  observerId = crypto.randomUUID()
  pending = false
  reported = false
  active = false
  /** @type {number | undefined} */ timer = undefined
  connect() {
    this.active = true
    this.timer = window.setInterval(() => void this.report(), 5000)
    void this.report()
  }
  disconnect() {
    this.active = false
    window.clearInterval(this.timer)
    // Server expiry also covers crashes, sleep and lost network access.
    if (!this.pending && this.reported) void this.send([]).catch(() => {})
  }
  async report() {
    if (this.pending || !this.active) return
    const observations = recorderConnectionObservations()
    if (!observations.length && !this.reported) return
    this.pending = true
    try {
      const response = await this.send(observations)
      if (response.ok) this.reported = observations.length > 0
    } catch { /* Retry on the next interval; stale leases expire on the server. */ }
    finally {
      this.pending = false
      if (!this.active && this.reported) void this.send([]).catch(() => {})
    }
  }
  /** @param {ReturnType<typeof recorderConnectionObservations>} observations */
  send(observations) {
    return fetch("/api/v1/recorder-connections", {
      method: "PATCH", credentials: "same-origin", keepalive: true, signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "" },
      body: JSON.stringify({ observer_id: this.observerId, observations })
    })
  }
}

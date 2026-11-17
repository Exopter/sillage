import { Controller } from "@hotwired/stimulus"

const STATION_KEY = "signal-station-key"

/** @typedef {{urlValue: string, environmentValue: string, labelTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// A ground computer in standby. It checks in with Sillage so the phone knows
// what it hears, and starts the flight a phone asks for as soon as it hears an
// aircraft. There is no switch: hearing an aircraft is what makes it record.
export default class extends TypedController {
  static values = { url: String, environment: String }
  static targets = ["label"]
  timer = 0
  starting = false
  /** @type {{ready: boolean, deviceId: string, label: string}} */
  heard = { ready: false, deviceId: "", label: "" }
  key = ""
  glide = 0

  connect() {
    this.key = read(STATION_KEY) || ""
    if (!/^[0-9a-f-]{36}$/.test(this.key)) { this.key = crypto.randomUUID(); write(STATION_KEY, this.key) }
    this.starting = false
    this.render()
    this.timer = window.setInterval(() => { void this.checkIn() }, 2000)
    void this.checkIn()
  }

  disconnect() { clearInterval(this.timer) }

  /** @param {CustomEvent<{ready: boolean, deviceId: string, label: string}>} event */
  standby(event) {
    const { ready, deviceId, label } = event.detail
    const changed = ready !== this.heard.ready || deviceId !== this.heard.deviceId
    this.heard = { ready, deviceId, label }
    this.render()
    if (changed) void this.checkIn()
  }

  /** The phone remote stamps this glide ratio on the tunnel flights it starts.
   * @param {CustomEvent<{ratio: number}>} event
   */
  glideRatio(event) {
    this.glide = event.detail.ratio
    void this.checkIn()
  }

  /** Shown only while this computer would record a flight started from a phone.
   * @param {string} [message] */
  render(message = "") {
    this.element.hidden = !this.heard.ready && !message
    this.labelTarget.textContent = message || "Phone remote ready"
  }

  async checkIn() {
    if (this.starting) return
    try {
      const response = await fetch(this.urlValue, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "" },
        body: JSON.stringify({ key: this.key, ready: this.heard.ready, device_id: this.heard.deviceId, aircraft: this.heard.label,
          environment: this.environmentValue, tunnel_glide_ratio: this.environmentValue === "tunnel" && this.glide ? this.glide.toFixed(2) : null }) })
      if (!response.ok) return
      const pending = await response.json()
      if (!pending.flight_id || !this.heard.ready || this.starting) return
      this.starting = true
      this.render(`Starting ${pending.code} for ${pending.pilot}.`)
      window.dispatchEvent(new CustomEvent("sillage:signal-start", { detail: { flightId: pending.flight_id, code: pending.code } }))
      // If the start does not go through, ask again.
      window.setTimeout(() => { this.starting = false }, 12000)
    } catch { this.render("Connection to Sillage interrupted. Retrying.") }
  }
}

/** @param {string} key */
function read(key) { try { return localStorage.getItem(key) } catch (_) { return null } }
/** @param {string} key @param {string} value */
function write(key, value) { try { localStorage.setItem(key, value) } catch (_) { /* The station identity simply is not remembered. */ } }

import { Controller } from "@hotwired/stimulus"

const REMOTE_KEY = "signal-remote"
const STATION_KEY = "signal-station-key"

/** @typedef {{urlValue: string, toggleTarget: HTMLButtonElement, labelTarget: HTMLElement, pairTarget: HTMLButtonElement, dialogTarget: HTMLDialogElement, statusTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// The phone remote switch of a ground computer in standby. The computer checks
// in with Sillage so the phone knows what it hears; with the switch on, it
// starts the flight a phone asks for.
export default class extends TypedController {
  static values = { url: String }
  static targets = ["toggle", "label", "pair", "dialog", "status"]
  timer = 0
  enabled = false
  starting = false
  /** @type {{ready: boolean, deviceId: string, label: string}} */
  heard = { ready: false, deviceId: "", label: "" }
  key = ""

  connect() {
    this.enabled = read(REMOTE_KEY) === "1"
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

  toggle() {
    this.enabled = !this.enabled
    write(REMOTE_KEY, this.enabled ? "1" : "0")
    this.render()
    void this.checkIn()
    if (this.enabled) this.showPairing()
  }

  showPairing() { if (!this.dialogTarget.open) this.dialogTarget.showModal() }
  closePairing() { this.dialogTarget.close() }

  render(message = "") {
    this.toggleTarget.setAttribute("aria-pressed", String(this.enabled))
    this.element.dataset.state = !this.enabled ? "off" : this.heard.ready ? "armed" : "blocked"
    this.labelTarget.textContent = !this.enabled ? "Phone remote off" : this.heard.ready ? "Phone remote on" : "Phone remote waiting"
    this.pairTarget.hidden = !this.enabled
    this.statusTarget.textContent = message || (!this.enabled ? "The remote is off. Flights start from this computer only."
      : this.heard.ready ? "On. This computer records as soon as Start flight is tapped on the phone."
      : "On, but no aircraft is heard yet: a flight started from the phone would only be timed.")
  }

  async checkIn() {
    if (this.starting) return
    try {
      const response = await fetch(this.urlValue, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "" },
        body: JSON.stringify({ key: this.key, remote: this.enabled, ready: this.heard.ready, device_id: this.heard.deviceId, aircraft: this.heard.label }) })
      if (!response.ok) return
      const pending = await response.json()
      if (!pending.flight_id || !this.enabled || !this.heard.ready || this.starting) return
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
function write(key, value) { try { localStorage.setItem(key, value) } catch (_) { /* The switch simply is not remembered. */ } }

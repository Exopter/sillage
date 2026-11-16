import { Controller } from "@hotwired/stimulus"

const LINK_TYPE_KEY = "signal-link-type"
const RECORDER_KEY = "signal-link-recorder"

/**
 * @typedef {Object} Bindings
 * @property {HTMLElement} element
 * @property {HTMLButtonElement} buttonTarget
 * @property {HTMLSelectElement} transportTarget
 * @property {HTMLSelectElement} recorderTarget
 * @property {HTMLElement} labelTarget
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller & Bindings} */ (/** @type {unknown} */ (Controller))

// The link control of the top bar. The choice of link is made once and
// remembered on this computer, in standby as in a recording.
export default class extends TypedController {
  static targets = ["label", "button", "transport", "recorder"]

  connect() {
    const stored = read(LINK_TYPE_KEY)
    if (stored && Array.from(this.transportTarget.options).some(option => option.value === stored)) this.transportTarget.value = stored
    const recorder = read(RECORDER_KEY)
    if (recorder && Array.from(this.recorderTarget.options).some(option => option.value === recorder)) this.recorderTarget.value = recorder
    this.render()
  }

  select() {
    write(LINK_TYPE_KEY, this.transportTarget.value)
    write(RECORDER_KEY, this.recorderTarget.value)
    this.render()
  }

  render() {
    this.transportTarget.title = `Link type: ${this.transportTarget.selectedOptions?.[0]?.textContent || this.transportTarget.value}`
    this.recorderTarget.hidden = this.transportTarget.value !== "wifi"
    if (this.recorderTarget.parentElement) this.recorderTarget.parentElement.hidden = this.recorderTarget.hidden
  }

  toggle() {
    if (!this.buttonTarget.disabled) window.dispatchEvent(new CustomEvent("sillage:ground-radio-toggle", {
      detail: {transport: this.transportTarget.value, deviceId: this.recorderTarget.value}
    }))
  }

  /** @param {CustomEvent<{connected:boolean, busy:boolean, available:boolean, label:string, description:string}>} event */
  update(event) {
    const {connected, busy, available, label, description} = event.detail
    this.buttonTarget.disabled = busy || !available
    this.transportTarget.disabled = busy || connected
    this.recorderTarget.disabled = busy || connected
    this.render()
    this.buttonTarget.dataset.aircraftConnectionState = connected ? "connected" : "disconnected"
    this.buttonTarget.setAttribute("aria-busy", String(busy))
    this.labelTarget.textContent = label
    this.buttonTarget.title = description
    this.buttonTarget.setAttribute("aria-label", description)
  }
}

/** @param {string} key */
function read(key) { try { return localStorage.getItem(key) } catch (_) { return null } }
/** @param {string} key @param {string} value */
function write(key, value) { try { localStorage.setItem(key, value) } catch (_) { /* The choice simply is not remembered. */ } }

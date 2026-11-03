import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} Bindings
 * @property {HTMLElement} element
 * @property {HTMLButtonElement} buttonTarget
 * @property {HTMLSelectElement} transportTarget
 * @property {HTMLSelectElement} recorderTarget
 * @property {HTMLElement} labelTarget
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["label", "button", "transport", "recorder"]

  select() {
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
    this.select()
    this.buttonTarget.dataset.aircraftConnectionState = connected ? "connected" : "disconnected"
    this.buttonTarget.setAttribute("aria-busy", String(busy))
    this.labelTarget.textContent = label
    this.buttonTarget.title = description
    this.buttonTarget.setAttribute("aria-label", description)
  }
}

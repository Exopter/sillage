import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} Bindings
 * @property {HTMLButtonElement} element
 * @property {HTMLElement} labelTarget
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["label"]

  toggle() {
    if (!this.element.disabled) window.dispatchEvent(new Event("sillage:ground-radio-toggle"))
  }

  /** @param {CustomEvent<{connected:boolean, busy:boolean, available:boolean, label:string, description:string}>} event */
  update(event) {
    const {connected, busy, available, label, description} = event.detail
    this.element.disabled = busy || !available
    this.element.dataset.aircraftConnectionState = connected ? "connected" : "disconnected"
    this.element.setAttribute("aria-busy", String(busy))
    this.labelTarget.textContent = label
    this.element.title = description
    this.element.setAttribute("aria-label", description)
  }
}

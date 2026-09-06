import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} StimulusBindings
 * @property {number} timeoutValue
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  /** @type {number|undefined} */
  dismissTimer = undefined
  static values = {
    timeout: { type: Number, default: 0 }
  }

  connect() {
    if (this.timeoutValue > 0) {
      this.dismissTimer = window.setTimeout(() => this.dismiss(), this.timeoutValue)
    }
  }

  disconnect() {
    window.clearTimeout(this.dismissTimer)
  }

  dismiss() {
    this.element.remove()
  }
}

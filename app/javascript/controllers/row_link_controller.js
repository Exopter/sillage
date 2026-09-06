import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} StimulusBindings
 * @property {string} urlValue
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static values = { url: String }

  /** @param {MouseEvent} event */
  open(event) {
    if (this.shouldIgnore(event)) return

    this.visit()
  }

  /** @param {KeyboardEvent} event */
  openWithKeyboard(event) {
    if (!["Enter", " "].includes(event.key)) return
    if (this.shouldIgnore(event)) return

    event.preventDefault()
    this.visit()
  }

  /** @param {Event} event */
  shouldIgnore(event) {
    return event.target instanceof Element && event.target.closest("a, button, input, select, textarea, label")
  }

  visit() {
    if (window.Turbo) {
      window.Turbo.visit(this.urlValue)
    } else {
      window.location.assign(this.urlValue)
    }
  }
}

import { Controller } from "@hotwired/stimulus"

/** @typedef {{formTarget: HTMLFormElement}} Bindings */

// A value that turns into its field when clicked: focuses the field on opening,
// closes without saving on Escape or Cancel, and saves a choice as soon as it is made.
/** @extends {Controller<HTMLDetailsElement>} */
export default class extends Controller {
  static targets = ["form"]

  opened() {
    if (!this.element.open) return
    const field = /** @type {HTMLElement | null} */ (this.bindings.formTarget.querySelector("select, input:not([type=hidden])"))
    field?.focus()
    if (field instanceof HTMLInputElement && field.type === "text") field.select()
  }

  close() {
    this.bindings.formTarget.reset()
    this.element.open = false
    this.element.querySelector("summary")?.focus()
  }

  submit() {
    this.bindings.formTarget.requestSubmit()
  }

  /** @returns {Bindings} */
  get bindings() {
    return /** @type {Bindings} */ (/** @type {unknown} */ (this))
  }
}

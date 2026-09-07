import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} StimulusBindings
 * @property {HTMLInputElement[]} itemTargets
 * @property {HTMLInputElement} allTarget
 * @property {HTMLElement} countTarget
 * @property {HTMLButtonElement} deleteTarget
 * @property {HTMLButtonElement} clearTarget
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLFormElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["item", "all", "count", "delete", "clear"]

  connect() {
    this.reset()
  }

  reset() {
    this.itemTargets.forEach((item) => { item.checked = false })
    this.update()
  }

  toggleAll() {
    this.itemTargets.forEach((item) => { item.checked = this.allTarget.checked })
    this.update()
  }

  update() {
    const count = this.itemTargets.filter((item) => item.checked).length
    this.countTarget.textContent = `${count} selected`
    this.deleteTarget.disabled = count === 0
    this.clearTarget.disabled = count === 0
    this.allTarget.checked = count > 0 && count === this.itemTargets.length
    this.allTarget.indeterminate = count > 0 && count < this.itemTargets.length
    this.allTarget.disabled = this.itemTargets.length === 0
    this.itemTargets.forEach((item) => {
      item.closest("tr")?.toggleAttribute("data-selected", item.checked)
    })
    this.element.dataset.turboConfirm = `Permanently delete ${count} selected ${count === 1 ? "entry" : "entries"} and all associated flight data, captures and videos? Files used by other flights will be retained.`
  }

  /** @param {SubmitEvent} event */
  submit(event) {
    if (!this.itemTargets.some((item) => item.checked)) event.preventDefault()
  }
}

import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} StimulusBindings
 * @property {HTMLInputElement[]} itemTargets
 * @property {HTMLInputElement} allTarget
 * @property {HTMLElement} countTarget
 * @property {HTMLButtonElement} deleteTarget
 * @property {HTMLButtonElement} clearTarget
 * @property {HTMLButtonElement} moveTarget
 * @property {HTMLSelectElement} destinationTarget
 * @property {HTMLElement[]} toolbarTargets
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLFormElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["item", "all", "count", "delete", "clear", "move", "destination", "toolbar"]

  connect() {
    this.reset()
  }

  reset() {
    this.itemTargets.forEach((item) => { item.checked = false })
    this.destinationTarget.value = ""
    this.update()
  }

  toggleAll() {
    this.itemTargets.forEach((item) => { item.checked = this.allTarget.checked })
    this.update()
  }

  update() {
    const selected = this.itemTargets.filter((item) => item.checked)
    const count = selected.length
    this.toolbarTargets?.forEach((toolbar) => { toolbar.hidden = count === 0 })
    this.countTarget.textContent = `${count} selected`
    this.deleteTarget.disabled = count === 0
    this.clearTarget.disabled = count === 0
    this.moveTarget.disabled = count === 0 || !this.destinationTarget.value || selected.some((item) => !item.value.startsWith("flight:"))
    this.moveTarget.title = selected.some((item) => !item.value.startsWith("flight:")) ? "Select only flights to move them into a folder." : ""
    this.allTarget.checked = count > 0 && count === this.itemTargets.length
    this.allTarget.indeterminate = count > 0 && count < this.itemTargets.length
    this.allTarget.disabled = this.itemTargets.length === 0
    this.itemTargets.forEach((item) => {
      item.closest("tr, [data-entry]")?.toggleAttribute("data-selected", item.checked)
    })
    this.deleteTarget.dataset.turboConfirm = `Permanently delete ${count} selected ${count === 1 ? "entry" : "entries"} and all associated flight data, captures and videos? Files used by other flights will be retained.`
  }

  /** @param {SubmitEvent} event */
  submit(event) {
    if (!this.itemTargets.some((item) => item.checked)) event.preventDefault()
    if (event.submitter === this.moveTarget && this.moveTarget.disabled) event.preventDefault()
  }
}

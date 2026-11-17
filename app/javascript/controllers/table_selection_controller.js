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
 * @property {boolean} hasScopeTarget
 * @property {HTMLInputElement} scopeTarget
 * @property {boolean} hasEditTarget
 * @property {HTMLButtonElement} editTarget
 * @property {HTMLElement} extendTarget
 * @property {HTMLElement} extendTextTarget
 * @property {HTMLButtonElement} extendButtonTarget
 * @property {number} totalValue
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLFormElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["item", "all", "count", "delete", "clear", "move", "destination", "toolbar", "scope", "edit", "extend", "extendText", "extendButton"]
  static values = { total: Number }

  // Entry last clicked, where a shift-click range starts.
  anchor = -1

  connect() {
    // A selection being edited is rendered ticked by the server and stays as it is.
    if (this.itemTargets.some((item) => item.defaultChecked)) this.update()
    else this.reset()
  }

  reset() {
    this.itemTargets.forEach((item) => { item.checked = false })
    if (this.hasScopeTarget) this.scopeTarget.value = "page"
    this.destinationTarget.value = ""
    this.update()
  }

  toggleAll() {
    this.itemTargets.forEach((item) => { item.checked = this.allTarget.checked })
    this.update()
  }

  // Shift-click ticks or unticks every entry between the previous click and this one.
  /** @param {MouseEvent} event */
  range(event) {
    const index = this.itemTargets.indexOf(/** @type {HTMLInputElement} */ (event.target))
    if (index < 0) return
    if (event.shiftKey && this.anchor >= 0 && this.anchor < this.itemTargets.length) {
      const [from, to] = [Math.min(this.anchor, index), Math.max(this.anchor, index)]
      const checked = this.itemTargets[index].checked
      this.itemTargets.slice(from, to + 1).forEach((item) => { item.checked = checked })
      this.update()
    }
    this.anchor = index
  }

  // Extends the selection from the page to every flight of the list, across its pages.
  selectAll() {
    this.scopeTarget.value = "all"
    this.update()
  }

  update() {
    const selected = this.itemTargets.filter((item) => item.checked)
    const count = selected.length
    const recordings = selected.some((item) => !item.value.startsWith("flight:"))
    const pageFull = count > 0 && count === this.itemTargets.length
    if (this.hasScopeTarget && !pageFull) this.scopeTarget.value = "page"
    const everything = Boolean(this.hasScopeTarget) && this.scopeTarget.value === "all"
    this.toolbarTargets?.forEach((toolbar) => { toolbar.hidden = count === 0 })
    this.countTarget.textContent = everything ? `All ${this.totalValue} flights selected` : `${count} selected`
    // Moving and deleting stay limited to the page; the whole list is changed through Edit.
    this.deleteTarget.disabled = count === 0 || everything
    this.clearTarget.disabled = count === 0
    this.moveTarget.disabled = count === 0 || everything || !this.destinationTarget.value || recordings
    this.moveTarget.title = recordings ? "Select only flights to move them into a folder." : ""
    this.deleteTarget.title = everything ? "Deleting applies to one page at a time." : ""
    if (this.hasEditTarget) {
      this.editTarget.disabled = count === 0 || recordings
      this.editTarget.title = recordings ? "Select only flights to edit them together." : ""
    }
    if (this.hasScopeTarget) {
      const flights = selected.filter((item) => item.value.startsWith("flight:")).length
      this.extendTarget.hidden = !pageFull || recordings || this.totalValue <= flights
      this.extendTextTarget.textContent = everything ? `All ${this.totalValue} flights in this list are selected.` : `The ${count} flights on this page are selected.`
      this.extendButtonTarget.hidden = everything
      this.extendButtonTarget.textContent = `Select all ${this.totalValue} flights in this list`
    }
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

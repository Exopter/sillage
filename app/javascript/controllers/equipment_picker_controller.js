import { Controller } from "@hotwired/stimulus"

/** @typedef {{dialogTarget: HTMLDialogElement, searchTarget: HTMLInputElement, optionTargets: HTMLButtonElement[], fieldsTarget: HTMLElement, submitTarget: HTMLButtonElement, emptyTarget: HTMLElement, countTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// One way to choose equipment everywhere in Hangar: type a few letters of a
// name, serial or asset ID, pick a row, confirm.
export default class extends TypedController {
  static targets = ["dialog", "search", "option", "fields", "submit", "empty", "count"]

  open() {
    this.searchTarget.value = ""
    this.pick(null)
    this.filter()
    this.dialogTarget.showModal()
    this.searchTarget.focus()
  }

  close() { this.dialogTarget.close() }

  /** @param {MouseEvent} event */
  backdrop(event) { if (event.target === this.dialogTarget) this.close() }

  filter() {
    const words = this.searchTarget.value.toLowerCase().split(/\s+/).filter(Boolean)
    let shown = 0
    for (const option of this.optionTargets) {
      const text = option.dataset.search || ""
      option.hidden = !words.every(word => text.includes(word))
      if (!option.hidden) shown += 1
    }
    this.emptyTarget.hidden = shown > 0
    this.countTarget.textContent = `${shown} ${shown === 1 ? "match" : "matches"}`
    const chosen = this.optionTargets.find(option => option.getAttribute("aria-selected") === "true")
    if (chosen?.hidden) this.pick(null)
  }

  /** @param {Event} event */
  choose(event) { this.pick(/** @type {HTMLButtonElement} */ (event.currentTarget)) }

  // Enter in the search field picks the only match, then confirms it.
  /** @param {KeyboardEvent} event */
  enter(event) {
    if (event.key !== "Enter" || !this.submitTarget.disabled) return
    event.preventDefault()
    const open = this.optionTargets.filter(option => !option.hidden && !option.disabled)
    if (open.length === 1) this.pick(open[0])
  }

  /** @param {HTMLButtonElement | null} chosen */
  pick(chosen) {
    for (const option of this.optionTargets) option.setAttribute("aria-selected", String(option === chosen))
    this.fieldsTarget.replaceChildren()
    /** @type {Record<string, string>} */
    const fields = chosen ? JSON.parse(chosen.dataset.fields || "{}") : {}
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement("input")
      input.type = "hidden"
      input.name = name
      input.value = String(value)
      this.fieldsTarget.append(input)
    }
    this.submitTarget.disabled = !chosen
  }
}

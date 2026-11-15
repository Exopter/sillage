import { Controller } from "@hotwired/stimulus"

/** @typedef {{inputTarget: HTMLInputElement, resultsTarget: HTMLElement, optionTargets: HTMLButtonElement[], statusTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["input", "results", "option", "status"]
  /** @type {HTMLButtonElement[]} */
  matches = []
  activeIndex = -1

  connect() { this.close() }

  search() {
    const query = normalize(this.inputTarget.value.trim())
    this.matches = this.optionTargets.filter((option) => {
      option.hidden = !normalize(option.textContent || "").includes(query)
      option.setAttribute("aria-selected", "false")
      return !option.hidden
    })
    this.activeIndex = -1
    this.inputTarget.removeAttribute("aria-activedescendant")
    this.resultsTarget.hidden = this.matches.length === 0
    this.inputTarget.setAttribute("aria-expanded", String(this.matches.length > 0))
    this.statusTarget.textContent = this.matches.length ? `${this.matches.length} existing locations. Use arrow keys to choose.` : "New location. Your entered name will be saved."
  }

  /** @param {KeyboardEvent} event */
  navigate(event) {
    if (event.isComposing) return
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      this.close()
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (this.resultsTarget.hidden) this.search()
      if (!this.matches.length) return
      const direction = event.key === "ArrowDown" ? 1 : -1
      this.activeIndex = this.activeIndex < 0 ? (direction > 0 ? 0 : this.matches.length - 1) : (this.activeIndex + direction + this.matches.length) % this.matches.length
      this.matches.forEach((option, index) => option.setAttribute("aria-selected", String(index === this.activeIndex)))
      const option = this.matches[this.activeIndex]
      this.inputTarget.setAttribute("aria-activedescendant", option.id)
      option.scrollIntoView({ block: "nearest" })
    } else if (event.key === "Enter" && !this.resultsTarget.hidden && this.activeIndex >= 0) {
      event.preventDefault()
      this.choose(this.matches[this.activeIndex])
    } else if (event.key === "Tab") this.close()
  }

  /** @param {MouseEvent} event */
  keepFocus(event) { event.preventDefault() }

  /** @param {MouseEvent} event */
  select(event) {
    if (event.currentTarget instanceof HTMLButtonElement) this.choose(event.currentTarget)
  }

  /** @param {HTMLButtonElement} option */
  choose(option) {
    this.inputTarget.value = option.textContent || ""
    this.inputTarget.dispatchEvent(new Event("input", { bubbles: true }))
    this.inputTarget.dispatchEvent(new Event("change", { bubbles: true }))
    this.close()
    this.statusTarget.textContent = `${this.inputTarget.value} selected.`
  }

  /** @param {FocusEvent} event */
  leave(event) {
    if (!(event.relatedTarget instanceof Node) || !this.element.contains(event.relatedTarget)) this.close()
  }

  close() {
    this.resultsTarget.hidden = true
    this.activeIndex = -1
    this.optionTargets.forEach((option) => option.setAttribute("aria-selected", "false"))
    this.inputTarget.setAttribute("aria-expanded", "false")
    this.inputTarget.removeAttribute("aria-activedescendant")
  }
}

/** @param {string} value */
function normalize(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

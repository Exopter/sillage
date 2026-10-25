import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  /** @type {HTMLElement | null} */
  card = null
  pending = false

  /** @param {HTMLElement | null} card */
  pick(card) {
    if (this.pending) return
    this.end()
    this.card = card
    card?.setAttribute("data-picked", "")
    card?.querySelector("button")?.setAttribute("aria-pressed", "true")
    this.announce(card ? "Card selected. Choose a column, use Left or Right to move, or Escape to cancel." : "")
  }

  /** @param {DragEvent} event */
  start(event) {
    if (this.pending) { event.preventDefault(); return }
    this.pick(event.target instanceof Element ? event.target.closest("article") : null)
    if (!this.card || !event.dataTransfer) return
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", this.card.id)
  }

  /** @param {MouseEvent} event */
  select(event) {
    event.stopPropagation()
    const card = event.target instanceof Element ? event.target.closest("article") : null
    this.pick(card === this.card ? null : card)
  }

  /** @param {MouseEvent} event */
  place(event) {
    if (!(event.target instanceof Element) || event.target.closest("article, a")) return
    if (event.currentTarget instanceof HTMLElement) this.move(event.currentTarget.dataset.status)
  }

  /** @param {KeyboardEvent} event */
  key(event) {
    if (event.key === "Escape") { this.end(); return }
    if (!["ArrowLeft", "ArrowRight"].includes(event.key) || this.pending) return
    event.preventDefault()
    const card = event.target instanceof Element ? event.target.closest("article") : null
    if (!card) return
    const columns = this.columns()
    const index = columns.findIndex(column => column === card.closest("[data-status]"))
    const target = columns[index + (event.key === "ArrowRight" ? 1 : -1)]
    if (target) { this.pick(card); this.move(target.dataset.status) }
  }

  /** @param {DragEvent} event */
  allowDrop(event) {
    if (!this.card || !(event.currentTarget instanceof HTMLElement)) return
    event.preventDefault()
    event.currentTarget.setAttribute("data-drop-active", "")
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
  }

  /** @param {DragEvent} event */
  leave(event) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    event.currentTarget.removeAttribute("data-drop-active")
  }

  /** @param {DragEvent} event */
  drop(event) {
    if (!this.card || !(event.currentTarget instanceof HTMLElement)) return
    event.preventDefault()
    this.move(event.currentTarget.dataset.status)
  }

  /** @param {string | undefined} status */
  move(status) {
    if (this.pending) return
    const form = this.card?.querySelector("form")
    const input = form?.querySelector('input[name="feedback[status]"]')
    this.end()
    if (!form || !(input instanceof HTMLInputElement) || !status || input.value === status) return
    if (!this.columns().some(column => column.dataset.status === status)) return
    input.value = status
    this.pending = true
    this.announce("Saving status…")
    form.requestSubmit()
  }

  /** @param {CustomEvent<{success: boolean}>} event */
  submitted(event) {
    this.pending = false
    if (event.detail.success) return
    const form = event.target
    if (form instanceof HTMLFormElement) {
      const input = form.querySelector('input[name="feedback[status]"]')
      if (input instanceof HTMLInputElement) input.value = form.closest("[data-status]")?.getAttribute("data-status") || input.value
    }
    this.announce("Could not update status. Please try again.")
  }

  columns() {
    return /** @type {HTMLElement[]} */ (Array.from(this.element.querySelectorAll("section[data-status]")))
  }

  /** @param {string} message */
  announce(message) {
    const region = this.element.querySelector("[data-board-announcement]")
    if (region) region.textContent = message
  }

  end() {
    this.card?.removeAttribute("data-picked")
    this.card?.querySelector("button")?.setAttribute("aria-pressed", "false")
    this.card = null
    this.element.querySelectorAll("[data-drop-active]").forEach(column => column.removeAttribute("data-drop-active"))
    if (!this.pending) this.announce("")
  }
}

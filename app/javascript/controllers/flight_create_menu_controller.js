import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  close() {
    if (!(this.element instanceof HTMLDetailsElement)) return
    const focused = this.element.contains(document.activeElement)
    this.element.open = false
    if (focused) this.element.querySelector("summary")?.focus()
  }

  /** @param {MouseEvent} event */
  dismiss(event) {
    if (event.target instanceof Node && !this.element.contains(event.target)) this.close()
  }
}

import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { url: String }

  open(event) {
    if (this.shouldIgnore(event)) return

    this.visit()
  }

  openWithKeyboard(event) {
    if (!["Enter", " "].includes(event.key)) return
    if (this.shouldIgnore(event)) return

    event.preventDefault()
    this.visit()
  }

  shouldIgnore(event) {
    return event.target.closest("a, button, input, select, textarea, label")
  }

  visit() {
    if (window.Turbo) {
      window.Turbo.visit(this.urlValue)
    } else {
      window.location.assign(this.urlValue)
    }
  }
}

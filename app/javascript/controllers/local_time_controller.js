import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    const input = this.element
    if (!(input instanceof HTMLInputElement) || input.dataset.localTimeInitialized) return

    input.dataset.localTimeInitialized = "true"
    if (input.value) return

    const now = new Date()
    input.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  }
}

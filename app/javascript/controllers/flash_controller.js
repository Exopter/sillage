import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    timeout: { type: Number, default: 0 }
  }

  connect() {
    if (this.timeoutValue > 0) {
      this.dismissTimer = window.setTimeout(() => this.dismiss(), this.timeoutValue)
    }
  }

  disconnect() {
    window.clearTimeout(this.dismissTimer)
  }

  dismiss() {
    this.element.remove()
  }
}

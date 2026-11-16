import { Controller } from "@hotwired/stimulus"

/** @typedef {{urlValue: string, statusTarget: HTMLElement, formTarget: HTMLFormElement, flightTarget: HTMLInputElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// Ground station side of the tunnel remote: waits for a start request from a
// phone and opens the acquisition for that flight without anyone at the computer.
export default class extends TypedController {
  static values = { url: String }
  static targets = ["status", "form", "flight"]
  timer = 0
  starting = false

  connect() {
    this.timer = window.setInterval(() => { void this.check() }, 2000)
    void this.check()
  }

  disconnect() { clearInterval(this.timer) }

  ready() {
    const button = document.querySelector("[data-signal-acquisition]")
    return button instanceof HTMLButtonElement && !button.disabled
  }

  async check() {
    if (this.starting) return
    if (!this.ready()) {
      this.statusTarget.textContent = "Not armed: connect the radio and wait for the recorder to be recognised."
      this.element.dataset.state = "blocked"
      return
    }
    this.element.dataset.state = "armed"
    try {
      const response = await fetch(this.urlValue, { headers: { Accept: "application/json" } })
      if (!response.ok) return
      const pending = await response.json()
      if (!pending.flight_id) { this.statusTarget.textContent = "Armed. Waiting for Start flight on the remote."; return }
      this.starting = true
      this.statusTarget.textContent = `Starting ${pending.code} for ${pending.pilot}.`
      this.flightTarget.value = String(pending.flight_id)
      this.formTarget.requestSubmit()
    } catch { this.statusTarget.textContent = "Connection interrupted. Retrying." }
  }
}

import { Controller } from "@hotwired/stimulus"

/** @typedef {{urlValue: string, commentsUrlValue: string}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// Watches a published debrief whose summary is still being written and
// refreshes the Pilot log once it lands. The entry itself is never blocked.
export default class extends TypedController {
  static values = { url: String, commentsUrl: String }
  timer = 0

  connect() { this.timer = window.setInterval(() => { void this.check() }, 4000) }

  disconnect() { clearInterval(this.timer) }

  async check() {
    try {
      const response = await fetch(this.urlValue, { headers: { Accept: "application/json" } })
      if (!response.ok) return
      const debrief = await response.json()
      if (["uploaded", "processing"].includes(debrief.status)) return
      clearInterval(this.timer)
      const frame = /** @type {any} */ (this.element.closest("turbo-frame"))
      if (frame) { frame.src = this.commentsUrlValue; frame.reload?.() } else window.location.reload()
    } catch { /* Offline: the next tick retries. */ }
  }

  async retry() {
    const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || ""
    await fetch(`${this.urlValue}/process_audio`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": token }, body: "{}" })
    clearInterval(this.timer)
    this.connect()
    this.element.dataset.state = "pending"
  }
}

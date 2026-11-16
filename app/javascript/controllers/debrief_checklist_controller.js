import { Controller } from "@hotwired/stimulus"
import { extractChecklist } from "debrief_checklist"

/** @typedef {{pilotValue: string, itemTargets: HTMLButtonElement[], countTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// Ticks checklist points as the live transcript mentions them. A tap ticks or
// clears a point by hand; hand choices always win over what was heard.
export default class extends TypedController {
  static values = { pilot: String }
  static targets = ["item", "count"]
  /** @type {Record<string, string>} */
  heard = {}
  /** @type {Record<string, string | null>} */
  manual = {}
  /** @type {MutationObserver | null} */
  observer = null

  connect() {
    if (this.pilotValue) this.heard.pilot = this.pilotValue
    const transcript = this.element.querySelector('[data-flight-debrief-target="transcript"]')
    if (transcript) {
      this.observer = new MutationObserver(() => this.listen(transcript.textContent || ""))
      this.observer.observe(transcript, { childList: true, characterData: true, subtree: true })
    }
    this.render()
  }

  disconnect() { this.observer?.disconnect() }

  /** @param {string} text */
  listen(text) {
    const before = Object.keys(this.values()).length
    this.heard = { ...this.heard, ...extractChecklist(text) }
    this.render()
    if (Object.keys(this.values()).length > before) navigator.vibrate?.(30)
  }

  /** @param {Event} event */
  toggle(event) {
    const key = /** @type {HTMLElement} */ (event.currentTarget).dataset.key
    if (!key) return
    this.manual[key] = this.values()[key] ? null : "Noted"
    this.render()
  }

  /** @returns {Record<string, string>} */
  values() {
    /** @type {Record<string, string>} */
    const merged = { ...this.heard }
    for (const [key, value] of Object.entries(this.manual)) {
      if (value === null) delete merged[key]
      else if (!merged[key]) merged[key] = value
    }
    return merged
  }

  render() {
    const values = this.values()
    for (const item of this.itemTargets) {
      const value = values[item.dataset.key || ""]
      item.dataset.state = value ? "done" : "pending"
      item.setAttribute("aria-pressed", String(Boolean(value)))
      const slot = item.querySelector("[data-value]")
      if (slot) slot.textContent = value && value !== "Noted" ? value : ""
    }
    this.countTarget.textContent = `${Object.keys(values).length} of ${this.itemTargets.length}`
    // The recorder sends this with the audio.
    this.element.dataset.checklist = JSON.stringify(values)
  }
}

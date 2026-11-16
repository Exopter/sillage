import { Controller } from "@hotwired/stimulus"
import { extractChecklist } from "debrief_checklist"

/** @typedef {{pilotValue: string, itemTargets: HTMLButtonElement[], countTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// Ticks checklist points as the pilot covers them. Three sources, weakest first:
// word patterns (instant, work offline), the model reading the live transcript
// (understands paraphrases), and the operator's own taps, which always win.
export default class extends TypedController {
  static values = { pilot: String }
  static targets = ["item", "count"]
  /** @type {Record<string, string>} */
  heard = {}
  /** @type {Record<string, string>} */
  understood = {}
  /** @type {Record<string, string | null>} */
  manual = {}
  /** @type {MutationObserver | null} */
  observer = null
  transcript = ""
  asked = ""
  timer = 0
  asking = false

  connect() {
    if (this.pilotValue) this.heard.pilot = this.pilotValue
    const transcript = this.element.querySelector('[data-flight-debrief-target="transcript"]')
    if (transcript) {
      this.observer = new MutationObserver(() => this.listen(transcript.textContent || ""))
      this.observer.observe(transcript, { childList: true, characterData: true, subtree: true })
    }
    this.render()
  }

  disconnect() {
    this.observer?.disconnect()
    clearTimeout(this.timer)
  }

  /** @param {string} text */
  listen(text) {
    this.transcript = text
    this.heard = { ...this.heard, ...extractChecklist(text) }
    this.render()
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => { void this.understand() }, 1200)
  }

  async understand() {
    const url = this.element.dataset.debriefUrl
    const text = this.transcript
    if (!url || this.asking || text === this.asked || text.trim().length < 8) return
    this.asking = true
    try {
      const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || ""
      const response = await fetch(`${url}/checklist`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify({ transcript: text }) })
      if (response.ok) {
        this.asked = text
        const answer = await response.json()
        this.understood = { ...this.understood, ...(answer.checklist || {}) }
        this.render()
      }
    } catch { /* Offline: the patterns keep working and the server reads the full transcript later. */ } finally {
      this.asking = false
      if (this.transcript !== text) this.timer = window.setTimeout(() => { void this.understand() }, 1200)
    }
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
    const merged = { ...this.heard, ...this.understood }
    for (const [key, value] of Object.entries(this.manual)) {
      if (value === null) delete merged[key]
      else if (!merged[key]) merged[key] = value
    }
    return merged
  }

  render() {
    const values = this.values()
    let fresh = false
    for (const item of this.itemTargets) {
      const value = values[item.dataset.key || ""]
      const state = value ? "done" : "pending"
      if (state === "done" && item.dataset.state === "pending") fresh = true
      item.dataset.state = state
      item.setAttribute("aria-pressed", String(Boolean(value)))
      const slot = item.querySelector("[data-value]")
      if (slot) slot.textContent = value && value !== "Noted" ? value : ""
    }
    const done = Object.keys(values).length
    this.countTarget.textContent = `${done} of ${this.itemTargets.length}`
    this.countTarget.dataset.complete = String(done >= this.itemTargets.length)
    if (fresh) navigator.vibrate?.(done >= this.itemTargets.length ? [30, 60, 30] : 30)
    // The recorder sends this with the audio.
    this.element.dataset.checklist = JSON.stringify(values)
  }
}

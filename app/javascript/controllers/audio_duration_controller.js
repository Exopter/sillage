import { Controller } from "@hotwired/stimulus"

const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLAudioElement>} */ (/** @type {unknown} */ (Controller))

// A recording made in the browser carries no duration in its header, so the
// player cannot place its progress bar or seek. Jumping far past the end makes
// the browser read the real length; the player then returns to the start.
export default class extends TypedController {
  resolving = false
  measure = () => {
    const audio = this.element
    if (this.resolving || Number.isFinite(audio.duration) || !audio.paused || audio.currentTime > 0) return
    this.resolving = true
    const settle = () => {
      if (!Number.isFinite(audio.duration)) return
      audio.removeEventListener("durationchange", settle)
      audio.currentTime = 0
      this.resolving = false
    }
    audio.addEventListener("durationchange", settle)
    audio.currentTime = 1e101
  }

  connect() {
    this.element.addEventListener("loadedmetadata", this.measure)
    if (this.element.readyState >= 1) this.measure()
  }

  disconnect() { this.element.removeEventListener("loadedmetadata", this.measure) }
}

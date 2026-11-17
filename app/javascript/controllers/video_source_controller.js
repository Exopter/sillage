import { Controller } from "@hotwired/stimulus"

/** @typedef {{videoTarget: HTMLVideoElement, sourceTargets: HTMLButtonElement[]}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// Switches one video player between sources, such as the cameras of a tunnel
// flight, keeping the playback position and the playing state.
export default class extends TypedController {
  static targets = ["video", "source"]

  /** @param {Event & { params: { src?: string } }} event */
  select(event) {
    const video = this.videoTarget
    const src = event.params.src
    if (!src || video.getAttribute("src") === src) return

    const position = video.currentTime
    const playing = !video.paused && !video.ended
    for (const button of this.sourceTargets) button.setAttribute("aria-pressed", String(button === event.currentTarget))
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(position, Number.isFinite(video.duration) ? video.duration : position)
      if (playing) void video.play().catch(() => {})
    }, { once: true })
    video.src = src
  }
}

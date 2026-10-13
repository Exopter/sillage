import { Controller } from "@hotwired/stimulus"
import { Turbo } from "@hotwired/turbo-rails"

/** @typedef {{triggerTarget: HTMLButtonElement, paletteTarget: HTMLElement, swatchTargets: HTMLButtonElement[], errorTarget: HTMLElement, urlValue: string, idValue: string, colorValue: string}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["trigger", "palette", "swatch", "error"]
  static values = { url: String, id: String, color: String }
  saving = false
  onScroll = () => this.close()

  connect() {
    document.addEventListener("scroll", this.onScroll, true)
  }

  disconnect() { document.removeEventListener("scroll", this.onScroll, true) }

  close() { this.paletteTarget.hidePopover() }

  /** @param {Event} event */
  position(event) {
    if (!(event instanceof ToggleEvent) || event.newState !== "open") return
    const rect = this.triggerTarget.getBoundingClientRect()
    // Keep the compact palette below its icon, including in scrolling columns.
    this.paletteTarget.style.left = `${Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - 252))}px`
    this.paletteTarget.style.top = `${rect.bottom + 6}px`
  }

  refresh() {
    if (!this.element.isConnected) return
    const swatch = this.swatchTargets.find((button) => button.dataset.color === this.colorValue)
    if (!swatch) return
    const token = swatch.style.getPropertyValue("--exds-folder-color")
    document.querySelectorAll(`[data-folder-color-id="${this.idValue}"]`).forEach((element) => {
      if (element instanceof HTMLElement) element.style.setProperty("--exds-folder-color", token)
    })
    this.swatchTargets.forEach((button) => button.setAttribute("aria-pressed", String(button === swatch)))
  }

  /** @param {MouseEvent} event */
  async choose(event) {
    const button = event.currentTarget
    if (!(button instanceof HTMLButtonElement) || this.saving) return
    const color = button.dataset.color
    if (!color) return
    this.close()
    this.triggerTarget.focus({ preventScroll: true })
    const previous = this.currentColor()
    if (color === previous) return
    this.applyColor(color)
    this.refresh()
    this.errorTarget.hidden = true
    this.saving = true
    this.swatchTargets.forEach((swatch) => { swatch.disabled = true })
    try {
      const response = await fetch(this.urlValue, {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "" },
        body: JSON.stringify({ flight_folder: { color } })
      })
      if (!response.ok || response.redirected || (await response.json()).color !== color) throw new Error("Color update failed")
      Turbo.cache.clear()
    } catch {
      this.applyColor(previous)
      this.refresh()
      if (this.element.isConnected) {
        this.errorTarget.textContent = "Could not save this color. Please try again."
        this.errorTarget.hidden = false
        this.paletteTarget.showPopover()
      }
    } finally {
      this.saving = false
      this.swatchTargets.forEach((swatch) => { swatch.disabled = false })
    }
  }

  currentColor() { return this.colorValue }

  /** @param {string} color */
  applyColor(color) { this.colorValue = color }

  /** @param {KeyboardEvent} event */
  navigate(event) {
    if (!(event.target instanceof HTMLButtonElement)) return
    const index = this.swatchTargets.indexOf(event.target)
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const count = this.swatchTargets.length
    const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count
    this.swatchTargets[next].focus()
  }
}

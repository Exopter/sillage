import { Controller } from "@hotwired/stimulus"

/** @typedef {{triggerTarget:HTMLElement, tipTarget:HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["trigger", "tip"]
  /** @type {number|undefined} */ closeTimer = undefined

  show() {
    window.clearTimeout(this.closeTimer)
    for (const tip of document.querySelectorAll(".workspace-help-tooltip:popover-open")) {
      if (tip instanceof HTMLElement && tip !== this.tipTarget) tip.hidePopover()
    }
    this.tipTarget.showPopover()
    this.position()
  }

  position() {
    if (!this.tipTarget.matches(":popover-open")) return
    const anchor = this.triggerTarget.getBoundingClientRect()
    const tip = this.tipTarget.getBoundingClientRect()
    this.tipTarget.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - tip.width - 8))}px`
    const boundary = this.element.closest("[data-tooltip-boundary]")?.getBoundingClientRect() || anchor
    const top = boundary.bottom + 6
    this.tipTarget.style.top = `${top + tip.height < window.innerHeight - 8 ? top : Math.max(8, anchor.top - tip.height - 6)}px`
  }

  leave() {
    window.clearTimeout(this.closeTimer)
    this.closeTimer = window.setTimeout(() => {
      if (!this.element.contains(document.activeElement)) this.hide()
    }, 120)
  }

  /** @param {FocusEvent} event */
  blur(event) {
    if (!(event.relatedTarget instanceof Node) || !this.element.contains(event.relatedTarget)) this.hide()
  }

  hide() {
    window.clearTimeout(this.closeTimer)
    this.tipTarget.hidePopover()
  }

  disconnect() { this.hide() }
}

import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} Bindings
 * @property {string} storageKeyValue
 * @property {string} expandLabelValue
 * @property {string} collapseLabelValue
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static values = { storageKey: String, expandLabel: String, collapseLabel: String }

  connect() {
    let collapsed = false
    try { collapsed = localStorage.getItem(this.storageKeyValue) === "collapsed" } catch (_) { /* Storage is optional for panel preferences. */ }
    this.render(collapsed)
  }

  get panel() { return document.getElementById(this.element.getAttribute("aria-controls") || "") }

  toggle() {
    const collapsed = this.element.getAttribute("aria-expanded") === "true"
    this.render(collapsed)
    try { localStorage.setItem(this.storageKeyValue, collapsed ? "collapsed" : "expanded") } catch (_) { /* The control still works when storage is unavailable. */ }
  }

  /** @param {boolean} collapsed */
  render(collapsed) {
    if (!this.panel) return
    this.panel.hidden = collapsed
    this.element.setAttribute("aria-expanded", String(!collapsed))
    const label = collapsed ? this.expandLabelValue : this.collapseLabelValue
    this.element.setAttribute("aria-label", label)
    this.element.setAttribute("title", label)
    window.dispatchEvent(new Event("resize"))
  }
}

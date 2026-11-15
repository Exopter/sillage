import { Controller } from "@hotwired/stimulus"

// Shows one page section at a time. Tabs are links to the panel ids, so the
// selected section survives a reload and can be shared as a URL fragment.
export default class extends Controller {
  static targets = ["tab", "panel"]

  connect() {
    this.sync = this.sync.bind(this)
    window.addEventListener("hashchange", this.sync)
    this.sync()
  }

  disconnect() {
    window.removeEventListener("hashchange", this.sync)
  }

  /** @param {Event & { params: { name?: string } }} event */
  select(event) {
    event.preventDefault()
    const name = event.params.name
    if (!name) return
    history.replaceState(null, "", `#${name}`)
    this.show(name)
  }

  sync() {
    const requested = decodeURIComponent(window.location.hash.slice(1))
    const panels = /** @type {HTMLElement[]} */ (/** @type {any} */ (this).panelTargets)
    const known = panels.some((panel) => panel.id === requested)
    if (known) this.show(requested)
  }

  /** @param {string} name */
  show(name) {
    const self = /** @type {any} */ (this)
    const panels = /** @type {HTMLElement[]} */ (self.panelTargets)
    const tabs = /** @type {HTMLElement[]} */ (self.tabTargets)
    panels.forEach((panel) => { panel.hidden = panel.id !== name })
    tabs.forEach((tab) => {
      if (tab.dataset.sectionTabsNameParam === name) tab.setAttribute("aria-current", "page")
      else tab.removeAttribute("aria-current")
    })
    // Charts and the 3D scene measure their container: let them resize once visible.
    window.dispatchEvent(new Event("resize"))
  }
}

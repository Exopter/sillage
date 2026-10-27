import { Controller } from "@hotwired/stimulus"

/** @typedef {{branchTargets: HTMLElement[], groupTargets: HTMLElement[], filterTargets: HTMLButtonElement[], searchTarget: HTMLInputElement, expandTarget: HTMLButtonElement, countTarget: HTMLElement, emptyTarget: HTMLElement, desktopTarget: HTMLElement, mobileTarget: HTMLElement, dialogTarget: HTMLDialogElement, frameTarget: HTMLElement, selectedValue: string}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["branch", "group", "filter", "search", "expand", "count", "empty", "desktop", "mobile", "dialog", "frame"]
  static values = { selected: String }
  expanded = new Set()
  category = "all"
  /** @type {Map<string, HTMLElement>} */
  branches = new Map()
  /** @type {HTMLAnchorElement | null} */
  opener = null
  media = window.matchMedia("(max-width:1100px)")
  resize = () => { if (!this.media.matches) this.close() }

  connect() {
    this.element.classList.add("is-enhanced")
    this.branches = new Map(this.branchTargets.map(branch => [branch.dataset.key || "", branch]))
    let node = this.branches.get(this.selectedValue)
    while (node) {
      this.expanded.add(node.dataset.key)
      node = this.branches.get(node.dataset.parent || "")
    }
    this.media.addEventListener("change", this.resize)
    this.render()
  }

  disconnect() { this.media.removeEventListener("change", this.resize) }
  beforeCache() { this.close(); this.desktopTarget.append(this.frameTarget) }
  search() { this.render() }
  clearSearch() { this.searchTarget.value = ""; this.render(); this.searchTarget.focus() }

  /** @param {Event} event */
  filter(event) {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget)
    this.category = button.dataset.filter || "all"
    this.filterTargets.forEach(target => {
      const active = target === button
      target.classList.toggle("is-active", active)
      target.setAttribute("aria-pressed", String(active))
    })
    this.render()
  }

  /** @param {Event} event */
  toggle(event) {
    const key = /** @type {HTMLElement} */ (event.currentTarget).dataset.key
    this.expanded.has(key) ? this.expanded.delete(key) : this.expanded.add(key)
    this.render()
  }

  expandAll() {
    const parents = this.branchTargets.filter(branch => branch.querySelector(":scope > [data-node-children]"))
    if (parents.every(branch => this.expanded.has(branch.dataset.key))) this.expanded.clear()
    else parents.forEach(branch => this.expanded.add(branch.dataset.key))
    this.render()
  }

  /** @param {MouseEvent} event */
  select(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    const link = /** @type {HTMLAnchorElement} */ (event.currentTarget)
    this.selectedValue = link.dataset.key || ""
    if (!this.dialogTarget.open) this.opener = link
    this.branchTargets.forEach(branch => {
      const selected = branch.dataset.key === this.selectedValue
      branch.querySelector(":scope > [data-node-row]")?.classList.toggle("is-selected", selected)
      const anchor = branch.querySelector(":scope > [data-node-row] a")
      if (selected) anchor?.setAttribute("aria-current", "true")
      else anchor?.removeAttribute("aria-current")
    })
    if (this.media.matches && !this.dialogTarget.open) {
      this.mobileTarget.append(this.frameTarget)
      this.dialogTarget.showModal()
    }
  }

  close() { if (this.dialogTarget.open) this.dialogTarget.close() }
  closeDialog() { this.desktopTarget.append(this.frameTarget); this.opener?.focus() }

  render() {
    const query = this.searchTarget.value.trim().toLocaleLowerCase()
    const included = new Set()
    const direct = new Set()
    for (const branch of this.branchTargets) {
      if (this.category !== "all" && branch.dataset.category !== this.category) continue
      if (query && !branch.dataset.search?.includes(query)) continue
      direct.add(branch.dataset.key)
      included.add(branch.dataset.key)
      // Include the descendants of a matching assembly and every ancestor.
      branch.querySelectorAll("[data-key][data-kind]").forEach(child => included.add(/** @type {HTMLElement} */ (child).dataset.key))
      let parent = this.branches.get(branch.dataset.parent || "")
      while (parent) { included.add(parent.dataset.key); parent = this.branches.get(parent.dataset.parent || "") }
    }
    for (const branch of this.branchTargets) {
      branch.hidden = !included.has(branch.dataset.key)
      const children = /** @type {HTMLElement | null} */ (branch.querySelector(":scope > [data-node-children]"))
      const button = /** @type {HTMLButtonElement | null} */ (branch.querySelector(":scope > [data-node-row] button"))
      const open = Boolean(query) || this.expanded.has(branch.dataset.key)
      if (children) children.hidden = !open
      if (button) {
        button.disabled = Boolean(query)
        button.setAttribute("aria-expanded", String(open))
        button.setAttribute("aria-label", `${open ? "Collapse" : "Expand"} ${button.dataset.label}`)
      }
    }
    this.groupTargets.forEach(group => { group.hidden = !this.branchTargets.some(branch => branch.dataset.category === group.dataset.category && included.has(branch.dataset.key)) })
    const count = query ? direct.size : this.branchTargets.filter(branch => branch.dataset.kind !== "part" && included.has(branch.dataset.key)).length
    this.countTarget.textContent = query ? `${count} ${count === 1 ? "match" : "matches"}` : `${count} ${count === 1 ? "assembly" : "assemblies"}`
    this.emptyTarget.hidden = included.size > 0
    this.expandTarget.disabled = Boolean(query) || !included.size
    const parents = this.branchTargets.filter(branch => branch.querySelector(":scope > [data-node-children]"))
    this.expandTarget.textContent = parents.every(branch => this.expanded.has(branch.dataset.key)) ? "Collapse all" : "Expand all"
  }
}

import { Controller } from "@hotwired/stimulus"

/** @typedef {{id: number, email: string}} Member */
/** @typedef {{searchTarget: HTMLInputElement, resultsTarget: HTMLElement, statusTarget: HTMLElement, listTarget: HTMLElement, emptyTarget: HTMLElement, templateTarget: HTMLTemplateElement, urlValue: string}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["search", "results", "status", "list", "empty", "template"]
  static values = { url: String }
  /** @type {Member[]} */
  matches = []
  activeIndex = -1
  revision = 0
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  timer
  /** @type {AbortController | undefined} */
  request

  disconnect() { this.cancelSearch() }

  cancelSearch() {
    clearTimeout(this.timer)
    this.request?.abort()
    this.revision++
  }

  selectedIds() {
    return Array.from(this.listTarget.querySelectorAll("[data-member-id]"), (row) => row.getAttribute("data-member-id"))
  }

  search() {
    this.cancelSearch()
    this.closeResults()
    const query = this.searchTarget.value.trim()
    if (query.length < 2) {
      this.statusTarget.textContent = "Type at least 2 characters to find someone."
      return
    }
    this.statusTarget.textContent = "Searching…"
    const revision = this.revision
    this.timer = setTimeout(() => this.lookup(query, revision), 180)
  }

  /** @param {string} query @param {number} revision */
  async lookup(query, revision) {
    const request = new AbortController()
    this.request = request
    const params = new URLSearchParams({ q: query })
    for (const id of this.selectedIds()) if (id) params.append("exclude_ids[]", id)
    try {
      const response = await fetch(`${this.urlValue}?${params}`, { signal: request.signal, headers: { Accept: "application/json" }, cache: "no-store" })
      if (!response.ok) throw new Error("Search failed")
      const data = await response.json()
      if (revision !== this.revision) return
      this.matches = data.members.filter((/** @type {Member} */ member) => !this.selectedIds().includes(String(member.id)))
      this.renderResults()
      this.statusTarget.textContent = this.matches.length ?
        (data.has_more ? "Showing 8 matches. Keep typing to narrow the results." : `${this.matches.length} ${this.matches.length === 1 ? "person" : "people"} found. Select someone to add.`) :
        "No matching people to add. Try another email."
    } catch (error) {
      if (revision !== this.revision || request.signal.aborted) return
      this.closeResults()
      this.statusTarget.textContent = "Unable to search. Type again to retry."
    }
  }

  renderResults() {
    this.resultsTarget.replaceChildren()
    this.matches.forEach((member, index) => {
      const option = document.createElement("button")
      option.type = "button"
      option.className = "exds-browser-member-option"
      option.id = `folder-member-option-${member.id}`
      option.setAttribute("role", "option")
      option.setAttribute("aria-selected", "false")
      option.tabIndex = -1
      const avatar = document.createElement("span")
      avatar.className = "exds-browser-member-avatar"
      avatar.setAttribute("aria-hidden", "true")
      avatar.textContent = member.email[0].toUpperCase()
      const email = document.createElement("span")
      email.className = "exds-browser-member-email"
      email.textContent = member.email
      option.append(avatar, email)
      // Keep focus on the combobox so a pointer selection cannot dismiss itself.
      option.addEventListener("mousedown", (event) => event.preventDefault())
      option.addEventListener("click", () => this.add(index))
      this.resultsTarget.append(option)
    })
    this.resultsTarget.hidden = this.matches.length === 0
    this.searchTarget.setAttribute("aria-expanded", String(this.matches.length > 0))
  }

  /** @param {KeyboardEvent} event */
  navigate(event) {
    if (event.key === "Escape" && !this.resultsTarget.hidden) {
      event.preventDefault()
      event.stopPropagation()
      this.cancelSearch()
      this.closeResults()
    } else if (["ArrowDown", "ArrowUp"].includes(event.key) && this.matches.length) {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      this.activeIndex = this.activeIndex < 0 ? (step === 1 ? 0 : this.matches.length - 1) :
        (this.activeIndex + step + this.matches.length) % this.matches.length
      Array.from(this.resultsTarget.children).forEach((option, index) => {
        option.setAttribute("aria-selected", String(index === this.activeIndex))
        if (index === this.activeIndex) {
          this.searchTarget.setAttribute("aria-activedescendant", option.id)
          option.scrollIntoView({ block: "nearest" })
        }
      })
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (this.activeIndex >= 0) this.add(this.activeIndex)
    }
  }

  /** @param {number} index */
  add(index) {
    const member = this.matches[index]
    if (!member || this.selectedIds().includes(String(member.id))) return
    const fragment = /** @type {DocumentFragment} */ (this.templateTarget.content.cloneNode(true))
    const row = /** @type {HTMLElement} */ (fragment.querySelector("[data-member-id]"))
    row.dataset.memberId = String(member.id)
    const input = /** @type {HTMLInputElement} */ (row.querySelector("input"))
    input.value = String(member.id)
    const email = /** @type {HTMLElement} */ (row.querySelector(".exds-browser-member-email"))
    email.textContent = member.email
    const avatar = /** @type {HTMLElement} */ (row.querySelector(".exds-browser-member-avatar"))
    avatar.textContent = member.email[0].toUpperCase()
    row.querySelector("button")?.setAttribute("aria-label", `Remove ${member.email}`)
    this.listTarget.append(fragment)
    this.emptyTarget.hidden = true
    this.cancelSearch()
    this.closeResults()
    this.searchTarget.value = ""
    this.searchTarget.focus()
    this.statusTarget.textContent = `${member.email} added. Save folder to apply changes.`
  }

  /** @param {MouseEvent} event */
  remove(event) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    const row = event.currentTarget.closest("[data-member-id]")
    const email = row?.querySelector(".exds-browser-member-email")?.textContent
    row?.remove()
    this.emptyTarget.hidden = this.selectedIds().length > 0
    this.searchTarget.value = ""
    this.searchTarget.focus()
    this.cancelSearch()
    this.closeResults()
    this.statusTarget.textContent = `${email} removed. Save folder to apply changes.`
  }

  /** @param {FocusEvent} event */
  leaveSearch(event) {
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    this.cancelSearch()
    this.closeResults()
  }

  closeResults() {
    this.matches = []
    this.activeIndex = -1
    this.resultsTarget.hidden = true
    this.resultsTarget.replaceChildren()
    this.searchTarget.setAttribute("aria-expanded", "false")
    this.searchTarget.removeAttribute("aria-activedescendant")
  }
}

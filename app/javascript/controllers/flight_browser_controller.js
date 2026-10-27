import { Controller } from "@hotwired/stimulus"
import { Turbo } from "@hotwired/turbo-rails"

/** @typedef {{entryTargets: HTMLAnchorElement[], hasDialogTarget:boolean, hasMoveDialogTarget:boolean, selectionTarget: HTMLFormElement, dialogTarget: HTMLDialogElement, dialogTitleTarget: HTMLElement, folderFormTarget: HTMLFormElement, folderNameTarget: HTMLInputElement, folderMethodTarget: HTMLInputElement, moveDialogTarget: HTMLDialogElement, moveEntryTarget: HTMLInputElement, moveNameTarget: HTMLElement, moveDestinationTarget: HTMLSelectElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["entry", "selection", "dialog", "dialogTitle", "folderForm", "folderName", "folderMethod", "moveDialog", "moveEntry", "moveName", "moveDestination"]
  /** @type {string[]} */
  dragEntries = []

  /** @param {MouseEvent} event */
  select(event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const link = event.currentTarget
    if (!(link instanceof HTMLAnchorElement)) return
    this.entryTargets.forEach((entry) => {
      entry.dataset.selected = String(entry === link)
      entry.closest("[data-entry]")?.setAttribute("aria-current", String(entry === link))
    })
    this.element.setAttribute("data-mobile-preview", "")
    const url = new URL(this.element.dataset.indexUrl || window.location.href, window.location.origin)
    url.searchParams.set("selected", link.closest("[data-entry]")?.getAttribute("data-entry") || "")
    window.history.replaceState(window.history.state, "", url)
  }

  backToFlights() { this.element.removeAttribute("data-mobile-preview") }

  reset() { this.closeDialog(); this.closeMoveDialog(); this.endDrag() }
  disconnect() { this.endDrag() }

  /** @param {Event} event */
  filter(event) { if (event.currentTarget instanceof HTMLFormElement) event.currentTarget.requestSubmit() }

  /** @param {MouseEvent} event */
  newFolder(event) {
    event.preventDefault()
    this.folderFormTarget.action = this.folderFormTarget.dataset.createUrl || ""
    this.folderMethodTarget.value = "post"
    this.folderNameTarget.value = ""
    this.dialogTitleTarget.textContent = "New folder"
    this.dialogTarget.showModal()
    this.folderNameTarget.focus()
  }

  /** @param {MouseEvent} event */
  renameFolder(event) {
    if (!(event.currentTarget instanceof HTMLAnchorElement)) return
    event.preventDefault()
    this.folderFormTarget.action = event.currentTarget.dataset.folderUrl || ""
    this.folderMethodTarget.value = "patch"
    this.folderNameTarget.value = event.currentTarget.dataset.folderName || ""
    this.dialogTitleTarget.textContent = "Rename folder"
    this.dialogTarget.showModal()
    this.folderNameTarget.select()
  }

  closeDialog() { if (this.hasDialogTarget) this.dialogTarget.close() }

  /** @param {MouseEvent} event */
  moveFlight(event) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    this.moveEntryTarget.value = event.currentTarget.dataset.flightKey || ""
    this.moveNameTarget.textContent = event.currentTarget.dataset.flightName || ""
    this.moveDestinationTarget.value = event.currentTarget.dataset.folderId || "unfiled"
    this.moveDialogTarget.showModal()
  }

  closeMoveDialog() { if (this.hasMoveDialogTarget) this.moveDialogTarget.close() }

  /** @param {KeyboardEvent} event */
  navigate(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (!(event.target instanceof HTMLAnchorElement) || !this.entryTargets.includes(event.target)) return
    const index = this.entryTargets.indexOf(event.target)
    if (event.key === "Enter") {
      event.preventDefault()
      Turbo.visit(event.target.dataset.openUrl || event.target.href)
    } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault()
      const next = this.entryTargets[index + (event.key === "ArrowDown" ? 1 : -1)]
      if (next) { next.focus({ preventScroll: true }); next.click() }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      const folder = /** @type {HTMLElement | null} */ (this.element.querySelector('.exds-browser-sidebar a[aria-current="page"]'))
      folder?.focus()
    }
  }

  /** @param {MouseEvent} event */
  open(event) {
    if (!(event.currentTarget instanceof HTMLAnchorElement)) return
    event.preventDefault()
    Turbo.visit(event.currentTarget.dataset.openUrl || event.currentTarget.href)
  }

  /** @param {DragEvent} event */
  startDrag(event) {
    const row = event.currentTarget
    if (!(row instanceof HTMLElement) || !row.draggable || !row.dataset.entry?.startsWith("flight:")) { event.preventDefault(); return }
    const checked = Array.from(this.selectionTarget.querySelectorAll('input[name="entries[]"]:checked')).map((input) => /** @type {HTMLInputElement} */ (input).value)
    this.dragEntries = checked.includes(row.dataset.entry) ? checked : [row.dataset.entry]
    if (this.dragEntries.some((key) => !key.startsWith("flight:"))) { this.endDrag(); event.preventDefault(); return }
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", `${this.dragEntries.length} flight(s)`) }
  }

  /** @param {DragEvent} event */
  overFolder(event) {
    if (!this.dragEntries.length || !(event.currentTarget instanceof HTMLElement) || !event.currentTarget.dataset.folderDestination) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
    event.currentTarget.toggleAttribute("data-drop-active", true)
  }

  /** @param {DragEvent} event */
  leaveFolder(event) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("data-drop-active")
  }

  /** @param {DragEvent} event */
  drop(event) {
    if (!this.dragEntries.length || !(event.currentTarget instanceof HTMLElement)) return
    const destination = event.currentTarget.dataset.folderDestination
    if (!destination) return
    event.preventDefault()
    const form = this.selectionTarget
    form.querySelectorAll('input[name="entries[]"]').forEach((input) => { const checkbox = /** @type {HTMLInputElement} */ (input); checkbox.checked = this.dragEntries.includes(checkbox.value) })
    const select = /** @type {HTMLSelectElement | null} */ (form.querySelector('select[name="destination_folder_id"]'))
    if (select) { select.value = destination; select.dispatchEvent(new Event("change", { bubbles: true })) }
    const submit = /** @type {HTMLButtonElement | null} */ (form.querySelector('button[value="move"]'))
    if (submit && !submit.disabled) form.requestSubmit(submit)
    this.endDrag()
  }

  endDrag() {
    this.dragEntries = []
    this.element.querySelectorAll("[data-drop-active]").forEach((target) => target.removeAttribute("data-drop-active"))
  }
}

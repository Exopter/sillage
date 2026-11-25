import { Controller } from "@hotwired/stimulus"
import { Turbo } from "@hotwired/turbo-rails"

/** @typedef {{entryTargets: HTMLAnchorElement[], paneToggleTargets: HTMLButtonElement[], resizerTarget: HTMLElement, hasResizerTarget:boolean, hasDialogTarget:boolean, hasMoveDialogTarget:boolean, selectionTarget: HTMLFormElement, dialogTarget: HTMLDialogElement, dialogTitleTarget: HTMLElement, folderFormTarget: HTMLFormElement, folderNameTarget: HTMLInputElement, folderMethodTarget: HTMLInputElement, moveDialogTarget: HTMLDialogElement, moveEntryTarget: HTMLInputElement, moveNameTarget: HTMLElement, moveDestinationTarget: HTMLSelectElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

const PANES_KEY = "sillage.flight-browser.panes"
// The flight list keeps at least this much room while the details pane is dragged wider.
const LIST_MIN_WIDTH = 360
const PREVIEW_MIN_WIDTH = 320
const RESIZE_KEY_STEP = 24

export default class extends TypedController {
  static targets = ["entry", "paneToggle", "resizer", "selection", "dialog", "dialogTitle", "folderForm", "folderName", "folderMethod", "moveDialog", "moveEntry", "moveName", "moveDestination"]
  /** @type {string[]} */
  dragEntries = []
  /** @type {ResizeObserver | undefined} */
  sizeObserver

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

  connect() {
    this.applyPanes(this.storedPanes())
    this.sizeObserver = new ResizeObserver(() => this.describeResizer())
    this.sizeObserver.observe(this.element)
  }

  // Folder visibility is remembered. Details start open whenever the browser reconnects.
  /** @param {MouseEvent} event */
  togglePane(event) {
    const button = event.currentTarget
    if (!(button instanceof HTMLButtonElement) || !button.dataset.pane) return
    const open = button.getAttribute("aria-expanded") !== "true"
    const panes = this.storedPanes()
    const togglesFolders = button.dataset.pane === "folders"
    if (togglesFolders) {
      panes.folders = open
      try { window.localStorage.setItem(PANES_KEY, JSON.stringify(panes)) } catch { /* The choice then lasts for this page only. */ }
    }
    this.applyPanes(panes, togglesFolders ? this.element.dataset.preview !== "hidden" : open)
  }

  // Dragging the edge of the details pane sets its width; the list keeps LIST_MIN_WIDTH.
  /** @param {PointerEvent} event */
  startResize(event) {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = this.resizerTarget
    handle.setPointerCapture(event.pointerId)
    this.element.dataset.resizing = ""
    /** @param {PointerEvent} move */
    const drag = (move) => this.setPreviewWidth(this.element.getBoundingClientRect().right - move.clientX)
    const stop = () => {
      handle.removeEventListener("pointermove", drag)
      handle.removeEventListener("pointerup", stop)
      handle.removeEventListener("pointercancel", stop)
      this.element.removeAttribute("data-resizing")
      this.storePreviewWidth()
    }
    handle.addEventListener("pointermove", drag)
    handle.addEventListener("pointerup", stop)
    handle.addEventListener("pointercancel", stop)
  }

  /** @param {KeyboardEvent} event */
  resizeWithKeys(event) {
    const { min, max, now } = this.previewBounds()
    const width = { ArrowLeft: now + RESIZE_KEY_STEP, ArrowRight: now - RESIZE_KEY_STEP, Home: min, End: max }[event.key]
    if (width === undefined || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    this.setPreviewWidth(width)
    this.storePreviewWidth()
  }

  resetPreviewWidth() {
    this.element.style.removeProperty("--exds-browser-preview-size")
    this.element.removeAttribute("data-preview-sized")
    this.storePreviewWidth(null)
    this.describeResizer()
  }

  /** @param {number} width */
  setPreviewWidth(width) {
    const { min, max } = this.previewBounds()
    this.element.style.setProperty("--exds-browser-preview-size", `${Math.round(Math.min(Math.max(width, min), max))}px`)
    this.element.dataset.previewSized = ""
    this.describeResizer()
  }

  /** @param {number | null} [width] */
  storePreviewWidth(width = parseInt(this.element.style.getPropertyValue("--exds-browser-preview-size"), 10) || null) {
    const panes = { ...this.storedPanes(), previewWidth: width }
    try { window.localStorage.setItem(PANES_KEY, JSON.stringify(panes)) } catch { /* The width then lasts for this page only. */ }
  }

  previewBounds() {
    const preview = this.element.querySelector(".exds-browser-preview")
    const folders = this.element.querySelector(".exds-browser-sidebar")
    const max = Math.max(PREVIEW_MIN_WIDTH, this.element.clientWidth - (folders?.clientWidth || 0) - LIST_MIN_WIDTH)
    return { min: PREVIEW_MIN_WIDTH, max, now: Math.round(preview?.getBoundingClientRect().width || 0) }
  }

  describeResizer() {
    if (!this.hasResizerTarget) return
    const { min, max, now } = this.previewBounds()
    this.resizerTarget.setAttribute("aria-valuemin", String(min))
    this.resizerTarget.setAttribute("aria-valuemax", String(max))
    this.resizerTarget.setAttribute("aria-valuenow", String(now))
    this.resizerTarget.setAttribute("aria-valuetext", `Details ${now} pixels wide`)
  }

  /** @returns {Record<string, any>} */
  storedPanes() {
    try {
      const { folders, previewWidth } = JSON.parse(window.localStorage.getItem(PANES_KEY) || "{}") || {}
      return { folders, previewWidth }
    } catch { return {} }
  }

  /** @param {Record<string, any>} panes */
  applyPanes(panes, preview = true) {
    const folders = panes.folders !== false
    if (folders) this.element.removeAttribute("data-folders"); else this.element.dataset.folders = "collapsed"
    if (preview) this.element.removeAttribute("data-preview"); else this.element.dataset.preview = "hidden"
    this.paneToggleTargets.forEach((button) => {
      const open = button.dataset.pane === "folders" ? folders : preview
      button.setAttribute("aria-expanded", String(open))
      button.title = `${open ? "Hide" : "Show"} ${button.dataset.pane === "folders" ? "folders" : "details"}`
    })
    if (Number(panes.previewWidth) > 0) this.setPreviewWidth(Number(panes.previewWidth)); else this.describeResizer()
  }

  backToFlights() { this.element.removeAttribute("data-mobile-preview") }

  reset() { this.closeDialog(); this.closeMoveDialog(); this.endDrag() }
  disconnect() { this.endDrag(); this.sizeObserver?.disconnect() }

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

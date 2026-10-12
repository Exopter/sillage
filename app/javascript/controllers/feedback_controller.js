import { Controller } from "@hotwired/stimulus"
import { paintAnnotations } from "feedback_annotations"

/** @extends {Controller<HTMLDivElement>} */
export default class extends Controller {
  /** @type {Array<Array<{x: number, y: number}>>} */
  strokes = []
  /** @type {number | null} */
  pointer = null
  previewUrl = ""
  busy = false
  generation = 0

  get form() { return /** @type {HTMLFormElement} */ (this.element.querySelector("form")) }
  get panel() { return /** @type {HTMLElement} */ (this.element.querySelector("[popover]")) }
  get dialog() { return /** @type {HTMLDialogElement} */ (this.element.querySelector("dialog")) }
  get canvas() { return /** @type {HTMLCanvasElement} */ (this.element.querySelector("canvas")) }
  get file() { return /** @type {HTMLInputElement} */ (this.element.querySelector('input[type="file"]')) }
  get image() { return /** @type {HTMLImageElement} */ (this.element.querySelector("[data-feedback-image]")) }
  /** @param {string} selector */
  region(selector) { return /** @type {HTMLElement} */ (this.element.querySelector(selector)) }
  /** @param {string} message */
  error(message) { this.region("[data-feedback-error]").textContent = message }

  disconnect() { this.cleanup() }

  cleanup() {
    this.generation++
    this.dialog.close()
    this.panel.hidePopover()
    this.removeScreenshot()
    this.strokes = []
    this.pointer = null
    this.setBusy(false)
  }

  start() {
    if (this.busy) return
    this.error("")
    this.strokes = []
    this.pointer = null
    this.canvas.width = Math.round(window.innerWidth * window.devicePixelRatio)
    this.canvas.height = Math.round(window.innerHeight * window.devicePixelRatio)
    this.panel.hidePopover()
    this.dialog.showModal()
    this.region("[data-feedback-capture-status]").textContent = "Draw to highlight an idea or problem."
    this.redraw()
  }

  /** @param {Event} [event] */
  cancel(event) {
    event?.preventDefault()
    this.generation++
    this.dialog.close()
    this.pointer = null
    this.setBusy(false)
    if (this.element.isConnected) this.panel.showPopover()
  }

  viewportChanged() {
    if (!this.dialog.open) return
    this.cancel()
    this.error("The page moved or resized. Please annotate it again.")
  }

  /** @param {Event} event */
  preventScroll(event) {
    if (event instanceof WheelEvent || (event instanceof KeyboardEvent && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) && event.target === this.dialog)) event.preventDefault()
  }

  /** @param {PointerEvent} event */
  beginStroke(event) {
    if (this.busy || this.pointer !== null || event.button !== 0) return
    event.preventDefault()
    this.pointer = event.pointerId
    this.canvas.setPointerCapture(event.pointerId)
    this.strokes.push([{ x: event.clientX, y: event.clientY }])
    this.redraw()
  }

  /** @param {PointerEvent} event */
  moveStroke(event) {
    if (this.pointer !== event.pointerId || this.busy) return
    this.strokes[this.strokes.length - 1].push({ x: event.clientX, y: event.clientY })
    this.redraw()
  }

  /** @param {PointerEvent} event */
  endStroke(event) {
    if (event.pointerId !== this.pointer) return
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    this.pointer = null
  }

  undo() { if (!this.busy) { this.strokes.pop(); this.redraw() } }
  clear() { if (!this.busy) { this.strokes = []; this.redraw() } }

  redraw() {
    const context = this.canvas.getContext("2d")
    if (!context) return
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    context.scale(this.canvas.width / window.innerWidth, this.canvas.height / window.innerHeight)
    paintAnnotations(context, this.strokes, getComputedStyle(this.element).getPropertyValue("--ex-red-600").trim())
  }

  /** @param {boolean} busy */
  setBusy(busy) {
    this.busy = busy
    this.element.querySelectorAll("button").forEach(button => {
      button.disabled = busy && button.dataset.action !== "feedback#cancel"
    })
    this.form.setAttribute("aria-busy", String(busy))
  }

  async capture() {
    if (this.busy) return
    this.setBusy(true)
    this.pointer = null
    const generation = ++this.generation
    this.region("[data-feedback-capture-status]").textContent = "Capturing the page…"
    try {
      const { default: html2canvas } = await import("html2canvas-pro")
      if (generation !== this.generation) return
      const screenshot = await html2canvas(document.body, {
        width: window.innerWidth, height: window.innerHeight,
        x: window.scrollX, y: window.scrollY, scrollX: window.scrollX, scrollY: window.scrollY,
        scale: Math.min(window.devicePixelRatio, 2), logging: false, useCORS: true,
        imageTimeout: 5000,
        onclone: (document) => {
          document.querySelectorAll('input[type="password"], [data-feedback-private]').forEach(node => node.remove())
          document.querySelectorAll("details:not([open]) > :not(summary)").forEach(node => node.remove())
        }
      })
      if (generation !== this.generation) return
      const context = screenshot.getContext("2d")
      if (!context) throw new Error("Canvas unavailable")
      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.scale(screenshot.width / window.innerWidth, screenshot.height / window.innerHeight)
      paintAnnotations(context, this.strokes, getComputedStyle(this.element).getPropertyValue("--ex-red-600").trim())
      context.restore()
      const blob = await new Promise((resolve, reject) => screenshot.toBlob(value => value ? resolve(value) : reject(new Error("Capture failed")), "image/png"))
      if (generation !== this.generation || !this.element.isConnected) return
      if (blob.size > 8 * 1024 * 1024) throw new Error("Screenshot exceeds 8 MB. Try a smaller browser window.")
      this.removeScreenshot()
      const transfer = new DataTransfer()
      transfer.items.add(new File([blob], "feedback.png", { type: "image/png" }))
      this.file.files = transfer.files
      this.previewUrl = URL.createObjectURL(blob)
      this.image.src = this.previewUrl
      this.region("[data-feedback-preview]").hidden = false
      this.dialog.close()
      this.panel.showPopover()
      this.error("")
    } catch (error) {
      if (generation !== this.generation) return
      this.dialog.close()
      this.panel.showPopover()
      this.error(error instanceof Error && error.message.includes("8 MB") ? error.message : "Could not capture this page. Try again, or send without a screenshot.")
    } finally {
      if (generation === this.generation && this.element.isConnected) this.setBusy(false)
    }
  }

  removeScreenshot() {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl)
    this.previewUrl = ""
    if (this.file) this.file.value = ""
    if (this.image) this.image.removeAttribute("src")
    const preview = this.element.querySelector("[data-feedback-preview]")
    if (preview instanceof HTMLElement) preview.hidden = true
  }

  /** @param {SubmitEvent} event */
  async submit(event) {
    event.preventDefault()
    if (this.busy || !this.form.reportValidity()) return
    this.setBusy(true)
    this.error("")
    const generation = this.generation
    try {
      const response = await fetch(this.form.action, {
        method: "POST", body: new FormData(this.form), credentials: "same-origin",
        headers: { Accept: "application/json" }
      })
      if (generation !== this.generation || !this.element.isConnected) return
      const result = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null
      if (!response.ok || result?.saved !== true) {
        this.error(Array.isArray(result?.errors) ? result.errors.join(" ") : "Could not send feedback. Your draft is kept here; check your connection or sign in again.")
        return
      }
      this.removeScreenshot()
      this.region("[data-feedback-editor]").hidden = true
      const receipt = this.region("[data-feedback-receipt]")
      receipt.hidden = false
      receipt.focus()
    } catch {
      if (generation === this.generation) this.error("Connection interrupted. Your message and screenshot are kept here. Please try again.")
    } finally {
      if (generation === this.generation && this.element.isConnected) this.setBusy(false)
    }
  }

  reset() {
    this.form.reset()
    this.removeScreenshot()
    this.error("")
    this.region("[data-feedback-receipt]").hidden = true
    this.region("[data-feedback-editor]").hidden = false
    this.form.querySelector("textarea")?.focus()
  }
}

import { Controller } from "@hotwired/stimulus"
import { MAX_ZOOM, OUTPUT_SIZE, centeredFrame, clampFrame, coverScale, scaleFrame, sourceSquare, zoomFrame } from "avatar_crop"

/** @typedef {import("avatar_crop").Frame} Frame */
/** @typedef {{inputTarget: HTMLInputElement, previewTarget: HTMLElement, dialogTarget: HTMLDialogElement, stageTarget: HTMLElement, ringTarget: HTMLElement, imageTarget: HTMLImageElement, sampleTarget: HTMLImageElement, zoomTarget: HTMLInputElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// Frames a chosen profile photo in the avatar circle. Confirming the dialog
// replaces the chosen file with the framed square, so every avatar is stored
// ready for its round display. Without JavaScript the original file is uploaded.
export default class extends TypedController {
  static targets = ["input", "preview", "dialog", "stage", "ring", "image", "sample", "zoom"]

  /** @type {Frame | null} */
  frame = null
  /** Side of the square that bounds the circle, in CSS pixels. */
  size = 0
  /** @type {File | null} */
  source = null
  /** The framed file sent with the form, once a framing is confirmed.
   * @type {FileList | null} */
  applied = null
  /** @type {string | null} */
  sourceUrl = null
  /** @type {string | null} */
  previewUrl = null
  /** @type {Map<number, {x: number, y: number}>} */
  pointers = new Map()

  resize = () => {
    const size = this.ringTarget.clientWidth
    if (!this.frame || !size || size === this.size) return
    this.frame = scaleFrame(this.frame, size / this.size)
    this.size = size
    this.render()
  }

  disconnect() {
    window.removeEventListener("resize", this.resize)
    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl)
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl)
  }

  choose() {
    const file = this.inputTarget.files?.[0]
    if (file) this.open(file)
  }

  /** @param {File} file */
  open(file) {
    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl)
    const url = this.sourceUrl = URL.createObjectURL(file)
    const image = this.imageTarget
    image.onload = () => {
      if (this.sourceUrl !== url) return
      this.source = file
      this.sampleTarget.src = url
      this.dialogTarget.showModal()
      window.addEventListener("resize", this.resize)
      this.size = this.ringTarget.clientWidth
      this.frame = centeredFrame(image.naturalWidth, image.naturalHeight, this.size)
      this.render()
    }
    // A file the browser cannot draw is uploaded as chosen and validated by the server.
    image.onerror = () => { if (this.sourceUrl === url) this.source = null }
    image.src = url
  }

  // Leaving without confirming (Cancel, Escape) keeps the previous framing, or
  // no photo at all: an unframed original is never left in the form.
  dismiss() {
    if (!this.frame) return
    if (this.applied) this.inputTarget.files = this.applied
    else this.inputTarget.value = ""
    this.finish()
  }

  finish() {
    window.removeEventListener("resize", this.resize)
    this.pointers.clear()
    this.stageTarget.classList.remove("is-dragging")
    this.frame = null
    if (this.dialogTarget.open) this.dialogTarget.close()
  }

  async use() {
    const { frame, source, size } = this
    if (!frame || !source) return
    const blob = await this.framed(frame, size)
    if (blob) {
      const transfer = new DataTransfer()
      transfer.items.add(new File([blob], `${source.name.replace(/\.[^.]*$/, "")}.jpg`, { type: "image/jpeg" }))
      this.inputTarget.files = transfer.files
      this.applied = transfer.files
      this.show(blob)
    }
    // If the square could not be produced, the original file stays in the form.
    this.finish()
  }

  /** @param {Frame} frame @param {number} size @returns {Promise<Blob | null>} */
  async framed(frame, size) {
    try {
      const square = sourceSquare(frame, size)
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = Math.round(Math.min(OUTPUT_SIZE, square.size))
      const context = canvas.getContext("2d")
      if (!context) return null
      // JPEG has no transparency: transparent areas of a PNG or WebP become white.
      context.fillStyle = "#fff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.imageSmoothingQuality = "high"
      context.drawImage(this.imageTarget, square.x, square.y, square.size, square.size, 0, 0, canvas.width, canvas.height)
      return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
    } catch {
      return null
    }
  }

  // Shows the framed photo in the field's avatar before the form is saved.
  /** @param {Blob} blob */
  show(blob) {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl)
    this.previewUrl = URL.createObjectURL(blob)
    const avatar = this.previewTarget.querySelector(".sillage-avatar")
    let photo = avatar?.querySelector(".sillage-avatar-photo")
    if (!(photo instanceof HTMLImageElement)) {
      photo = document.createElement("img")
      photo.className = "sillage-avatar-photo"
      photo.setAttribute("alt", "")
      avatar?.prepend(photo)
    }
    photo.setAttribute("src", this.previewUrl)
  }

  zoom() { this.zoomTo(this.cover * Number(this.zoomTarget.value)) }

  zoomIn() { if (this.frame) this.zoomTo(this.frame.scale * 1.25) }

  zoomOut() { if (this.frame) this.zoomTo(this.frame.scale / 1.25) }

  /** @param {WheelEvent} event */
  wheel(event) {
    if (!this.frame) return
    event.preventDefault()
    const point = this.point(event)
    this.zoomTo(this.frame.scale * Math.exp(-event.deltaY * 0.002), point.x, point.y)
  }

  /** @param {PointerEvent} event */
  press(event) {
    if (!this.frame) return
    this.stageTarget.setPointerCapture(event.pointerId)
    this.pointers.set(event.pointerId, this.point(event))
    this.stageTarget.classList.add("is-dragging")
  }

  /** @param {PointerEvent} event */
  drag(event) {
    const previous = this.pointers.get(event.pointerId)
    if (!previous || !this.frame) return
    const point = this.point(event)
    const other = [...this.pointers].find(([id]) => id !== event.pointerId)?.[1]
    this.pointers.set(event.pointerId, point)
    if (other) {
      // Two fingers: the pinch distance zooms around the fingers' midpoint.
      const spread = Math.hypot(point.x - other.x, point.y - other.y) / Math.max(1, Math.hypot(previous.x - other.x, previous.y - other.y))
      this.zoomTo(this.frame.scale * spread, (point.x + other.x) / 2, (point.y + other.y) / 2)
    }
    const share = other ? 0.5 : 1
    this.moveBy((point.x - previous.x) * share, (point.y - previous.y) * share)
  }

  /** @param {PointerEvent} event */
  drop(event) {
    this.pointers.delete(event.pointerId)
    this.stageTarget.classList.toggle("is-dragging", this.pointers.size > 0)
  }

  /** @param {KeyboardEvent} event */
  nudge(event) {
    if (!this.frame) return
    const step = event.shiftKey ? 24 : 6
    const moves = /** @type {Record<string, [number, number]>} */ ({ ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] })
    const move = moves[event.key]
    if (move) this.moveBy(...move)
    else if (event.key === "+" || event.key === "=") this.zoomIn()
    else if (event.key === "-") this.zoomOut()
    else return
    event.preventDefault()
  }

  get cover() {
    return coverScale(this.imageTarget.naturalWidth, this.imageTarget.naturalHeight, this.size)
  }

  // Pointer position relative to the square that bounds the circle.
  /** @param {MouseEvent} event */
  point(event) {
    const rect = this.ringTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /** @param {number} scale @param {number} [pivotX] @param {number} [pivotY] */
  zoomTo(scale, pivotX = this.size / 2, pivotY = this.size / 2) {
    if (!this.frame) return
    this.frame = zoomFrame(this.frame, scale, pivotX, pivotY, this.imageTarget.naturalWidth, this.imageTarget.naturalHeight, this.size)
    this.render()
  }

  /** @param {number} x @param {number} y */
  moveBy(x, y) {
    if (!this.frame) return
    this.frame = clampFrame({ ...this.frame, x: this.frame.x + x, y: this.frame.y + y }, this.imageTarget.naturalWidth, this.imageTarget.naturalHeight, this.size)
    this.render()
  }

  render() {
    if (!this.frame) return
    const { naturalWidth, naturalHeight } = this.imageTarget
    this.place(this.imageTarget, 1, this.ringTarget.offsetLeft, this.ringTarget.offsetTop)
    const sample = this.sampleTarget.parentElement
    if (sample) this.place(this.sampleTarget, sample.clientWidth / this.size, 0, 0)
    const zoom = this.frame.scale / coverScale(naturalWidth, naturalHeight, this.size)
    this.zoomTarget.value = String(zoom)
    this.zoomTarget.style.setProperty("--fill", `${((zoom - 1) / (MAX_ZOOM - 1)) * 100}%`)
  }

  /** @param {HTMLImageElement} image @param {number} ratio @param {number} left @param {number} top */
  place(image, ratio, left, top) {
    if (!this.frame) return
    image.style.width = `${this.imageTarget.naturalWidth * this.frame.scale * ratio}px`
    image.style.height = `${this.imageTarget.naturalHeight * this.frame.scale * ratio}px`
    image.style.transform = `translate(${left + this.frame.x * ratio}px, ${top + this.frame.y * ratio}px)`
  }
}

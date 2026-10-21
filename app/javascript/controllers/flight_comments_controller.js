import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["timestamp"]

  /** @type {Map<HTMLInputElement, string[]>} */
  previewUrls = new Map()

  disconnect() {
    this.previewUrls.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)))
    this.previewUrls.clear()
  }

  /** @param {Event} event */
  previewImages(event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    const preview = input.form?.querySelector("[data-image-previews]")
    if (!(preview instanceof HTMLElement)) return
    this.previewUrls.get(input)?.forEach((url) => URL.revokeObjectURL(url))
    const urls = []
    preview.replaceChildren()
    for (const file of Array.from(input.files || [])) {
      const figure = document.createElement("figure")
      figure.className = "exds-comment-image"
      if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
        const image = document.createElement("img")
        image.src = URL.createObjectURL(file)
        image.alt = file.name
        urls.push(image.src)
        figure.append(image)
      }
      const caption = document.createElement("figcaption")
      caption.textContent = file.name
      figure.append(caption)
      preview.append(figure)
    }
    this.previewUrls.set(input, urls)
    preview.hidden = !preview.childElementCount
  }

  /** @param {HTMLTimeElement} element */
  timestampTargetConnected(element) {
    const format = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    element.textContent = format.format(new Date(element.dateTime))
  }

  /** @param {Event} event */
  validate(event) {
    if (!(event.target instanceof HTMLTextAreaElement)) return
    const submit = event.target.form?.querySelector('input[type="submit"]')
    if (submit instanceof HTMLInputElement) submit.disabled = !event.target.value.trim()
  }

  /** @param {KeyboardEvent} event */
  submitShortcut(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && event.target instanceof HTMLTextAreaElement && event.target.value.trim()) {
      event.preventDefault()
      event.target.form?.requestSubmit()
    }
  }

  /** @param {Event} event */
  confirmDelete(event) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    const article = event.currentTarget.closest("article")
    const confirmation = article?.querySelector(".exds-comment-confirm")
    this.close()
    if (confirmation instanceof HTMLElement) {
      confirmation.hidden = false
      confirmation.querySelector("button")?.focus()
    }
  }

  /** @param {Event} event */
  cancelDelete(event) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    const article = event.currentTarget.closest("article")
    this.close()
    article?.querySelector("summary")?.focus()
  }

  close() {
    this.element.querySelectorAll("details[open]").forEach((element) => element.removeAttribute("open"))
    this.element.querySelectorAll(".exds-comment-confirm").forEach((element) => { if (element instanceof HTMLElement) element.hidden = true })
  }

  /** @param {MouseEvent} event */
  outside(event) {
    if (event.target instanceof Element && !event.target.closest(".exds-comment-actions, .exds-comment-confirm")) this.close()
  }
}

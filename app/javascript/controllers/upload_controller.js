import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} StimulusBindings
 * @property {HTMLInputElement} inputTarget
 * @property {HTMLElement} summaryTarget
 * @property {HTMLButtonElement} submitTarget
 * @property {string} failedLabelValue
 * @property {string} processingLabelValue
 * @property {HTMLElement} progressTarget
 * @property {boolean} hasProgressTarget
 * @property {HTMLElement} meterTarget
 * @property {boolean} hasMeterTarget
 * @property {HTMLElement} barTarget
 * @property {boolean} hasBarTarget
 * @property {HTMLElement} percentTarget
 * @property {boolean} hasPercentTarget
 * @property {HTMLElement} dropzoneTarget
 * @property {boolean} hasDropzoneTarget
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLFormElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["input", "summary", "submit", "progress", "meter", "bar", "percent", "dropzone"]
  static values = { failedLabel: String, processingLabel: String }

  dragDepth = 0
  emptyLabel = ""
  submitLabel = ""

  connect() {
    this.dragDepth = 0
    this.emptyLabel = this.summaryTarget.textContent || ""
    this.submitLabel = (this.submitTarget.textContent || "").trim()
    this.submitTarget.disabled = true
    this.updateProgress(0)
  }

  showFiles() {
    const files = Array.from(this.inputTarget.files || [])
    this.submitTarget.disabled = files.length === 0
    this.summaryTarget.textContent = files.length === 0
      ? this.emptyLabel
      : `${files.map((file) => file.name).join(", ")} · ${this.formatBytes(this.totalBytes(files))}`
    this.setSubmitLabel(this.submitLabel)
    this.updateProgress(0)
  }

  /** @param {DragEvent} event */
  dragEnter(event) {
    event.preventDefault()
    this.dragDepth += 1
    this.setDragging(true)
  }

  /** @param {DragEvent} event */
  dragOver(event) {
    event.preventDefault()

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy"
    }
  }

  /** @param {DragEvent} event */
  dragLeave(event) {
    event.preventDefault()
    this.dragDepth = Math.max(this.dragDepth - 1, 0)

    if (this.dragDepth === 0) {
      this.setDragging(false)
    }
  }

  /** @param {DragEvent} event */
  drop(event) {
    event.preventDefault()
    this.dragDepth = 0
    this.setDragging(false)

    const files = this.filesFromDrop(event.dataTransfer)
    if (files.length === 0) return

    this.assignFiles(files)
    this.showFiles()
  }

  /** @param {SubmitEvent} event */
  start(event) {
    const files = Array.from(this.inputTarget.files || [])
    event.preventDefault()
    event.stopImmediatePropagation()

    if (files.length === 0) {
      return
    }

    const formData = new FormData(this.element)
    this.submitTarget.disabled = true
    this.inputTarget.disabled = true
    this.showProgress()
    this.updateProgress(0)

    const request = new XMLHttpRequest()
    request.open(this.element.method.toUpperCase(), this.element.action)
    request.setRequestHeader("Accept", "application/json")
    request.setRequestHeader("X-Requested-With", "XMLHttpRequest")

    request.upload.addEventListener("progress", (progressEvent) => {
      if (progressEvent.lengthComputable) {
        this.updateProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
      }
    })

    request.addEventListener("load", () => this.finish(request))
    request.addEventListener("error", () => this.fail())
    request.addEventListener("abort", () => this.fail())
    request.send(formData)
  }

  /** @param {XMLHttpRequest} request */
  finish(request) {
    const response = this.parseResponse(request)

    if (request.status >= 200 && request.status < 300) {
      this.updateProgress(100)
      this.visit(response.redirect_url || request.responseURL || this.element.action)
    } else {
      this.fail(response.error)
    }
  }

  /** @param {DataTransfer|null} dataTransfer */
  filesFromDrop(dataTransfer) {
    return Array.from(dataTransfer?.files || [])
  }

  /** @param {File[]} files */
  assignFiles(files) {
    const dataTransfer = new DataTransfer()
    files.forEach((file) => dataTransfer.items.add(file))
    this.inputTarget.files = dataTransfer.files
  }

  /** @param {File[]} files */
  totalBytes(files) {
    return files.reduce((sum, file) => sum + file.size, 0)
  }

  /** @param {number} bytes */
  formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(bytes / 1024, 1).toFixed(0)} KB`

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  showProgress() {
    if (this.hasProgressTarget) {
      this.progressTarget.hidden = false
    }
  }

  /** @param {number} percent */
  updateProgress(percent) {
    const boundedPercent = Math.max(0, Math.min(percent, 100))

    if (this.hasBarTarget) {
      this.barTarget.style.width = `${boundedPercent}%`
    }

    if (this.hasMeterTarget) {
      this.meterTarget.setAttribute("aria-valuenow", String(boundedPercent))
    }

    if (this.hasPercentTarget) {
      this.percentTarget.textContent = `${boundedPercent}%`
    }

    if (boundedPercent > 0) {
      this.setSubmitLabel(`${this.processingLabelValue || this.submitLabel} ${boundedPercent}%`)
    }
  }

  /** @param {string} label */
  setSubmitLabel(label) {
    const labelNode = this.submitTarget.querySelector("span:last-child")
    if (labelNode) {
      labelNode.textContent = label
    }
  }

  /** @param {XMLHttpRequest} request @returns {{redirect_url?:string,error?:string}} */
  parseResponse(request) {
    try {
      const response = JSON.parse(request.responseText)
      return response && typeof response === "object" ? {
        redirect_url: typeof response.redirect_url === "string" ? response.redirect_url : undefined,
        error: typeof response.error === "string" ? response.error : undefined
      } : {}
    } catch {
      return {}
    }
  }

  /** @param {string} [error] */
  fail(error) {
    this.inputTarget.disabled = false
    this.submitTarget.disabled = Array.from(this.inputTarget.files || []).length === 0
    this.summaryTarget.textContent = error || this.failedLabelValue
    this.setSubmitLabel(this.submitLabel)
  }

  /** @param {boolean} isDragging */
  setDragging(isDragging) {
    if (this.hasDropzoneTarget) {
      this.dropzoneTarget.classList.toggle("is-dragging", isDragging)
    }
  }

  /** @param {string} url */
  visit(url) {
    if (window.Turbo) {
      window.Turbo.visit(url)
    } else {
      window.location.assign(url)
    }
  }
}

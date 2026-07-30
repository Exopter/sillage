import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input", "summary", "submit", "progress", "meter", "bar", "percent", "dropzone"]
  static values = { failedLabel: String, processingLabel: String }

  connect() {
    this.dragDepth = 0
    this.emptyLabel = this.summaryTarget.textContent
    this.submitLabel = this.submitTarget.textContent.trim()
    this.submitTarget.disabled = true
    this.updateProgress(0)
  }

  showFiles() {
    const files = Array.from(this.inputTarget.files)
    this.submitTarget.disabled = files.length === 0
    this.summaryTarget.textContent = files.length === 0
      ? this.emptyLabel
      : `${files.map((file) => file.name).join(", ")} · ${this.formatBytes(this.totalBytes(files))}`
    this.setSubmitLabel(this.submitLabel)
    this.updateProgress(0)
  }

  dragEnter(event) {
    event.preventDefault()
    this.dragDepth += 1
    this.setDragging(true)
  }

  dragOver(event) {
    event.preventDefault()

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy"
    }
  }

  dragLeave(event) {
    event.preventDefault()
    this.dragDepth = Math.max(this.dragDepth - 1, 0)

    if (this.dragDepth === 0) {
      this.setDragging(false)
    }
  }

  drop(event) {
    event.preventDefault()
    this.dragDepth = 0
    this.setDragging(false)

    const files = this.filesFromDrop(event.dataTransfer)
    if (files.length === 0) return

    this.assignFiles(files)
    this.showFiles()
  }

  start(event) {
    const files = Array.from(this.inputTarget.files)
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

  finish(request) {
    const response = this.parseResponse(request)

    if (request.status >= 200 && request.status < 300) {
      this.updateProgress(100)
      this.visit(response.redirect_url || request.responseURL || this.element.action)
    } else {
      this.fail(response.error)
    }
  }

  filesFromDrop(dataTransfer) {
    return Array.from(dataTransfer?.files || [])
  }

  assignFiles(files) {
    const dataTransfer = new DataTransfer()
    files.forEach((file) => dataTransfer.items.add(file))
    this.inputTarget.files = dataTransfer.files
  }

  totalBytes(files) {
    return files.reduce((sum, file) => sum + file.size, 0)
  }

  formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(bytes / 1024, 1).toFixed(0)} KB`

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  showProgress() {
    if (this.hasProgressTarget) {
      this.progressTarget.hidden = false
    }
  }

  updateProgress(percent) {
    const boundedPercent = Math.max(0, Math.min(percent, 100))

    if (this.hasBarTarget) {
      this.barTarget.style.width = `${boundedPercent}%`
    }

    if (this.hasMeterTarget) {
      this.meterTarget.setAttribute("aria-valuenow", boundedPercent)
    }

    if (this.hasPercentTarget) {
      this.percentTarget.textContent = `${boundedPercent}%`
    }

    if (boundedPercent > 0) {
      this.setSubmitLabel(`${this.processingLabelValue || this.submitLabel} ${boundedPercent}%`)
    }
  }

  setSubmitLabel(label) {
    const labelNode = this.submitTarget.querySelector("span:last-child")
    if (labelNode) {
      labelNode.textContent = label
    }
  }

  parseResponse(request) {
    try {
      return JSON.parse(request.responseText)
    } catch {
      return {}
    }
  }

  fail(error) {
    this.inputTarget.disabled = false
    this.submitTarget.disabled = Array.from(this.inputTarget.files).length === 0
    this.summaryTarget.textContent = error || this.failedLabelValue
    this.setSubmitLabel(this.submitLabel)
  }

  setDragging(isDragging) {
    if (this.hasDropzoneTarget) {
      this.dropzoneTarget.classList.toggle("is-dragging", isDragging)
    }
  }

  visit(url) {
    if (window.Turbo) {
      window.Turbo.visit(url)
    } else {
      window.location.assign(url)
    }
  }
}

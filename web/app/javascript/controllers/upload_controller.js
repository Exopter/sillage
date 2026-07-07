import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input", "summary", "submit"]
  static values = { processingLabel: String }

  connect() {
    this.emptyLabel = this.summaryTarget.textContent
    this.submitLabel = this.submitTarget.textContent.trim()
    this.submitTarget.disabled = true
  }

  showFiles() {
    const files = Array.from(this.inputTarget.files)
    this.submitTarget.disabled = files.length === 0
    this.summaryTarget.textContent = files.length === 0
      ? this.emptyLabel
      : `${files.map((file) => file.name).join(", ")} · ${this.formatBytes(this.totalBytes(files))}`
    this.setSubmitLabel(this.submitLabel)
  }

  start(event) {
    const files = Array.from(this.inputTarget.files)
    if (files.length === 0) {
      event.preventDefault()
      return
    }

    this.submitTarget.disabled = true
    this.setSubmitLabel(this.processingLabelValue || this.submitLabel)
  }

  totalBytes(files) {
    return files.reduce((sum, file) => sum + file.size, 0)
  }

  formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(bytes / 1024, 1).toFixed(0)} KB`

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  setSubmitLabel(label) {
    const labelNode = this.submitTarget.querySelector("span:last-child")
    if (labelNode) {
      labelNode.textContent = label
    }
  }
}

import { Controller } from "@hotwired/stimulus"
import { SignalRadioLink } from "signal_radio_link"
import { registerUsbPageRelease } from "usb_page_lifecycle"

/** @typedef {{buttonTarget: HTMLButtonElement, labelTarget: HTMLElement, detailTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["button", "label", "detail"]
  link = new SignalRadioLink(() => this.render())
  /** @type {number|undefined} */ timer = undefined
  /** @type {(() => void)|null} */ unregister = null
  active = false
  resubmitting = false
  submitting = false
  connectedRadio = () => { if (this.active) void this.link.connect() }
  pageHide = () => { void this.link.close() }
  /** @param {SubmitEvent} event */
  submit = (event) => {
    if (this.resubmitting || !(event.target instanceof HTMLFormElement) || !event.target.closest(".signal-home")) return
    if (!this.link.port && !this.link.busy) return
    event.preventDefault()
    if (this.submitting) return
    this.submitting = true
    const form = event.target, submitter = event.submitter
    void this.link.close().then(() => {
      if (!this.active) return
      this.resubmitting = true
      try { form.requestSubmit(submitter) } finally { this.resubmitting = false; this.submitting = false }
    })
  }

  connect() {
    this.active = true
    this.unregister = registerUsbPageRelease(() => this.link.close())
    navigator.serial?.addEventListener("connect", this.connectedRadio)
    window.addEventListener("pagehide", this.pageHide)
    document.addEventListener("submit", this.submit, true)
    this.timer = window.setInterval(() => this.render(), 250)
    this.render()
    void this.link.connect()
  }

  disconnect() {
    this.active = false
    this.unregister?.(); this.unregister = null
    navigator.serial?.removeEventListener("connect", this.connectedRadio)
    window.removeEventListener("pagehide", this.pageHide)
    document.removeEventListener("submit", this.submit, true)
    window.clearInterval(this.timer)
    void this.link.close()
  }

  toggle() {
    if (this.link.connected) void this.link.close()
    else void this.link.connect(true)
  }

  render() {
    if (!this.active) return
    const status = this.link.readiness.snapshot(Date.now(), this.link.connected)
    this.element.dataset.state = this.link.error ? "degraded" : status.state
    this.labelTarget.textContent = this.link.error === "Radio in use in another tab" ? "Radio in use" : this.link.error ? "Radio unavailable" : status.label
    this.detailTarget.textContent = this.link.error || status.detail
    this.detailTarget.title = this.detailTarget.textContent
    this.buttonTarget.disabled = this.link.busy || !navigator.serial
    this.buttonTarget.textContent = this.link.closing ? "Disconnecting…" : this.link.busy ? "Connecting…" : this.link.connected ? "Disconnect radio" : "Connect radio"
    this.buttonTarget.setAttribute("aria-busy", String(this.link.busy))
  }
}

import { Controller } from "@hotwired/stimulus"
import { SignalRadioLink, resolveRadioIdentity } from "signal_radio_link"
import { registerUsbPageRelease } from "usb_page_lifecycle"

/** @typedef {{buttonTarget: HTMLButtonElement, labelTarget: HTMLElement, detailTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["button", "label", "detail"]
  link = new SignalRadioLink(() => this.render())
  /** @type {number|undefined} */ timer = undefined
  /** @type {(() => void)|null} */ unregister = null
  /** @type {import("../lib/signal_radio_link").RadioIdentity|null} */ identity = null
  identityKey = ""
  identityCheckedAt = 0
  /** @type {symbol|null} */ identityRequest = null
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
    this.identityRequest = null
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

  /** @param {string} key @param {string} deviceId */
  async loadIdentity(key, deviceId) {
    if (this.identityKey !== key) this.identity = null
    this.identityKey = key
    const request = this.identityRequest = Symbol("radio-identity")
    const current = () => this.active && this.identityRequest === request &&
      `${this.link.generation}/${this.link.readiness.deviceId}` === key
    try {
      const identity = await resolveRadioIdentity(deviceId)
      if (current()) this.identity = identity
    } catch {
      if (current()) this.identity = null
    } finally {
      if (this.identityRequest === request) {
        this.identityRequest = null
        this.identityCheckedAt = Date.now()
        this.render()
      }
    }
  }

  render() {
    if (!this.active) return
    const now = Date.now(), deviceId = this.link.readiness.deviceId
    const key = `${this.link.generation}/${deviceId}`
    if (this.link.connected && deviceId && (key !== this.identityKey || (!this.identityRequest && now - this.identityCheckedAt > 30000)))
      void this.loadIdentity(key, deviceId)
    const status = this.link.readiness.snapshot(now, this.link.connected, this.identity)
    this.element.dataset.state = this.link.error ? "degraded" : status.state
    this.labelTarget.textContent = this.link.error === "Radio in use in another tab" ? "Radio in use" : this.link.error ? "Radio unavailable" : status.label
    this.labelTarget.title = this.labelTarget.textContent
    this.detailTarget.textContent = this.link.error || (status.state === "connected" && deviceId && !this.identity && !this.identityRequest ? "Radio ready · Aircraft identity unavailable" : status.detail)
    this.detailTarget.title = this.detailTarget.textContent
    this.buttonTarget.disabled = this.link.busy || !navigator.serial
    this.buttonTarget.textContent = this.link.closing ? "Disconnecting…" : this.link.busy ? "Connecting…" : this.link.connected ? "Disconnect radio" : "Connect radio"
    this.buttonTarget.setAttribute("aria-busy", String(this.link.busy))
  }
}

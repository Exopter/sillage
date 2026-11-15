import { Controller } from "@hotwired/stimulus"
import { SignalRadioLink, resolveRadioIdentity } from "signal_radio_link"
import { registerUsbPageRelease } from "usb_page_lifecycle"

/** @typedef {{buttonTarget: HTMLButtonElement, labelTarget: HTMLElement, detailTarget: HTMLElement,
 * assignButtonTarget: HTMLButtonElement, assignmentDialogTarget: HTMLDialogElement, assignmentFormTarget: HTMLFormElement,
 * assignmentDeviceTarget: HTMLInputElement, assignmentModeTarget: HTMLSelectElement,
 * existingAssemblyTarget: HTMLFieldSetElement, newAssemblyTarget: HTMLFieldSetElement, assignmentErrorTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["button", "label", "detail", "assignButton", "assignmentDialog", "assignmentForm", "assignmentDevice", "assignmentMode", "existingAssembly", "newAssembly", "assignmentError"]
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
  assigning = false
  assignmentKey = ""
  connectedRadio = () => { if (this.active) void this.link.connect() }
  pageHide = () => { void this.link.close() }
  /** @param {SubmitEvent} event */
  submit = (event) => {
    if (this.resubmitting || !(event.target instanceof HTMLFormElement) || !event.target.closest(".signal-home")) return
    if (event.target.matches("[data-signal-acquisition-form]")) {
      if (!this.canAcquire()) {
        event.preventDefault()
        this.detailTarget.textContent = "Assign the connected recorder to an assembly before starting acquisition."
        return
      }
      const device = event.target.querySelector("input[name='device_id']")
      if (device instanceof HTMLInputElement) device.value = this.link.readiness.deviceId
    }
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

  canAcquire() {
    const deviceId = this.link.readiness.deviceId
    const state = this.link.readiness.snapshot(Date.now(), this.link.connected).state
    return !this.link.error && !this.assigning && ["connected", "degraded"].includes(state) &&
      this.identity?.deviceId === deviceId && this.identity?.canAcquire === true &&
      this.identityKey === `${this.link.generation}/${deviceId}`
  }

  openAssignment() {
    const deviceId = this.link.readiness.deviceId
    const state = this.link.readiness.snapshot(Date.now(), this.link.connected).state
    if (!deviceId || !["connected", "degraded"].includes(state) || this.identity?.assemblyId) return
    this.assignmentKey = `${this.link.generation}/${deviceId}`
    this.assignmentDeviceTarget.value = deviceId
    this.assignmentErrorTarget.hidden = true
    this.changeAssignmentMode()
    this.assignmentDialogTarget.showModal()
  }

  closeAssignment() { if (!this.assigning) this.assignmentDialogTarget.close() }

  changeAssignmentMode() {
    const creating = this.assignmentModeTarget.value === "new"
    this.existingAssemblyTarget.hidden = creating
    this.existingAssemblyTarget.disabled = creating
    this.newAssemblyTarget.hidden = !creating
    this.newAssemblyTarget.disabled = !creating
  }

  /** @param {SubmitEvent} event */
  async assignRecorder(event) {
    event.preventDefault()
    if (this.assigning || !this.assignmentFormTarget.reportValidity()) return
    const deviceId = this.link.readiness.deviceId
    const key = `${this.link.generation}/${deviceId}`
    const state = this.link.readiness.snapshot(Date.now(), this.link.connected).state
    this.assignmentErrorTarget.hidden = true
    if (key !== this.assignmentKey || deviceId !== this.assignmentDeviceTarget.value || !["connected", "degraded"].includes(state)) {
      this.assignmentErrorTarget.textContent = "The radio connection changed. Close this dialog and identify the recorder again."
      this.assignmentErrorTarget.hidden = false
      return
    }
    const body = Object.fromEntries(new FormData(this.assignmentFormTarget))
    const buttons = Array.from(this.assignmentDialogTarget.querySelectorAll("[data-signal-assignment-submit]")).map(button => ({button: /** @type {HTMLButtonElement} */ (button), disabled: button.hasAttribute("disabled")}))
    this.assigning = true
    for (const {button} of buttons) button.disabled = true
    this.render()
    try {
      const response = await fetch("/api/v1/signal-recorder-assignment", {method: "POST", credentials: "same-origin", cache: "no-store",
        signal: AbortSignal.timeout(10000), headers: {"Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || ""}, body: JSON.stringify(body)})
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Recorder assignment failed.")
      if (!this.active || key !== `${this.link.generation}/${this.link.readiness.deviceId}`) return
      await this.loadIdentity(key, deviceId)
      if (!this.identity?.canAcquire) throw new Error("Assignment saved. Refresh the recorder identity before starting acquisition.")
      this.assignmentDialogTarget.close()
    } catch (error) {
      if (this.active) { this.assignmentErrorTarget.textContent = error instanceof Error ? error.message : String(error); this.assignmentErrorTarget.hidden = false }
    } finally {
      this.assigning = false
      for (const {button, disabled} of buttons) button.disabled = disabled
      this.render()
    }
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
    this.assignButtonTarget.hidden = !deviceId || this.identity?.assemblyId != null
    this.assignButtonTarget.disabled = this.assigning || !["connected", "degraded"].includes(status.state) || this.identityRequest != null
    const allowed = this.canAcquire()
    for (const button of document.querySelectorAll("[data-signal-acquisition]")) if (button instanceof HTMLButtonElement) button.disabled = !allowed
    for (const input of document.querySelectorAll("[data-signal-acquisition-form] input[name='device_id']")) if (input instanceof HTMLInputElement) input.value = allowed ? deviceId : ""
    const notice = document.querySelector("[data-signal-acquisition-notice]")
    if (notice) { notice.textContent = allowed ? "Recorder assigned to an assembly. Acquisition is available." : "Connect and assign the recorder to an assembly to enable acquisition." }

  }
}

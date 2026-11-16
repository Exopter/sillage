import { Controller } from "@hotwired/stimulus"

/** @typedef {{noticeTarget: HTMLElement, textTarget: HTMLElement, dialogTarget: HTMLDialogElement, formTarget: HTMLFormElement,
 * deviceTarget: HTMLInputElement, modeTarget: HTMLSelectElement, existingAssemblyTarget: HTMLFieldSetElement,
 * newAssemblyTarget: HTMLFieldSetElement, errorTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// A recorder heard in standby that Hangar does not know yet can be added from
// here. This never stands in the way of a recording.
export default class extends TypedController {
  static targets = ["notice", "text", "dialog", "form", "device", "mode", "existingAssembly", "newAssembly", "error"]
  deviceId = ""
  assigning = false

  /** @param {CustomEvent<{live: boolean, deviceId: string, identified: boolean, assemblyId: number|null}>} event */
  standby(event) {
    const { live, deviceId, identified, assemblyId } = event.detail
    const unknown = live && Boolean(deviceId) && identified && assemblyId == null
    this.deviceId = unknown ? deviceId : ""
    this.noticeTarget.hidden = !unknown
    if (unknown) this.textTarget.textContent = `Recorder ${deviceId} is not in Hangar yet. You can record now and add it later.`
  }

  open() {
    if (!this.deviceId) return
    this.deviceTarget.value = this.deviceId
    this.errorTarget.hidden = true
    this.changeMode()
    this.dialogTarget.showModal()
  }

  close() { if (!this.assigning) this.dialogTarget.close() }

  changeMode() {
    const creating = this.modeTarget.value === "new"
    this.existingAssemblyTarget.hidden = creating
    this.existingAssemblyTarget.disabled = creating
    this.newAssemblyTarget.hidden = !creating
    this.newAssemblyTarget.disabled = !creating
  }

  /** @param {SubmitEvent} event */
  async assign(event) {
    event.preventDefault()
    if (this.assigning || !this.formTarget.reportValidity()) return
    this.errorTarget.hidden = true
    if (!this.deviceId || this.deviceId !== this.deviceTarget.value) {
      this.errorTarget.textContent = "The aircraft heard on the link changed. Close this dialog and try again."
      this.errorTarget.hidden = false
      return
    }
    const buttons = Array.from(this.dialogTarget.querySelectorAll("[data-signal-assignment-submit]")).map(button => ({button: /** @type {HTMLButtonElement} */ (button), disabled: button.hasAttribute("disabled")}))
    this.assigning = true
    for (const {button} of buttons) button.disabled = true
    try {
      const response = await fetch("/api/v1/signal-recorder-assignment", {method: "POST", credentials: "same-origin", cache: "no-store",
        signal: AbortSignal.timeout(10000), headers: {"Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || ""},
        body: JSON.stringify(Object.fromEntries(new FormData(this.formTarget)))})
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "The recorder could not be added.")
      this.noticeTarget.hidden = true
      this.dialogTarget.close()
      window.dispatchEvent(new CustomEvent("sillage:signal-identity-changed"))
    } catch (error) {
      this.errorTarget.textContent = error instanceof Error ? error.message : String(error)
      this.errorTarget.hidden = false
    } finally {
      this.assigning = false
      for (const {button, disabled} of buttons) button.disabled = disabled
    }
  }
}

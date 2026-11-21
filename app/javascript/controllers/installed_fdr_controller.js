import { Controller } from "@hotwired/stimulus"

/** @typedef {{aircraftTarget: HTMLSelectElement, fdrTarget: HTMLInputElement, installedValue: Record<string, string>, recordedValue: {aircraft: string, fdr: string}}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// The FDR of a flight is never chosen: it is the one installed in the selected
// aircraft. A saved flight keeps its recorded FDR while its aircraft is unchanged.
export default class extends TypedController {
  static targets = ["aircraft", "fdr"]
  static values = { installed: Object, recorded: Object }

  show() {
    const aircraft = this.aircraftTarget.value
    const recorded = aircraft === this.recordedValue.aircraft ? this.recordedValue.fdr : ""
    this.fdrTarget.value = recorded || this.installedValue[aircraft] || ""
    this.fdrTarget.placeholder = aircraft ? "No FDR installed" : "Select an aircraft"
  }
}

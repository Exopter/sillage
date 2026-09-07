import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} StimulusBindings
 * @property {boolean} hasTypeTarget
 * @property {HTMLSelectElement} typeTarget
 * @property {HTMLFieldSetElement} parametersTarget
 * @property {HTMLInputElement[]} configurationTargets
 * @property {HTMLSelectElement} methodTarget
 * @property {HTMLElement} previewTarget
 * @property {HTMLInputElement} submitTarget
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["type", "parameters", "configuration", "method", "preview", "submit"]

  connect() {
    this.update()
  }

  update() {
    if (!this.hasTypeTarget) return
    const selected = this.typeTarget.value === "ExoFDR"
    this.parametersTarget.hidden = !selected
    this.parametersTarget.disabled = !selected
    const version = this.configurationTargets.find(input => input.checked)?.dataset.version
    const method = this.methodTarget.value
    this.submitTarget.disabled = !(selected && version && method)
    this.previewTarget.textContent = version && method
      ? `Name / serial number: EXOFDR-${version}-${method}-… The next number is assigned on creation.`
      : "The name and serial number are generated on creation."
  }
}

import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} StimulusBindings
 * @property {boolean} hasTypeTarget
 * @property {boolean} hasConfigurationSelectTarget
 * @property {boolean} hasIdentityTarget
 * @property {boolean} hasParametersTarget
 * @property {HTMLSelectElement} configurationSelectTarget
 * @property {HTMLSelectElement} typeTarget
 * @property {HTMLFieldSetElement} parametersTarget
 * @property {HTMLFieldSetElement} identityTarget
 * @property {HTMLInputElement[]} configurationTargets
 * @property {HTMLSelectElement} methodTarget
 * @property {HTMLSelectElement} componentTarget
 * @property {HTMLElement} previewTarget
 * @property {HTMLInputElement} submitTarget
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["type", "parameters", "identity", "configuration", "configurationSelect", "method", "component", "preview", "submit"]

  connect() {
    this.update()
  }

  update() {
    if (!this.hasTypeTarget && !this.hasConfigurationSelectTarget) return
    const selected = !this.hasTypeTarget || this.typeTarget.value === "ExoFDR"
    if (this.hasParametersTarget) {
      this.parametersTarget.hidden = !selected
      this.parametersTarget.disabled = !selected
    }
    const generic = this.hasTypeTarget && ["Parachute", "Exowing"].includes(this.typeTarget.value)
    if (this.hasIdentityTarget) {
      this.identityTarget.hidden = !generic
      this.identityTarget.disabled = !generic
    }
    const version = this.hasConfigurationSelectTarget
      ? this.configurationSelectTarget.selectedOptions[0]?.dataset.version
      : this.configurationTargets.find(input => input.checked)?.dataset.version
    const typed = Number(version?.slice(1)) >= 2
    const methodField = this.methodTarget.closest("label")
    const componentField = this.componentTarget.closest("label")
    if (methodField) methodField.hidden = typed
    if (componentField) componentField.hidden = !typed
    this.methodTarget.disabled = typed || !selected
    this.methodTarget.required = !typed && selected
    this.componentTarget.disabled = !typed || !selected
    this.componentTarget.required = typed && selected
    const discriminator = typed ? this.componentTarget.value : this.methodTarget.value
    this.submitTarget.disabled = !(generic || (selected && version && discriminator))
    this.previewTarget.textContent = version && discriminator
      ? `Name / serial number: EXOFDR-${version}-${discriminator}-… The next number is assigned on creation.`
      : "The name and serial number are generated on creation."
  }
}

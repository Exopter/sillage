import { Controller } from "@hotwired/stimulus"

/** @typedef {{visibilityTarget: HTMLSelectElement, membersTarget: HTMLFieldSetElement, descriptionTarget: HTMLElement}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["visibility", "members", "description"]
  connect() { this.update() }
  update() {
    const value = this.visibilityTarget.value
    this.membersTarget.hidden = value === "private"
    this.descriptionTarget.textContent = value === "public" ? "Everyone signed in to Sillage can view this folder. Members can contribute their own flights." :
      value === "shared" ? "Only you and the selected members can view this folder and its flights." : "Only you can view this folder. Flight owners always keep access to their own flights."
  }
}

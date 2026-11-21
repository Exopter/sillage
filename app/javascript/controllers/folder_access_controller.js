import { Controller } from "@hotwired/stimulus"

/** @typedef {{visibilityTarget: HTMLSelectElement, membersTarget: HTMLFieldSetElement, descriptionTarget: HTMLElement, sharedValue: boolean}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["visibility", "members", "description"]
  // True when the person editing reached the folder through sharing and did not create it.
  static values = { shared: Boolean }
  connect() { this.update() }
  update() {
    const value = this.visibilityTarget.value
    this.membersTarget.hidden = value === "private"
    this.descriptionTarget.textContent = value === "public" ? "Everyone signed in to Sillage can view this folder. Members can contribute their own flights." :
      value === "club" ? "Every Flight Club member can view this folder and its flights, including members who join later. Selected members can add their own flights." :
      value === "shared" ? (this.sharedValue ? "Only the folder's creator and the selected members can view this folder and its flights." : "Only you and the selected members can view this folder and its flights.") :
      this.sharedValue ? "Only the folder's creator can view this folder: you will lose access to it. Flight owners always keep access to their own flights." :
      "Only you can view this folder. Flight owners always keep access to their own flights."
  }
}

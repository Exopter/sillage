import { Controller } from "@hotwired/stimulus"

/** @extends {Controller<HTMLFormElement>} */
export default class extends Controller {
  submit() {
    this.element.requestSubmit()
  }
}

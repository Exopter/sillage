import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() { if (this.element instanceof HTMLDialogElement) this.element.showModal() }
  close() { if (this.element instanceof HTMLDialogElement) this.element.close() }
}

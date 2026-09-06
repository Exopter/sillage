import { Controller } from "@hotwired/stimulus"
import { aircraftConnectionLabel, currentAircraftConnections } from "aircraft_connection"

const TRANSPORT_LABELS = {
  "usb-c": "USB-C",
  ble: "Bluetooth",
  wifi: "Wi-Fi",
  "ground-radio": "ground radio"
}

/**
 * @typedef {Object} StimulusBindings
 * @property {HTMLElement} labelTarget
 * @property {HTMLElement[]} iconTargets
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["label", "icon"]

  connect() {
    this.render(currentAircraftConnections())
  }

  /** @param {CustomEvent<{connections?: import("aircraft_connection").AircraftConnection[]}>} event */
  update(event) {
    this.render(event.detail?.connections || [])
  }

  /** @param {import("aircraft_connection").AircraftConnection[]} connections */
  render(connections) {
    const transports = connections.map((connection) => connection.transport)
    const active = new Set(transports)
    const connected = active.size > 0
    this.element.dataset.aircraftConnectionState = connected ? "connected" : "disconnected"
    this.labelTarget.textContent = aircraftConnectionLabel(connections)
    this.iconTargets.forEach((icon) => {
      icon.hidden = !transports.some((transport) => transport === icon.dataset.aircraftConnectionTransport)
    })

    const labels = transports.map((transport) => TRANSPORT_LABELS[transport]).filter(Boolean)
    this.element.setAttribute(
      "aria-label",
      connected ? `${aircraftConnectionLabel(connections)} via ${labels.join(", ")}` : "No aircraft connected"
    )
  }
}

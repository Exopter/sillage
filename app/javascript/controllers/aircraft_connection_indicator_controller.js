import { Controller } from "@hotwired/stimulus"
import { aircraftConnectionLabel, currentAircraftConnections } from "aircraft_connection"

const TRANSPORT_LABELS = {
  "usb-c": "USB-C",
  ble: "Bluetooth Low Energy",
  wifi: "Wi-Fi",
  "ground-radio": "ground radio"
}

export default class extends Controller {
  static targets = ["label", "icon"]

  connect() {
    this.render(currentAircraftConnections())
  }

  update(event) {
    this.render(event.detail?.connections || [])
  }

  render(connections) {
    const transports = connections.map((connection) => connection.transport)
    const active = new Set(transports)
    const connected = active.size > 0
    this.element.dataset.aircraftConnectionState = connected ? "connected" : "disconnected"
    this.labelTarget.textContent = aircraftConnectionLabel(connections)
    this.iconTargets.forEach((icon) => {
      icon.hidden = !active.has(icon.dataset.aircraftConnectionTransport)
    })

    const labels = transports.map((transport) => TRANSPORT_LABELS[transport]).filter(Boolean)
    this.element.setAttribute(
      "aria-label",
      connected ? `${aircraftConnectionLabel(connections)} via ${labels.join(", ")}` : "No aircraft connected"
    )
  }
}

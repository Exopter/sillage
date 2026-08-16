export const AircraftConnectionTransport = Object.freeze({
  USB_C: "usb-c",
  BLE: "ble",
  WIFI: "wifi",
  GROUND_RADIO: "ground-radio"
})

const supportedTransports = Object.values(AircraftConnectionTransport)
const activeConnections = new Map()

export function currentAircraftConnections() {
  return supportedTransports
    .filter((transport) => activeConnections.has(transport))
    .map((transport) => ({ transport, ...activeConnections.get(transport) }))
}

export function setAircraftConnection(transport, connected, identity = {}) {
  if (!supportedTransports.includes(transport)) return

  if (connected) {
    const deviceIds = uniqueValues(identity.deviceIds || [identity.deviceId])
    activeConnections.set(transport, {
      deviceId: deviceIds.length === 1 ? deviceIds[0] : null,
      deviceIds,
      aircraftRegistration: identity.aircraftRegistration || null
    })
  } else {
    activeConnections.delete(transport)
  }

  window.dispatchEvent(new CustomEvent("sillage:aircraft-connection", {
    detail: { connections: currentAircraftConnections() }
  }))
}

export function aircraftConnectionLabel(connections) {
  if (!connections.length) return "No aircraft connected"

  const recorders = uniqueValues(connections.flatMap((connection) => connection.deviceIds || [connection.deviceId]))
  if (recorders.length > 1) return "Multiple recorders connected"

  const aircraft = uniqueValues(connections.map((connection) => connection.aircraftRegistration))
  if (aircraft.length === 1) return `${aircraft[0]} connected`
  if (recorders.length === 1) return `${recorders[0]} connected`

  return "Connected"
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))]
}

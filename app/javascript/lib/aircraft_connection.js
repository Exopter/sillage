export const AircraftConnectionTransport = Object.freeze({
  USB_C: "usb-c",
  BLE: "ble",
  WIFI: "wifi",
  GROUND_RADIO: "ground-radio"
})

/** @typedef {"usb-c" | "ble" | "wifi" | "ground-radio"} AircraftConnectionTransportValue */
/**
 * @typedef {Object} AircraftConnectionIdentity
 * @property {string | null | undefined} [aircraftRegistration]
 * @property {string | null | undefined} [deviceId]
 * @property {Array<string | null | undefined>} [deviceIds]
 * @property {string | null} [recorderLabel]
 */
/**
 * @typedef {Object} AircraftConnection
 * @property {string | null} aircraftRegistration
 * @property {string | null} deviceId
 * @property {string[]} deviceIds
 * @property {string | null} recorderLabel
 * @property {AircraftConnectionTransportValue} transport
 */

/** @type {AircraftConnectionTransportValue[]} */
const supportedTransports = Object.values(AircraftConnectionTransport)
/** @type {Map<AircraftConnectionTransportValue, Omit<AircraftConnection, "transport">>} */
const activeConnections = new Map()

/** @returns {AircraftConnection[]} */
export function currentAircraftConnections() {
  return supportedTransports
    .flatMap((transport) => {
      const connection = activeConnections.get(transport)
      return connection ? [{ transport, ...connection }] : []
    })
}

/**
 * @param {AircraftConnectionTransportValue} transport
 * @param {boolean} connected
 * @param {AircraftConnectionIdentity} [identity]
 */
export function setAircraftConnection(transport, connected, identity = {}) {
  if (!supportedTransports.includes(transport)) return

  if (connected) {
    const deviceIds = uniqueValues(identity.deviceIds || [identity.deviceId])
    const connection = {
      deviceId: deviceIds.length === 1 ? (deviceIds[0] || null) : null,
      deviceIds,
      recorderLabel: identity.recorderLabel || null,
      aircraftRegistration: identity.aircraftRegistration || null
    }
    const previous = activeConnections.get(transport)
    if (previous && previous.recorderLabel === connection.recorderLabel &&
        previous.aircraftRegistration === connection.aircraftRegistration &&
        previous.deviceIds.length === connection.deviceIds.length &&
        previous.deviceIds.every((deviceId, index) => deviceId === connection.deviceIds[index])) return
    activeConnections.set(transport, connection)
  } else {
    if (!activeConnections.delete(transport)) return
  }

  window.dispatchEvent(new CustomEvent("sillage:aircraft-connection", {
    detail: { connections: currentAircraftConnections() }
  }))
}

/** @param {AircraftConnection[]} connections */
export function aircraftConnectionLabel(connections) {
  if (!connections.length) return "No recorder connected"

  const recorders = uniqueValues(connections.flatMap((connection) => connection.deviceIds || [connection.deviceId]))
  if (recorders.length > 1) return "Multiple recorders connected"

  const labels = uniqueValues(connections.map((connection) => connection.recorderLabel))
  if (labels.length > 1) return "Recorder identity mismatch"
  if (labels.length === 1) return `${labels[0]} connected`
  if (recorders.length === 1) return "Recorder connected · identity unavailable"

  return "Connected"
}

/** @param {AircraftConnection[]} connections */
export function aircraftConnectionDetails(connections) {
  return uniqueValues(connections.flatMap((connection) => [
    ...(connection.deviceIds || [connection.deviceId]), connection.aircraftRegistration
  ])).join(" · ")
}

/**
 * @param {Array<string | null | undefined>} values
 * @returns {string[]}
 */
function uniqueValues(values) {
  const presentValues = []
  for (const value of values) {
    if (typeof value === "string" && value !== "") presentValues.push(value)
  }
  return [...new Set(presentValues)]
}

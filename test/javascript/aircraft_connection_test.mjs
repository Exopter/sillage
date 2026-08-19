import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("../../app/javascript/lib/aircraft_connection.js", import.meta.url), "utf8")
const indicatorSource = await readFile(new URL("../../app/javascript/controllers/aircraft_connection_indicator_controller.js", import.meta.url), "utf8")
const connection = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

assert.match(indicatorSource, /ble: "Bluetooth"/)
assert.doesNotMatch(indicatorSource, /Bluetooth Low Energy/)

globalThis.window = { dispatchEvent() {} }
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options) {
    this.type = type
    this.detail = options.detail
  }
}

assert.equal(connection.aircraftConnectionLabel([]), "No aircraft connected")
assert.equal(connection.aircraftConnectionLabel([
  { transport: "usb-c", deviceId: "EXOFDR-A172E0", aircraftRegistration: null }
]), "EXOFDR-A172E0 connected")
assert.equal(connection.aircraftConnectionLabel([
  { transport: "usb-c", deviceId: "EXOFDR-A172E0", aircraftRegistration: "F-GOCC" },
  { transport: "ble", deviceId: "EXOFDR-A172E0", aircraftRegistration: "F-GOCC" },
  { transport: "wifi", deviceId: "EXOFDR-A172E0", aircraftRegistration: "F-GOCC" }
]), "F-GOCC connected")
assert.equal(connection.aircraftConnectionLabel([
  { transport: "usb-c", deviceId: "EXOFDR-A172E0", aircraftRegistration: "F-GOCC" },
  { transport: "ble", deviceId: "EXOFDR-ABC123", aircraftRegistration: null }
]), "Multiple recorders connected")
assert.equal(connection.aircraftConnectionLabel([
  { transport: "wifi", deviceIds: ["EXOFDR-A172E0", "EXOFDR-ABC123"], aircraftRegistration: null }
]), "Multiple recorders connected")

connection.setAircraftConnection(connection.AircraftConnectionTransport.WIFI, true, {
  deviceIds: ["EXOFDR-A172E0", "EXOFDR-ABC123"]
})
assert.deepEqual(connection.currentAircraftConnections(), [{
  transport: "wifi",
  deviceId: null,
  deviceIds: ["EXOFDR-A172E0", "EXOFDR-ABC123"],
  aircraftRegistration: null
}])
connection.setAircraftConnection(connection.AircraftConnectionTransport.WIFI, false)

console.log("Aircraft connection identity tests passed")

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("../../app/javascript/lib/aircraft_connection.js", import.meta.url), "utf8")
const connection = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

globalThis.window = { dispatchEvent() {} }
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options) {
    this.type = type
    this.detail = options.detail
  }
}

assert.equal(connection.aircraftConnectionLabel([]), "No recorder connected")
assert.equal(connection.aircraftConnectionLabel([
  { transport: "usb-c", deviceId: "ECU-A172E0", aircraftRegistration: null }
]), "Recorder connected · identity unavailable")
assert.equal(connection.aircraftConnectionLabel([
  { transport: "usb-c", deviceId: "ECU-A172E0", recorderLabel: "EXOFDR-V0-PERF-03", aircraftRegistration: "F-GOCC" },
  { transport: "ble", deviceId: "ECU-A172E0", recorderLabel: "EXOFDR-V0-PERF-03", aircraftRegistration: "F-GOCC" },
  { transport: "wifi", deviceId: "ECU-A172E0", recorderLabel: "EXOFDR-V0-PERF-03", aircraftRegistration: "F-GOCC" }
]), "EXOFDR-V0-PERF-03 connected")
assert.equal(connection.aircraftConnectionLabel([{transport: "usb-c", deviceId: "ECU-A172E0", recorderLabel: "Unassigned ECU"}]), "Unassigned ECU connected")
assert.equal(connection.aircraftConnectionDetails([{transport: "usb-c", deviceId: "ECU-A172E0", aircraftRegistration: "F-GOCC"}]), "ECU-A172E0 · F-GOCC")
assert.equal(connection.aircraftConnectionLabel([
  { transport: "usb-c", deviceId: "ECU-A172E0", aircraftRegistration: "F-GOCC" },
  { transport: "ble", deviceId: "ECU-ABC123", aircraftRegistration: null }
]), "Multiple recorders connected")
assert.equal(connection.aircraftConnectionLabel([
  { transport: "wifi", deviceIds: ["ECU-A172E0", "ECU-ABC123"], aircraftRegistration: null }
]), "Multiple recorders connected")

connection.setAircraftConnection(connection.AircraftConnectionTransport.WIFI, true, {
  deviceIds: ["ECU-A172E0", "ECU-ABC123"]
})
assert.deepEqual(connection.currentAircraftConnections(), [{
  transport: "wifi",
  deviceId: null,
  deviceIds: ["ECU-A172E0", "ECU-ABC123"],
  recorderLabel: null,
  aircraftRegistration: null
}])
connection.setAircraftConnection(connection.AircraftConnectionTransport.WIFI, false)

console.log("Aircraft connection identity tests passed")

connection.observeRecorderConnection("usb-c", {deviceId:"ECU-E072A1F81D84",firmware:"fdr_integrated/57"}, 1000)
connection.observeRecorderConnection("ble", {deviceId:"ECU-E072A1FA3E78",firmware:"fdr_integrated/57"}, 2000)
assert.equal(connection.recorderConnectionObservations(3000).length, 2)
assert.equal(connection.recorderConnectionObservations(3000)[0].age_ms, 2000)
connection.setAircraftConnection("usb-c", false)
assert.deepEqual(connection.recorderConnectionObservations(3000).map(item => item.device_id), ["ECU-E072A1FA3E78"])
assert.deepEqual(connection.recorderConnectionObservations(12001), [], "a cached identity cannot renew a stale connection")
connection.observeRecorderConnection("ground-radio", {deviceId:""}, 13000)
assert.deepEqual(connection.recorderConnectionObservations(13000), [], "opening Ground without a recorder identity is not recorder presence")

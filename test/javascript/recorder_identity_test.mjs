import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {recorderLabel, recorderTechnicalLabel} from "../../app/javascript/lib/recorder_identity.js"

const root = new URL("../../app/javascript/", import.meta.url)
const modules = new Map()
async function moduleUrl(path) {
  if (modules.has(path)) return modules.get(path)
  let source = await readFile(new URL(path, root), "utf8")
  for (const specifier of new Set([...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]))) {
    const url = specifier === "@hotwired/stimulus"
      ? "data:text/javascript,export class Controller {}"
      : await moduleUrl(`lib/${specifier}.js`)
    source = source.replaceAll(`from "${specifier}"`, `from "${url}"`)
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  modules.set(path, url)
  return url
}

const {default: Connectivity} = await import(await moduleUrl("controllers/fdr_connectivity_controller.js"))
const {default: WifiConfiguration} = await import(await moduleUrl("controllers/fdr_wifi_configuration_controller.js"))
const {currentAircraftConnections, aircraftConnectionLabel} = await import(await moduleUrl("lib/aircraft_connection.js"))
globalThis.window = {location: {origin: "http://localhost"}, dispatchEvent() {}, clearInterval() {}}
globalThis.CustomEvent = class {constructor(type, options) {this.type = type; this.detail = options.detail}}

const assembly = {name: "ExoFDR", serial_number: "FDR-0003", identity_label: "S/N FDR-0003", hardware_definition: "FDR-V0-PERF-01"}
const recorder = {device_id: "ECU-A172E0", assembly, initialization_confirmed: true, connectivity_url: "/forge/fdrs/1/connectivity", initialization_url: "/api/v1/fdrs/1/initialization"}
const label = "ExoFDR · S/N FDR-0003"
assert.equal(recorderLabel({assembly}), label)
assert.equal(recorderLabel({assembly: null}), "Unassigned ECU")
assert.equal(recorderLabel({}), "Recorder not identified")
assert.equal(recorderTechnicalLabel({deviceId: recorder.device_id, assembly}), "ECU-A172E0 · FDR-V0-PERF-01")

function element() {
  return {textContent: "", title: "", hidden: false, dataset: {},
    setAttribute(name, value) {this[name] = value}, removeAttribute(name) {delete this[name]},
    querySelector() {return {textContent: ""}}}
}
function view(Controller = Connectivity) {
  const instance = new Controller()
  for (const target of Controller.targets) instance[`${target}Target`] = element()
  instance.usbAuthenticated = true
  instance.initialized = true
  instance.registrationUrlValue = "/api/v1/fdr_registration"
  return instance
}

const connected = view()
connected.usbIdentity = {deviceId: recorder.device_id, firmware: "fdr/26"}
connected.bleIdentity = {...connected.usbIdentity}
connected.wifiIdentity = {...connected.usbIdentity, assembly}
connected.wifiIdentities = [connected.wifiIdentity]
connected.renderRegisteredRecorder({...recorder}, {registration: "F-GOCC"})
connected.registrationLookupDeviceId = recorder.device_id
connected.registrationLookupStartedAt = Date.now()
for (const transport of ["usb", "ble", "wifi"]) {
  assert.equal(connected[`${transport}DeviceTarget`].textContent, label)
  assert.match(connected[`${transport}IdentityDetailTarget`].textContent, /ECU-A172E0/)
}
assert.equal(connected.recorderDeviceTarget.textContent, label)
assert.equal(connected.recorderEcuTarget.textContent, recorder.device_id)
assert.equal(aircraftConnectionLabel(currentAircraftConnections()), `${label} connected`)
assert.match(connected.wifiLinkLabelTarget.textContent, /FDR-0003.*ECU-A172E0/)

// Heartbeats refresh an assignment even while a USB registration is cached.
connected.renderSillageHeartbeat({recorder: {...recorder, assembly: null, firmware: "fdr/26"}, seen_at: new Date().toISOString(), status: {}})
assert.equal(connected.usbDeviceTarget.textContent, "Unassigned ECU")
assert.equal(connected.recorderDeviceTarget.textContent, "Unassigned ECU")
assert.equal(connected.registeredRecorder.assembly, null)
assert.equal(aircraftConnectionLabel(currentAircraftConnections()), "Unassigned ECU connected")

// A transport mismatch must not leave a single FDR looking authoritative.
connected.bleIdentity = {deviceId: "ECU-ABC123", firmware: "fdr/26"}
await connected.refreshRecorderRegistration()
connected.renderRecorderInformation()
assert.equal(connected.registrationState, "mismatch")
assert.equal(connected.registeredRecorder, null)
assert.equal(connected.recorderDeviceTarget.textContent, "Multiple recorder identities")
assert.equal(connected.bleDeviceTarget.textContent, "Recorder not identified")
assert.equal(aircraftConnectionLabel(currentAircraftConnections()), "Multiple recorders connected")

const requests = []
globalThis.fetch = () => new Promise((resolve) => requests.push(resolve))
const onboarding = view()
onboarding.usbIdentity = {deviceId: recorder.device_id}
onboarding.registrationSubmitting = true
await onboarding.refreshRecorderRegistration()
assert.equal(requests.length, 0, "periodic lookups must not interrupt secure onboarding")
const delayed = view()
delayed.usbIdentity = {deviceId: recorder.device_id}
const firstLookup = delayed.refreshRecorderRegistration()
await delayed.refreshRecorderRegistration()
assert.equal(requests.length, 1, "coalesce in-flight identity lookups")
delayed.usbIdentity = {deviceId: "ECU-ABC123"}
const secondLookup = delayed.refreshRecorderRegistration()
requests[1](new Response(JSON.stringify({registered: true, recorder: {...recorder, device_id: "ECU-ABC123", assembly: null}})))
await secondLookup
requests[0](new Response(JSON.stringify({registered: true, recorder})))
await firstLookup
assert.equal(delayed.registeredRecorder.device_id, "ECU-ABC123")
assert.equal(delayed.recorderDeviceTarget.textContent, "Unassigned ECU")

// Refresh the same ECU after an assignment change, without reconnecting it.
delayed.registrationLookupStartedAt = 0
const reassignedLookup = delayed.refreshRecorderRegistration()
requests[2](new Response(JSON.stringify({registered: true, recorder: {...recorder, device_id: "ECU-ABC123"}})))
await reassignedLookup
assert.equal(delayed.recorderDeviceTarget.textContent, label)

// Initialization confirmation is another async boundary; disconnect wins.
const initializing = view()
initializing.usbIdentity = {deviceId: recorder.device_id}
let finishConfirmation
initializing.confirmRecorderInitialization = () => new Promise((resolve) => {finishConfirmation = resolve})
const pending = initializing.refreshRecorderRegistration()
requests[3](new Response(JSON.stringify({registered: true, recorder: {...recorder, initialization_confirmed: false}})))
await new Promise((resolve) => setImmediate(resolve))
initializing.usbIdentity = null
initializing.resetWifiRegistration()
finishConfirmation()
await pending
assert.equal(initializing.registeredRecorder, null)
assert.equal(initializing.registrationState, "idle")

// Do not label a different physical ECU as the FDR from an open Wi-Fi page.
const wifi = view(WifiConfiguration)
wifi.expectedDeviceIdValue = recorder.device_id
await assert.rejects(wifi.resolveRecorderIdentity("ECU-ABC123"), /connected ECU is ECU-ABC123/)
const wifiLookup = wifi.resolveRecorderIdentity(recorder.device_id)
requests[4](new Response(JSON.stringify({registered: true, recorder})))
await wifiLookup
wifi.deviceInfo = {deviceId: recorder.device_id, firmware: "fdr/26"}
wifi.renderConnection({alertFlags: 0}, "USB-C")
assert.equal(wifi.bleDeviceTarget.textContent, label)
assert.equal(wifi.bleDeviceTarget.title, recorder.device_id)
wifi.resetConnectionState()
assert.equal(wifi.resolvedRecorder, null)
wifi.expectedDeviceIdValue = ""
const unboundLookup = wifi.resolveRecorderIdentity("ECU-ABC123")
requests[5](new Response(JSON.stringify({registered: false})))
await unboundLookup
assert.equal(wifi.resolvedRecorder, null, "an unbound workspace must not invent a physical FDR for a new ECU")
const disconnectedWifiLookup = wifi.resolveRecorderIdentity(recorder.device_id)
wifi.resetConnectionState()
requests[6](new Response(JSON.stringify({registered: true, recorder})))
await assert.rejects(disconnectedWifiLookup, /connection ended/)
assert.equal(wifi.resolvedRecorder, null)

console.log("Recorder identity, transport consistency, reassignment and asynchronous lifecycle tests passed")

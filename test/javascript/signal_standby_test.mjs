import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
const url = (path) => new URL(`../../app/javascript/${path}`, import.meta.url).href
const read = async (path) => (await readFile(new URL(`../../app/javascript/${path}`, import.meta.url), "utf8"))
const strip = (source) => source.replace(/^import .*$/gm, "").replace(/const TypedController = .*$/m, "const TypedController = class {}")
const load = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

// The transport module keeps one open link across a page change.
const contractURL = `data:text/javascript;base64,${Buffer.from(await read("lib/exs1_contract.js")).toString("base64")}`
const protocolURL = `data:text/javascript;base64,${Buffer.from((await read("lib/fdr_sync_protocol.js")).replaceAll('from "exs1_contract"', `from "${contractURL}"`)).toString("base64")}`
const transportSource = (await read("lib/signal_transport.js")).replace('from "fdr_sync_protocol"', `from "${protocolURL}"`)
const transportURL = `data:text/javascript;base64,${Buffer.from(transportSource).toString("base64")}`
const {PollingTelemetryPort, parkTelemetryLink, claimTelemetryLink, closeTelemetryLink} = await import(transportURL)

const makeLink = () => {
  const state = {closed: 0, released: 0}
  return {state, link: {port: {close: async () => { state.closed++ }}, kind: "ground-radio", release: () => { state.released++ }}}
}
assert.equal(claimTelemetryLink(), null, "nothing is parked at first")
const first = makeLink()
parkTelemetryLink(first.link)
assert.equal(claimTelemetryLink(), first.link, "the next screen takes the open link")
assert.equal(claimTelemetryLink(), null, "a link is claimed once")
assert.equal(first.state.closed, 0, "a claimed link stays open")
const second = makeLink(), third = makeLink()
parkTelemetryLink(second.link)
parkTelemetryLink(third.link)
await tick()
assert.deepEqual(second.state, {closed: 1, released: 1}, "a link replaced before being claimed is closed and its lock released")
assert.equal(claimTelemetryLink(), third.link)
const expiring = makeLink()
parkTelemetryLink(expiring.link, 5)
await new Promise(resolve => setTimeout(resolve, 25))
assert.deepEqual(expiring.state, {closed: 1, released: 1}, "a link nobody claims is closed")
assert.equal(claimTelemetryLink(), null)
const broken = {port: {close: async () => { throw new Error("gone") }}, kind: "ble", release: null}
await assert.doesNotReject(closeTelemetryLink(broken), "an unplugged port still releases quietly")

// A polling link (USB-C, Bluetooth, Wi-Fi) survives a cancelled reader like a serial port does.
let polls = 0, closes = 0
const packet = (generation) => { const bytes = new Uint8Array(12); new DataView(bytes.buffer).setUint32(0, generation, true); bytes.set([0xfd, 1, 2, 3], 8); return bytes }
const polling = new PollingTelemetryPort(async () => ({poll: async () => packet(++polls), close: async () => { closes++ }}))
await polling.open()
const standbyStream = polling.readable
const standbyReader = standbyStream.getReader()
assert.deepEqual(Array.from((await standbyReader.read()).value), [0xfd, 1, 2, 3])
await standbyReader.cancel()
assert.notEqual(polling.readable, standbyStream, "cancelling the standby reader leaves a fresh stream")
assert.equal(closes, 0, "and the link itself open")
const recordingReader = polling.readable.getReader()
assert.deepEqual(Array.from((await recordingReader.read()).value), [0xfd, 1, 2, 3], "the recording reads on from the same link")
await recordingReader.cancel()
await polling.close()
assert.equal(closes, 1)
assert.equal(polling.readable, null)
console.log("Signal link parking, expiry and re-readable polling link tests passed")

// Standby: telemetry is shown, nothing is stored, and Start flight hands the open link over.
const workspaceSource = strip(await read("controllers/signal_workspace_controller.js"))
const {default: Workspace} = await load(`import {NATIVE_MOUNT, BELLY_MOUNT, interpretImu} from "${url("lib/imu_mount.js")}";
import {ImuHealth} from "${url("lib/imu_health.js")}";
import {SignalTelemetry, groundStationHeartbeat} from "${url("lib/signal_telemetry.js")}";
import {observeRecorderConnection} from "${url("lib/aircraft_connection.js")}";
import {parkTelemetryLink, claimTelemetryLink, closeTelemetryLink} from "${transportURL}";
const resolveRadioIdentity = (...args) => globalThis.signalIdentityLookup(...args);
const setAircraftConnection = () => {};
const closeWorkerCapture = async () => {};
${workspaceSource.replace(/^function closeWorkerCapture/m, "function unusedCloseWorkerCapture")}`)

const originalNow = Date.now
let now = 50_000
Date.now = () => now
const events = []
const originalWindow = globalThis.window
globalThis.window = Object.assign(new EventTarget(), {setTimeout: () => 0, clearInterval: () => {}, clearTimeout: () => {}})
window.addEventListener("sillage:signal-standby", event => events.push(event.detail))
Object.defineProperty(globalThis, "navigator", {value: {serial: {}}, configurable: true})
const text = () => ({textContent: "", dataset: {}})
const standbyView = () => {
  const view = new Workspace()
  Object.assign(view, {sessionValue: "", connectionGeneration: Symbol("standby"), db: {},
    aircraftStatusTarget: text(), standbyAircraftTarget: text(), startHintTarget: text(), startButtonTarget: {disabled: true},
    radioStatusTarget: text(), recorderStatusTarget: text(), parserStatusTarget: text(),
    startDeviceTarget: {value: ""}, startTransportTarget: {value: ""},
    startFlightTarget: {value: "", options: [{value: ""}], add(option) { this.options.push(option) }},
    startFormTarget: {submitted: 0, requestSubmit() { this.submitted++ }}})
  view.renderRadioControl = () => {}
  view.refreshTelemetry = () => {}
  return view
}
const frame = (decoded) => ({type: "frame", decoded, systemId: 1, componentId: 191, receivedAtUs: String(now * 1000), parser: {errors: 0, dropped: 0}})
const quality = {name: "imu_quality", deviceId: "ECU-441BF685BEC8", bootId: 1, imuEpoch: 1, firmware: "fdr_integrated/58", timeBootMs: 1}
let lookups = 0
globalThis.signalIdentityLookup = async (deviceId) => { lookups++; return {deviceId, recorderLabel: "EXOFDR-V1-PCB-01", aircraftLabel: "Freak 6 · WS-F6", registered: true, assemblyId: 42, canAcquire: true} }

const view = standbyView()
assert.equal(view.standby, true)
view.renderStandby(false, now)
assert.equal(view.aircraftStatusTarget.textContent, "Waiting for the link")
assert.match(view.startHintTarget.textContent, /Connect the link/)
assert.equal(view.startButtonTarget.disabled, true)
view.port = {}
view.renderStandby(false, now)
assert.equal(view.aircraftStatusTarget.textContent, "Listening")
assert.match(view.startHintTarget.textContent, /no telemetry yet/)
view.handleWorkerMessage({type: "capture-closed", bytes: 0})
assert.equal(view.recorderStatusTarget.textContent, "", "standby has no capture to report")
view.handleWorkerMessage(frame({name: "gps", latitude: 46.2, longitude: 6.1, altitudeM: 400, fix: 3}))
view.handleWorkerMessage(frame(quality))
assert.equal(view.pendingSamples.length, 0, "standby telemetry is shown and never queued for upload")
assert.equal(view.mavlinkSystemId, "1")
assert.ok(view.telemetry.gps, "the live preview still feeds the dashboard")
view.renderStandby(true, now)
assert.equal(view.aircraftStatusTarget.textContent, "ECU-441BF685BEC8", "the ECU identity shows until Hangar names the aircraft")
assert.equal(view.startButtonTarget.disabled, true, "the flight waits for the identity check the recording will repeat")
assert.match(view.startHintTarget.textContent, /Checking the recorder/)
await tick()
now += 200
view.renderStandby(true, now)
assert.equal(view.aircraftStatusTarget.textContent, "Freak 6 · WS-F6")
assert.equal(view.standbyAircraftTarget.textContent, "Freak 6 · WS-F6")
assert.match(view.startHintTarget.textContent, /not saved/)
assert.equal(view.startButtonTarget.disabled, false)
assert.equal(lookups, 1)
assert.deepEqual(events.at(-1), {connected: true, live: true, ready: true, deviceId: quality.deviceId, label: "Freak 6 · WS-F6", identified: true, registered: true, assemblyId: 42})
const count = events.length
now += 100
view.renderStandby(true, now)
assert.equal(events.length, count, "an unchanged state is not announced again at once")
now += 1_000
view.renderStandby(true, now)
assert.equal(events.length, count + 1, "it is repeated for listeners that load late")
view.renderStandby(false, now)
assert.equal(view.aircraftStatusTarget.textContent, "Link lost")
assert.equal(view.startButtonTarget.disabled, true, "a lost link cannot start a flight")
assert.equal(events.at(-1).ready, false)
view.refreshIdentity()
view.renderStandby(true, now)
await tick()
assert.equal(lookups, 2, "Hangar changes are read again on request")

// Start flight keeps the link open and hands it to the recording screen.
const portState = {closed: 0, cancelled: 0}
const starter = standbyView()
starter.handleWorkerMessage(frame(quality))
starter.port = {close: async () => { portState.closed++ }}
starter.reader = {cancel: async () => { portState.cancelled++ }}
starter.worker = {terminate() {}, postMessage() {}}
starter.releasePortLock = () => { portState.released = true }
starter.lastFrameAt = now
starter.standbyIdentity = {deviceId: quality.deviceId, canAcquire: true}
starter.connectionKind = "ble"
await starter.startFlight()
assert.equal(starter.startFormTarget.submitted, 1)
assert.equal(starter.startDeviceTarget.value, quality.deviceId)
assert.equal(starter.startTransportTarget.value, "ble")
assert.equal(portState.closed, 0, "starting a flight never closes the link")
assert.equal(portState.cancelled, 1, "only the standby reader stops")
assert.equal(portState.released, undefined, "the cross-tab lock travels with the link")
assert.equal(starter.port, null)
const handed = claimTelemetryLink()
assert.equal(handed.kind, "ble")
await starter.startFlight()
assert.equal(starter.startFormTarget.submitted, 1, "a second request while starting is ignored")

// The recording screen adopts it without reopening the port.
const recorder = new Workspace()
const opened = []
Object.assign(recorder, {sessionValue: "session", connectionGeneration: Symbol("recording"), db: {}})
recorder.renderRadioControl = () => {}
recorder.openSerial = async (port, adopted) => { opened.push([port, adopted]) }
parkTelemetryLink(handed)
await recorder.resumeLink()
assert.deepEqual(opened, [[handed.port, true]], "the port is adopted as already open")
assert.equal(recorder.connectionKind, "ble")
assert.equal(typeof recorder.releasePortLock, "function")

// A flight asked from a phone is started for that flight, even one the page did not list.
const remote = standbyView()
remote.handleWorkerMessage(frame(quality))
remote.port = {close: async () => {}}
remote.lastFrameAt = now
remote.standbyIdentity = {deviceId: quality.deviceId, canAcquire: true}
globalThis.Option = class { constructor(label, value) { this.label = label; this.value = value } }
await remote.startFlight(new CustomEvent("sillage:signal-start", {detail: {flightId: 77, code: "EXO-0077"}}))
assert.equal(remote.startFlightTarget.value, "77")
assert.equal(remote.startFlightTarget.options.at(-1).label, "EXO-0077")
assert.equal(remote.startFormTarget.submitted, 1)
void closeTelemetryLink(claimTelemetryLink())

// Without a heard recorder nothing starts, by button or by phone.
const silent = standbyView()
silent.port = {}
await silent.startFlight()
assert.equal(silent.startFormTarget.submitted, 0)

// Ending a flight parks the link instead of closing it; leaving for another page closes it.
const ending = new Workspace()
Object.assign(ending, {sessionValue: "session", radioStatusTarget: text()})
ending.renderRadioControl = () => {}; ending.refreshTelemetry = () => {}
const endState = {closed: 0, released: 0}
ending.port = {close: async () => { endState.closed++ }}
ending.releasePortLock = () => { endState.released++ }
await ending.stopSerial(true)
assert.equal(endState.closed, 0)
assert.equal(ending.parkedLink.kind, "ground-radio")
await ending.stopSerial(true)
assert.ok(ending.parkedLink, "a parked link stays parked through a repeated stop")
await ending.stopSerial()
assert.deepEqual(endState, {closed: 1, released: 1}, "a plain stop closes the parked link and releases its lock")
assert.equal(ending.parkedLink, null)
console.log("Signal standby preview, start hand-off, remote start and end-of-flight link tests passed")

// The phone remote switch: check-in, and start only when on and an aircraft is heard.
const stationSource = strip(await read("controllers/signal_station_controller.js"))
const {default: Station} = await load(stationSource)
const store = new Map()
globalThis.localStorage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value)}
Object.defineProperty(globalThis, "document", {value: {querySelector: () => null}, configurable: true})
window.setInterval = () => 0
const originalFetch = globalThis.fetch
const posted = []
let pending = {}
globalThis.fetch = async (target, options) => { posted.push([target, JSON.parse(options.body)]); return Response.json(pending) }
const starts = []
window.addEventListener("sillage:signal-start", event => starts.push(event.detail))
const station = new Station()
Object.assign(station, {urlValue: "/remote/station", element: {dataset: {}}, labelTarget: text(), statusTarget: text(),
  pairTarget: {hidden: true}, toggleTarget: {attributes: {}, setAttribute(key, value) { this.attributes[key] = value }},
  dialogTarget: {open: false, showModal() { this.open = true }, close() { this.open = false }}})
station.connect()
await tick()
assert.match(station.key, /^[0-9a-f-]{36}$/)
assert.equal(store.get("signal-station-key"), station.key, "the computer keeps one identity")
assert.deepEqual(posted.at(-1), ["/remote/station", {key: station.key, remote: false, ready: false, device_id: "", aircraft: ""}])
assert.equal(station.labelTarget.textContent, "Phone remote off")
pending = {flight_id: 9, code: "EXO-0009", pilot: "Julien"}
station.standby({detail: {ready: true, deviceId: quality.deviceId, label: "Freak 6"}})
await tick()
assert.equal(starts.length, 0, "a switched-off remote never starts a flight")
station.toggle()
await tick()
assert.equal(store.get("signal-remote"), "1", "the switch is remembered on this computer")
assert.equal(station.dialogTarget.open, true, "turning it on shows the QR code")
assert.equal(station.element.dataset.state, "armed")
assert.deepEqual(posted.at(-1)[1], {key: station.key, remote: true, ready: true, device_id: quality.deviceId, aircraft: "Freak 6"})
assert.deepEqual(starts, [{flightId: 9, code: "EXO-0009"}])
await station.checkIn()
assert.equal(starts.length, 1, "one start per request")
const blocked = new Station()
Object.assign(blocked, {urlValue: "/remote/station", element: {dataset: {}}, labelTarget: text(), statusTarget: text(), pairTarget: {hidden: true},
  toggleTarget: {setAttribute() {}}, dialogTarget: {open: false, showModal() {}}})
blocked.connect()
await tick()
assert.equal(blocked.enabled, true)
assert.equal(blocked.element.dataset.state, "blocked")
assert.match(blocked.statusTarget.textContent, /only be timed/)
assert.equal(starts.length, 1, "no aircraft heard, no start")
globalThis.fetch = originalFetch
globalThis.window = originalWindow
Date.now = originalNow
console.log("Signal phone remote switch, check-in and guarded start tests passed")

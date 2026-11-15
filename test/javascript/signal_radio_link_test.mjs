import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
const telemetryURL = new URL("../../app/javascript/lib/signal_telemetry.js", import.meta.url).href
const source = (await readFile(new URL("../../app/javascript/lib/signal_radio_link.js", import.meta.url), "utf8"))
  .replace('from "signal_telemetry"', `from "${telemetryURL}"`)
const {SignalRadioReadiness, SignalRadioLink} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
let sequence = 0
const frame = (decoded, systemId = 1, componentId = 191) => ({type: "frame", messageId: 0, sequence: sequence++, decoded, systemId, componentId})
const heartbeat = {name: "heartbeat", customMode: 0x46445200, type: 18, autopilot: 8, baseMode: 1, systemStatus: 4}
const quality = {name: "imu_quality", deviceId: "ECU-441BF685BEC8", bootId: 1}
const readiness = new SignalRadioReadiness()
assert.equal(readiness.snapshot(1000, false).state, "offline")
for (const decoded of [{name:"radio"}, {name:"heartbeat",type:6}, {name:"unknown"}, {name:"attitude"}]) readiness.receive(frame(decoded), 1000)
assert.equal(readiness.snapshot(1000, true).state, "waiting", "USB, ground radio and unrelated aircraft do not imply a connected wing")
readiness.receive(frame(heartbeat), 1000)
readiness.receive(frame(quality), 1100)
assert.equal(readiness.snapshot(1100, true).label, "Wing connected")
assert.match(readiness.snapshot(1100, true).detail, /Preflight not checked/, "radio reception cannot certify flight readiness")
readiness.receive(frame(heartbeat, 2), 2000)
readiness.receive(frame({name:"radio"}, 51, 68), 2500)
assert.equal(readiness.snapshot(2600, true).state, "stale", "another wing and SiK-only traffic cannot keep this wing connected")
const fresh = frame(heartbeat)
readiness.receive(fresh, 3000)
readiness.receive(fresh, 4499)
assert.equal(readiness.snapshot(4500, true).state, "stale", "a duplicate packet cannot extend the wing lease")
readiness.receive(frame(heartbeat), 5000)
readiness.receive(frame({name:"module_status",role:2,timeBootMs:5000,bootId:1,ageMs:0,flags:1,validity:0,deviceId:quality.deviceId}),5000)
assert.equal(readiness.snapshot(5000, true).state, "degraded")
assert.equal(readiness.snapshot(5000, false).state, "offline", "disconnect clears apparent readiness immediately")

const originalNavigator = globalThis.navigator, originalWorker = globalThis.Worker, originalWindow = globalThis.window
let input, closed = 0, opened = 0, locked = false, workers = [], written = []
let allowOpen = () => Promise.resolve()
const port = {
  getInfo: () => ({usbVendorId:0x0403,usbProductId:0x6015}),
  async open() {
    opened++
    await allowOpen()
    this.readable = new ReadableStream({start(controller) {input = controller}})
    this.writable = new WritableStream({write(value) {written.push(value)}})
  },
  async close() {closed++; this.readable = null; this.writable = null}
}
Object.defineProperty(globalThis, "navigator", {value:{serial:{getPorts:async()=>[port],requestPort:async()=>port},
  locks:{async request(name, options, callback) {
    assert.equal(name,"sillage-signal-ground-radio-port:1027:24597")
    assert.equal(options.ifAvailable,true)
    if (locked) return callback(null)
    locked = true
    try {return await callback({name})} finally {locked = false}
  }}},configurable:true})
globalThis.window = {setInterval,clearInterval}
globalThis.Worker = class {
  commands = []; terminated = false
  constructor(url) {assert.match(url,/signal_serial_worker/); workers.push(this)}
  postMessage(command) {this.commands.push(command)}
  terminate() {this.terminated = true}
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const link = new SignalRadioLink(() => {})
await link.connect(); await tick()
assert.ok(link.connected)
assert.equal(locked,true)
assert.equal(workers[0].commands.length,0,"the home preview must never open a recording")
input.enqueue(Uint8Array.of(253,1,2)); await tick()
assert.equal(workers[0].commands[0].type,"bytes")
assert.ok(written.length > 0,"GCS presence permits SiK signal reports")
workers[0].onmessage({data:frame(heartbeat)})
assert.equal(link.readiness.snapshot(Date.now(),true).state,"connected")
const competing = new SignalRadioLink(() => {})
await competing.connect(); await tick()
assert.match(competing.error,/another tab/)
assert.equal(opened,1,"monitoring must not steal an acquisition's port")
await link.close()
assert.equal(closed,1)
assert.equal(locked,false)
assert.equal(workers[0].terminated,true)
assert.equal(link.readiness.source,null)
assert.equal(port.readable,null,"the next acquisition must find an unlocked, closed port")
// Opening can complete after navigation. Cleanup still owns and closes that port.
let finishOpen
allowOpen = () => new Promise(resolve => {finishOpen = resolve})
await link.connect(); await tick()
const closing = link.close()
finishOpen(); await closing
assert.equal(closed,2)
assert.equal(locked,false)
assert.equal(link.connected,false)
Object.defineProperty(globalThis,"navigator",{value:originalNavigator,configurable:true})
globalThis.Worker = originalWorker; globalThis.window = originalWindow
console.log("Signal home wing detection, freshness, duplicate rejection, preview-only reads and serial handoff tests passed")

// Starting acquisition waits for the preview's serial cleanup before submitting.
const controllerSource = (await readFile(new URL("../../app/javascript/controllers/signal_radio_status_controller.js",import.meta.url),"utf8"))
  .replace(/^import .*$/gm,"").replace(/const TypedController = .*$/m,"const TypedController = class {}")
const linkURL = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
const {default: RadioStatus} = await import(`data:text/javascript;base64,${Buffer.from(`import {SignalRadioLink} from "${linkURL}";\n${controllerSource}`).toString("base64")}`)
const originalForm = globalThis.HTMLFormElement
let submitted = 0, finishRelease, closeCalls = 0
const submitter = {}
globalThis.HTMLFormElement = class {
  closest() {return true}
  requestSubmit(button) {assert.equal(button,submitter); submitted++}
}
const statusView = new RadioStatus()
statusView.active = true
statusView.link = {port:{},busy:false,close() {closeCalls++; return new Promise(resolve => {finishRelease = resolve})}}
const event = {target:new HTMLFormElement(),submitter,preventDefault() {this.prevented = true}}
statusView.submit(event)
statusView.submit(event)
assert.equal(event.prevented,true)
assert.equal(submitted,0)
assert.equal(closeCalls,1,"a double click cannot submit a second acquisition during cleanup")
finishRelease(); await tick()
assert.equal(submitted,1,"the selected form starts only after serial cleanup")
globalThis.HTMLFormElement = originalForm
console.log("Signal home acquisition form handoff test passed")

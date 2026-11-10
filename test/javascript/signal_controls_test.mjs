import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

async function controller(name, prelude = "") {
  const source = readFileSync(new URL(`../../app/javascript/controllers/${name}_controller.js`, import.meta.url), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/const TypedController = .*$/m, "const TypedController = class {}")
  return (await import(`data:text/javascript;base64,${Buffer.from(prelude + source).toString("base64")}`)).default
}
function button(attributes = {}) {
  return {disabled: false, dataset: {}, getAttribute: key => attributes[key], setAttribute: (key, value) => {attributes[key] = value}}
}
globalThis.window = new EventTarget()
const stored = new Map()
globalThis.localStorage = {getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value)}
const panels = {rail: {hidden: false}, telemetry: {hidden: false, sample: 42}}
globalThis.document = {getElementById: id => panels[id]}
const Disclosure = await controller("panel_disclosure")
function disclosure(id) {
  const view = new Disclosure()
  Object.assign(view, {element: button({"aria-controls": id}), storageKeyValue: `signal-${id}`, expandLabelValue: `Show ${id}`, collapseLabelValue: `Hide ${id}`})
  view.connect()
  return view
}
let resizes = 0
window.addEventListener("resize", () => resizes++)
const rail = disclosure("rail"), telemetry = disclosure("telemetry")
telemetry.toggle()
assert.equal(panels.telemetry.hidden, true)
assert.equal(panels.rail.hidden, false, "panel preferences are independent")
assert.equal(telemetry.element.getAttribute("aria-expanded"), "false")
panels.telemetry.sample = 43
assert.equal(disclosure("telemetry").element.getAttribute("aria-expanded"), "false", "refresh restores the preference")
telemetry.toggle()
assert.equal(panels.telemetry.sample, 43, "hiding preserves the mounted readings")
rail.toggle()
assert.equal(disclosure("rail").element.getAttribute("aria-label"), "Show rail")
assert.ok(resizes >= 5, "layout is notified to reclaim the freed space")
localStorage.setItem = () => {throw new Error("Storage unavailable")}
assert.doesNotThrow(() => rail.toggle())
assert.equal(panels.rail.hidden, false)

const Connection = await controller("signal_connection")
const connection = new Connection()
Object.assign(connection, {element: button(), buttonTarget: button(), labelTarget: {}, transportTarget: {value: "ground-radio"}, recorderTarget: {value: ""}})
window.addEventListener("sillage:ground-radio-state", event => connection.update(event))
const dependencies = ["imu_health", "signal_telemetry"].map(name => new URL(`../../app/javascript/lib/${name}.js`, import.meta.url).href)
const Workspace = await controller("signal_workspace", `import {ImuHealth} from '${dependencies[0]}'; import {SignalTelemetry} from '${dependencies[1]}';\n`)
const workspace = new Workspace()
workspace.db = {}
workspace.connectionGeneration = Symbol("active session")
workspace.renderRadioControl()
assert.equal(connection.labelTarget.textContent, "Connect")
assert.equal(connection.buttonTarget.disabled, false)
let acquire = 0, stop = 0
const port = {getInfo: () => ({usbVendorId: 0x0403})}
Object.defineProperty(globalThis, "navigator", {value: {serial: {getPorts: async () => [port]}}, configurable: true})
workspace.acquirePort = async selected => {assert.equal(selected, port); acquire++; workspace.port = port}
workspace.stopSerial = async () => {stop++; workspace.port = null; workspace.renderRadioControl()}
window.addEventListener("sillage:ground-radio-toggle", workspace.boundRadioToggle)
connection.toggle()
assert.equal(connection.buttonTarget.disabled, true, "the chooser prevents repeated clicks")
connection.toggle()
await new Promise(resolve => setImmediate(resolve))
assert.equal(acquire, 1)
assert.equal(connection.labelTarget.textContent, "Connected")
assert.match(connection.buttonTarget.getAttribute("aria-label"), /No telemetry received/, "adapter connection does not assert live telemetry")
connection.toggle()
assert.equal(stop, 1)
assert.equal(connection.labelTarget.textContent, "Connect")
workspace.ended = true
workspace.renderRadioControl()
connection.toggle()
assert.equal(acquire, 1, "completed sessions cannot reconnect")
assert.equal(connection.buttonTarget.disabled, true)
console.log("Signal panel persistence and header radio lifecycle tests passed")

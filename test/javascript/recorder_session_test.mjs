import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

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
const {setRecorderSession, getRecorderSession} = await import(await moduleUrl("lib/recorder_session.js"))

globalThis.document = new EventTarget()
globalThis.window = new EventTarget()
const manager = new Connectivity()
manager.initialized = true
manager.element = {isConnected: true, closest: () => null}
const client = {close() { throw new Error("Navigation must not close USB") }}
const ble = {disconnect() { throw new Error("Navigation must not disconnect BLE") }}
manager.usbClient = client
manager.bleServer = ble
let destroyed = 0
manager.importQueue = {destroy() { destroyed += 1 }}
manager.teardown = async () => { destroyed += 1 }
setRecorderSession(manager)
manager.disconnect()
await new Promise(resolve => setTimeout(resolve, 0))
manager.connect()
assert.equal(manager.usbClient, client)
assert.equal(manager.bleServer, ble)
assert.equal(getRecorderSession(), manager)
assert.equal(destroyed, 0)

const identity = {deviceId: "ECU-TEST", firmware: "test"}
const wifiClient = {}
manager.usbIdentity = identity
manager.usbAuthenticated = true
manager.wifiSession = async () => ({client: wifiClient, identity, authenticated: true, transport: "USB-C", status: {alertFlags: 0}})
const wifi = new WifiConfiguration()
wifi.expectedDeviceIdValue = identity.deviceId
wifi.resolveRecorderIdentity = async () => {}
let released = 0
wifi.unregisterUsbPageRelease = () => { released += 1 }
let rendered = null
wifi.renderConnection = (status, transport) => { rendered = transport }
await wifi.adoptSharedConnection()
assert.equal(released, 1)
assert.equal(wifi.unregisterUsbPageRelease, null)
assert.equal(wifi.wifiClient, wifiClient)
assert.equal(wifi.usbClient, client)
assert.equal(wifi.usbAuthenticated, true)
assert.equal(rendered, "USB-C")
wifi.disconnect()
assert.equal(manager.usbClient, client)
assert.equal(manager.bleServer, ble)

const label = {textContent: ""}
const iconButton = {querySelector: () => label}
wifi.setButtonLabel(iconButton, "Disconnect USB-C")
assert.equal(label.textContent, "Disconnect USB-C")
const textButton = {querySelector: () => null, textContent: "Connect BLE"}
wifi.setButtonLabel(textButton, "Disconnect BLE")
assert.equal(textButton.textContent, "Disconnect BLE")

const mismatched = new WifiConfiguration()
mismatched.expectedDeviceIdValue = "ECU-OTHER"
let mismatch = ""
mismatched.resetConnectionState = () => {}
mismatched.showError = (message) => { mismatch = message }
await mismatched.adoptSharedConnection()
assert.match(mismatch, /another FDR/)
assert.equal(mismatched.wifiClient, undefined)

manager.element.isConnected = false
manager.disconnect()
await new Promise(resolve => setTimeout(resolve, 0))
assert.equal(destroyed, 2)
assert.equal(getRecorderSession(), null)
console.log("Persistent USB/BLE ownership, shared Wi-Fi access, identity guards and button labels passed")

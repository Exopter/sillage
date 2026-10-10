import assert from "node:assert/strict"
import {createHmac} from "node:crypto"
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
const {UsbFdrClient, UsbMessage, UsbSecurityCommand, FdrAuthResult} = await import(await moduleUrl("lib/fdr_sync_protocol.js"))
const key = Buffer.from(Array.from({length: 32}, (_, i) => (i * 7 + 31) % 256))
const encodedKey = key.toString("base64url")
const nonce = Buffer.alloc(16, 0x23)
const proof = createHmac("sha256", key).update(Buffer.concat([Buffer.from("exopter/fdr/usb-session/v1\0"), nonce])).digest()
const recorder = {
  device_id: "ECU-A172E0", assembly: {identity_label: "EXOFDR-V0-PERF-01"},
  initialization_confirmed: true, initialization_url: "/api/v1/fdrs/1/initialization",
  access_restoration_url: "/api/v1/fdrs/1/access-restoration", connectivity_url: "/forge/fdrs/1/connectivity"
}
globalThis.document = {querySelector() {return {getAttribute() {return "csrf"}}}}
globalThis.CustomEvent = class {constructor(type, options) {this.type = type; this.detail = options.detail}}

function setup({initialized = true, configured = false, confirm = true, badProof = false, retainKey = true} = {}) {
  const events = [], requests = [], prompts = [], notices = []
  globalThis.window = {
    clearInterval() {}, dispatchEvent() {}, location: {assign(url) {events.push(`navigate:${url}`)}},
    confirm(message) {prompts.push(message); return confirm}
  }
  const controller = new Connectivity()
  for (const target of Connectivity.targets) controller[`${target}Target`] = {
    textContent: "", title: "", hidden: false, dataset: {},
    setAttribute(name, value) {this[name] = value}, removeAttribute(name) {delete this[name]},
    querySelector() {return {textContent: ""}}
  }
  controller.initialized = true
  controller.usbSession = Symbol("usb")
  controller.usbIdentity = {deviceId: recorder.device_id}
  controller.registrationIdentity = controller.usbIdentity
  controller.registeredRecorder = {...recorder, initialization_confirmed: initialized}
  controller.usbAuthenticationConfigured = configured
  controller.authenticationUrlValue = "/api/v1/fdr-authentication"
  controller.startUsbPolling = () => events.push("poll")
  controller.showSynchronizationNotice = (message, options) => notices.push({message, ...options})
  controller.disconnectUsb = async () => {events.push("disconnect"); controller.usbClient = null}

  // Use the actual USB key decoder, command encoder, status parser and proof encoder.
  const client = Object.create(UsbFdrClient.prototype)
  let hasKey = configured
  client.request = async (type, payload) => {
    assert.equal(type, UsbMessage.SECURITY)
    const status = new Uint8Array(20)
    status[0] = 1
    const command = payload[1]
    if (command === UsbSecurityCommand.INSTALL_KEY) {
      events.push("install")
      assert.equal(payload.length, 34)
      assert.deepEqual(Buffer.from(payload.slice(2)), key)
      hasKey = retainKey
      status[1] = FdrAuthResult.OK
    } else if (command === UsbSecurityCommand.GET_CHALLENGE) {
      events.push("challenge")
      status[1] = hasKey ? FdrAuthResult.OK : FdrAuthResult.NOT_CONFIGURED
      if (hasKey) status.set(nonce, 4)
    } else if (command === UsbSecurityCommand.AUTHENTICATE) {
      events.push("authenticate")
      assert.deepEqual(Buffer.from(payload.slice(2)), proof)
      status[1] = badProof ? FdrAuthResult.AUTHENTICATION_FAILED : FdrAuthResult.OK
      status[3] = badProof ? 0 : 1
    } else assert.fail("Unexpected security command")
    status[2] = hasKey ? 1 : 0
    return {payload: status}
  }
  controller.usbClient = client
  controller.renderRecorderInitializationRequired(controller.registeredRecorder)
  const respond = async (url, options) => {
    const body = JSON.parse(options.body)
    requests.push({url, method: options.method, body})
    assert.equal(options.cache, "no-store")
    assert.equal(options.headers["X-CSRF-Token"], "csrf")
    let payload = {}
    if (url === recorder.access_restoration_url && options.method === "POST") {
      assert.deepEqual(body, {device_id: recorder.device_id, confirmed: true, transport: "usb", key_configured: false})
      payload = {device_id: recorder.device_id, authentication: {key: encodedKey}, restoration_token: "session-bound-token"}
    } else if (url === recorder.initialization_url && options.method === "POST") {
      payload = {authentication: {key: encodedKey}}
    } else if (url === controller.authenticationUrlValue) {
      assert.equal(body.nonce, nonce.toString("hex"))
      assert.equal(body.transport, "usb")
      payload = {proof: proof.toString("hex")}
    } else if (options.method === "PATCH") {
      assert(events.includes("authenticate"), "confirmation must follow the physical USB proof")
      if (url === recorder.access_restoration_url) assert.equal(body.restoration_token, "session-bound-token")
      events.push("confirm")
      payload = {status: "confirmed", device_id: recorder.device_id}
    } else assert.fail(`Unexpected endpoint: ${url}`)
    return new Response(JSON.stringify(payload))
  }
  globalThis.fetch = respond
  return {controller, client, events, requests, prompts, notices, respond}
}

const initial = setup({initialized: false})
assert.equal(initial.controller.wifiRegisterLabelTarget.textContent, "Initialize recorder")
await initial.controller.onboardRecorder()
assert.deepEqual(initial.events.slice(0, 5), ["challenge", "install", "challenge", "authenticate", "confirm"])
assert.equal(initial.prompts.length, 0)
assert.equal(initial.requests[0].url, recorder.initialization_url)

const recovery = setup()
assert.equal(recovery.controller.wifiRegisterLabelTarget.textContent, "Restore recorder access")
assert.equal(recovery.controller.recorderStatusTarget.textContent, "Access restoration required")
await recovery.controller.onboardRecorder()
assert.match(recovery.prompts[0], /EXOFDR-V0-PERF-01.*ECU-A172E0/)
assert.equal(recovery.requests[0].url, recorder.access_restoration_url)
assert.equal(recovery.requests.at(-1).url, recorder.access_restoration_url)
assert.equal(recovery.controller.usbAuthenticated, true)
assert.equal(recovery.controller.registrationState, "registered")
assert.equal(recovery.notices.at(-1).label, "Recorder access restored")
assert(!recovery.events.includes("disconnect"))

const cancelled = setup({confirm: false})
await cancelled.controller.onboardRecorder()
assert.equal(cancelled.requests.length, 0)
assert.equal(cancelled.events.length, 0)

const retry = setup({configured: true, badProof: true})
assert.equal(retry.controller.wifiRegisterLabelTarget.textContent, "Retry authentication")
await retry.controller.onboardRecorder()
assert.equal(retry.requests.length, 1, "a configured recorder only requests a proof")
assert(!retry.events.includes("install"))
assert(!retry.events.includes("confirm"))
assert.equal(retry.controller.usbAuthenticated, false)
assert.equal(retry.controller.wifiRegisterLabelTarget.textContent, "Retry authentication")

const lostKey = setup({retainKey: false})
await lostKey.controller.onboardRecorder()
assert(!lostKey.events.includes("confirm"))
assert.match(lostKey.controller.wifiRegistrationStatusTarget.textContent, /did not retain/)
assert.equal(lostKey.controller.wifiRegisterLabelTarget.textContent, "Restore recorder access")

const changedState = setup()
changedState.controller.usbAuthenticationConfigured = true
await changedState.controller.onboardRecorder()
assert.equal(changedState.requests.length, 0, "a newly missing key still requires explicit recovery confirmation")
assert.equal(changedState.controller.wifiRegisterLabelTarget.textContent, "Restore recorder access")

const configuredAgain = setup({configured: true})
configuredAgain.controller.usbAuthenticationConfigured = false
await configuredAgain.controller.onboardRecorder()
assert(!configuredAgain.events.includes("install"), "recheck the device before releasing any key")
assert.equal(configuredAgain.notices.at(-1).label, "Recorder authenticated")

const unplugged = setup()
globalThis.fetch = async (...args) => {
  const response = await unplugged.respond(...args)
  unplugged.controller.usbClient = null
  unplugged.controller.usbSession = null
  return response
}
await unplugged.controller.onboardRecorder()
assert(!unplugged.events.includes("install"), "a late response cannot install a key after disconnect")
assert(!unplugged.events.includes("confirm"))

const switched = setup()
globalThis.fetch = async (...args) => {
  const response = await switched.respond(...args)
  switched.controller.usbClient = {installAuthenticationKey() {assert.fail("Wrong recorder")}}
  switched.controller.usbSession = Symbol("replacement")
  return response
}
await switched.controller.onboardRecorder()
assert(!switched.events.includes("install"))
assert(!switched.events.includes("confirm"))

const mismatch = setup()
mismatch.controller.bleIdentity = {deviceId: "ECU-ABC123"}
await mismatch.controller.onboardRecorder()
assert.equal(mismatch.requests.length, 0)
assert.equal(mismatch.prompts.length, 0)

const released = setup()
released.controller.registrationSubmitting = true
released.client.close = async () => {}
await Connectivity.prototype.disconnectUsb.call(released.controller)
assert.equal(released.controller.registrationSubmitting, false, "disconnect must release the onboarding action lock")
assert.equal(released.controller.registrationState, "idle")
assert.equal(released.controller.usbClient, null)

console.log("Recorder initialization, key restoration, authentication failure and USB lifecycle tests passed")

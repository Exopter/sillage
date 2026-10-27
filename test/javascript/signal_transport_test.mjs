import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
const contract = await readFile(new URL("../../app/javascript/lib/exs1_contract.js", import.meta.url), "utf8")
const contractURL = `data:text/javascript;base64,${Buffer.from(contract).toString("base64")}`
const protocol = (await readFile(new URL("../../app/javascript/lib/fdr_sync_protocol.js", import.meta.url), "utf8")).replaceAll('from "exs1_contract"', `from "${contractURL}"`)
const protocolURL = `data:text/javascript;base64,${Buffer.from(protocol).toString("base64")}`
const source = (await readFile(new URL("../../app/javascript/lib/signal_transport.js", import.meta.url), "utf8")).replace('from "fdr_sync_protocol"', `from "${protocolURL}"`)
const {LivePacketReader, PollingTelemetryPort, directTelemetryPort} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const packet = (generation, bytes = [253, 1, 2]) => {
  const data = new Uint8Array(8 + bytes.length)
  new DataView(data.buffer).setUint32(0, generation, true)
  data.set(bytes, 8)
  return data
}
const decoder = new LivePacketReader()
assert.deepEqual([...decoder.decode(packet(1))], [253, 1, 2])
assert.equal(decoder.decode(packet(1)).length, 0, "polling cannot duplicate capture frames")
assert.deepEqual([...decoder.decode(packet(2))], [253, 1, 2])
assert.throws(() => decoder.decode(new Uint8Array(7)), /Invalid/)
assert.throws(() => decoder.decode(new Uint8Array(513)), /Invalid/)
let polls = 0, closes = 0
const port = new PollingTelemetryPort(async () => ({
  poll: async () => ++polls < 3 ? new Uint8Array() : packet(polls, [polls]),
  close: async () => { closes++ }
}))
await port.open()
const reader = port.readable.getReader()
assert.deepEqual([...(await reader.read()).value], [3], "an empty mailbox keeps waiting for the first sample")
assert.deepEqual([...(await reader.read()).value], [4])
await reader.cancel(); reader.releaseLock(); await port.close()
assert.equal(closes, 1)
let rejects = 0
const failed = new PollingTelemetryPort(async () => ({poll: async () => {throw new Error("Disconnected")}, close: async () => {rejects++}}))
await failed.open()
const broken = failed.readable.getReader()
await assert.rejects(broken.read(), /Disconnected/)
broken.releaseLock(); await failed.close()
assert.equal(rejects, 1)
await assert.rejects(directTelemetryPort("wifi", {deviceId: "", sessionUuid: "session"}), /Select a recorder/)
console.log("Signal packet deduplication, delayed first data, disconnect and cleanup tests passed")

const {encodeFrame, UsbMessage, UsbCapability, BleUuid} = await import(protocolURL)
const originalNavigator = globalThis.navigator, originalFetch = globalThis.fetch, originalDocument = globalThis.document
let usbClosed = 0, bleClosed = 0, authWrites = 0, requestBodies = [], generation = 20
Object.defineProperty(globalThis, "document", {value: {querySelector: () => ({getAttribute: () => "csrf-test"})}, configurable: true})
globalThis.fetch = async (url, options) => {
  assert.equal(options.credentials, "same-origin")
  assert.equal(options.headers["X-CSRF-Token"], "csrf-test")
  const body = JSON.parse(options.body); requestBodies.push(body)
  if (url.endsWith("fdr-authentication")) return Response.json({proof: "ab".repeat(32)})
  return Response.json({telemetry: {packet: Buffer.from(packet(generation++)).toString("hex"), received_at: "2000-01-01T00:00:00Z", age_ms: 0}})
}
let usbInput
const native = {
  readable: null, writable: null,
  async open() {
    this.readable = new ReadableStream({start(controller) {usbInput = controller}})
    this.writable = new WritableStream({write(bytes) {
      const type = bytes[5], sequence = new DataView(bytes.buffer, bytes.byteOffset).getUint32(8, true)
      let replyType, payload
      if (type === UsbMessage.HELLO) {
        replyType = UsbMessage.DEVICE_INFO; payload = new Uint8Array(64)
        new DataView(payload.buffer).setUint16(2, UsbCapability.LIVE_TELEMETRY, true)
        payload.set(new TextEncoder().encode("ECU-A172E0"), 8)
      } else if (type === UsbMessage.SECURITY) {
        replyType = UsbMessage.SECURITY_DATA
        payload = new Uint8Array(20); payload.set([1, 0, 1, bytes[21] === 3 ? 1 : 0]); payload.fill(1, 4)
        if (bytes[21] === 3) {authWrites++; assert.deepEqual([...bytes.slice(22)], Array(32).fill(0xab))}
      } else {
        assert.equal(type, UsbMessage.LIVE_TELEMETRY)
        assert.equal(bytes[20], 1)
        replyType = UsbMessage.LIVE_TELEMETRY_DATA; payload = packet(generation++)
      }
      usbInput.enqueue(encodeFrame(replyType, sequence, payload))
    }})
  },
  async close() {usbClosed++; this.readable = null; this.writable = null}
}
Object.defineProperty(globalThis, "navigator", {value: {serial: {requestPort: async () => native}}, configurable: true})
const usb = await directTelemetryPort("usb-c", {deviceId: "", sessionUuid: "live"})
await usb.open()
const usbReader = usb.readable.getReader()
assert.deepEqual([...(await usbReader.read()).value], [253, 1, 2])
await usbReader.cancel(); usbReader.releaseLock(); await usb.close()
assert.equal(authWrites, 1); assert.equal(usbClosed, 1)
assert.equal(requestBodies.at(-1).transport, "usb")

let authenticated = false
const bleIdentity = new Uint8Array(64); bleIdentity[0] = 1; bleIdentity.set(new TextEncoder().encode("ECU-A172E0"), 4)
const authentication = {
  async readValue() {const bytes = new Uint8Array(20); bytes.set([1, 0, 1, authenticated ? 1 : 0]); bytes.fill(1, 4); return new DataView(bytes.buffer)},
  async writeValueWithResponse(bytes) {assert.equal(bytes.length, 33); authenticated = true}
}
const gatt = {
  async connect() {return this},
  async getPrimaryService(uuid) {assert.equal(uuid, BleUuid.service); return {getCharacteristic: async uuid => {
    if (uuid === BleUuid.device) return {readValue: async () => new DataView(bleIdentity.buffer)}
    if (uuid === BleUuid.authentication) return authentication
    return {readValue: async () => new DataView(packet(generation++).buffer)}
  }}}, disconnect() {bleClosed++}
}
Object.defineProperty(globalThis, "navigator", {value: {bluetooth: {requestDevice: async options => {
  assert.deepEqual(options.filters, [{services: [BleUuid.service]}]); return {gatt}
}}}, configurable: true})
const ble = await directTelemetryPort("ble", {deviceId: "", sessionUuid: "live"})
await ble.open(); const bleReader = ble.readable.getReader()
assert.deepEqual([...(await bleReader.read()).value], [253, 1, 2])
await bleReader.cancel(); bleReader.releaseLock(); await ble.close()
assert.equal(bleClosed, 1); assert.equal(requestBodies.at(-1).transport, "ble")
const wifi = await directTelemetryPort("wifi", {deviceId: "ECU-A172E0", sessionUuid: "live"})
await wifi.open(); const wifiReader = wifi.readable.getReader()
assert.deepEqual([...(await wifiReader.read()).value], [253, 1, 2])
await wifiReader.cancel(); wifiReader.releaseLock(); await wifi.close()
assert.equal(requestBodies.at(-1).session_uuid, "live")
Object.defineProperty(globalThis, "navigator", {value: originalNavigator, configurable: true})
Object.defineProperty(globalThis, "document", {value: originalDocument, configurable: true})
globalThis.fetch = originalFetch
console.log("Signal USB EXS1, authenticated BLE and Wi-Fi relay integration tests passed")

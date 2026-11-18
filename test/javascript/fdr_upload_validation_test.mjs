import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("../../app/javascript/controllers/fdr_connectivity_controller.js", import.meta.url), "utf8")
const method = source.slice(source.indexOf("  async uploadFile("), source.indexOf("  rememberUsbPort("))
const apiURL = new URL("../../app/javascript/lib/fdr_api.js", import.meta.url).href
const { default: Controller } = await import(`data:text/javascript;base64,${Buffer.from(`import { importReceipt, readResponse } from "${apiURL}"; export default class { ${method} }`).toString("base64")}`)
const controller = new Controller()
controller.uploadUrlValue = "/api/v1/fdr-syncs"
globalThis.document = { querySelector: () => ({ getAttribute: () => "csrf" }) }
globalThis.window = { location: new URL("https://sillage.test/") }
const manifest = { filename: "FDR000001.BIN", sha256: "a".repeat(64) }
const device = { deviceId: "ECU-ABC123" }
const blob = new Blob(["recording"])
const receipt = { sha256: manifest.sha256, status_url: "/api/v1/fdr-syncs/1", import_status: "pending" }
const originalTimer = globalThis.setTimeout
let requests = []
function respond(payloads) {
  requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    assert.ok(payloads.length, "unexpected request")
    return { ok: true, json: async () => payloads.shift() }
  }
}
try {
  // Advance polling waits without changing the controller's receipt logic.
  globalThis.setTimeout = (callback) => originalTimer(callback, 0)
  respond([receipt, { ...receipt, import_status: "processing" }, { ...receipt, import_status: "imported" }])
  await controller.uploadFile(device, manifest, blob)
  assert.equal(requests.length, 3, "pending and processing must not acknowledge the recorder")
  assert.ok(requests[1].options.signal, "poll requests have a deadline")

  // Keep the same authenticated Seat alive while a long server job owns the file.
  const realNow = Date.now
  const realInterval = globalThis.setInterval
  const realClear = globalThis.clearInterval
  let keepalive, released = false, checks = 0, now = 0
  try {
    Date.now = () => (now += 125_000)
    globalThis.setInterval = callback => { keepalive = callback; return 42 }
    globalThis.clearInterval = timer => { released = timer === 42 }
    controller.usbClient = { async status() { checks++ } }
    let polls = 0
    globalThis.fetch = async () => {
      await keepalive()
      return { ok: true, json: async () => ++polls === 3 ? { ...receipt, import_status: "imported" } : receipt }
    }
    await controller.uploadFile(device, manifest, blob)
    assert.equal(checks, 3)
    assert.ok(released)
  } finally {
    Date.now = realNow
    globalThis.setInterval = realInterval
    globalThis.clearInterval = realClear
    controller.usbClient = null
  }

  respond([receipt, { ...receipt, import_status: "failed", error: "Record CRC mismatch" }])
  await assert.rejects(controller.uploadFile(device, manifest, blob), /CRC mismatch/)
  respond([receipt, { ...receipt, import_status: "imported", sha256: "b".repeat(64) }])
  await assert.rejects(controller.uploadFile(device, manifest, blob), /different SHA-256/)
  respond([{ ...receipt, status_url: "https://foreign.test/receipt" }])
  await assert.rejects(controller.uploadFile(device, manifest, blob), /Invalid recording validation URL/)

  globalThis.setTimeout = originalTimer
  const aborter = new AbortController()
  respond([receipt])
  const pending = controller.uploadFile(device, manifest, blob, { signal: aborter.signal })
  queueMicrotask(() => aborter.abort())
  await assert.rejects(pending, { name: "AbortError" })
  assert.equal(requests.length, 1, "disconnect cancels validation polling")
} finally {
  globalThis.setTimeout = originalTimer
}
console.log("FDR upload validation tests passed")

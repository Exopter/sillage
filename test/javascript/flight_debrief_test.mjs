import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { indexedDB } from "fake-indexeddb"

globalThis.indexedDB = indexedDB
const source = (await readFile(new URL("../../app/javascript/controllers/flight_debrief_controller.js", import.meta.url), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace(/const TypedController = .*$/m, "const TypedController = class {}")
const { default: Recorder } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
function recorder(key) {
  const value = new Recorder()
  value.element = { dataset: {}, querySelectorAll: () => [], querySelector: () => null }
  value.keyValue = key
  value.statusTarget = { textContent: "" }
  value.transcriptTarget = { textContent: "" }
  return value
}
const first = recorder("owner:flight")
await first.connect()
const original = new Blob(["original audio bytes"], { type: "audio/webm" })
await first.store("put", { uuid: "recording", parts: [original], type: "audio/webm", url: "/debrief" })
const reopened = recorder("owner:flight")
await reopened.connect()
assert.equal(await reopened.saved.parts[0].text(), "original audio bytes")
assert.match(reopened.statusTarget.textContent, /saved debrief/)
const other = recorder("different-owner:flight")
await other.connect()
assert.equal(other.saved, undefined)
// A failed upload must preserve the original, including after a fresh controller opens.
reopened.api = async () => { throw new Error("network unavailable") }
await reopened.recover()
assert.equal(reopened.element.dataset.state, "recovery")
assert.equal(await (await reopened.store("get")).parts[0].text(), "original audio bytes")
assert.equal(reopened.statusTarget.textContent, "network unavailable")
// Once the audio is stored and processing is requested, the device copy is released and the Pilot log refreshes.
const calls = []
let refreshed = 0
reopened.api = async (url) => { calls.push(url); return { url: "/debrief", status: "uploaded" } }
reopened.refreshLog = () => { refreshed += 1 }
await reopened.recover()
assert.deepEqual(calls.slice(-1), [ "/debrief/process_audio" ])
assert.equal(reopened.element.dataset.state, "published")
assert.equal(await reopened.store("get"), undefined)
assert.equal(refreshed, 1)
first.database.close(); reopened.database.close(); other.database.close()
console.log("Audio recovery, account isolation, failed upload preservation and automatic publication passed")

// The live connection opens with the screen. The microphone stays muted until the
// tap, and a connection that is never used gives its reservation back.
const tracks = [{ enabled: true, stopped: false, stop() { this.stopped = true } }]
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getAudioTracks: () => tracks, getTracks: () => tracks }) } } })
const early = recorder("early:flight")
early.prewarmValue = true
early.urlValue = "/debriefs"
const requests = []
early.api = async (url, _body, method = "POST") => { requests.push(`${method} ${url}`); return { uuid: "reserved", url: "/debriefs/1" } }
let connected = 0
early.live = async () => { connected += 1; early.peer = { connectionState: "connected", close() {} } }
await early.connect()
await early.preparation
assert.equal(early.warm, true)
assert.equal(connected, 1)
assert.equal(tracks[0].enabled, false, "nothing is sent before the operator records")
assert.equal(early.element.dataset.state, "idle")
assert.deepEqual(requests, ["POST /debriefs"])
assert.equal((await early.store("get")).uuid, "reserved")
early.element.dispatchEvent = () => true
await early.dropSaved()
assert.equal(early.warm, false)
assert.equal(tracks[0].stopped, true)
assert.deepEqual(requests, ["POST /debriefs", "DELETE /debriefs/1"])
assert.equal(await early.store("get"), undefined)
// A reservation left by a closed page is released when the screen opens again.
await early.store("put", { uuid: "left-behind", parts: [], type: "", url: "/debriefs/2" })
const returning = recorder("early:flight")
returning.api = early.api
await returning.connect()
assert.equal(returning.element.dataset.state, "idle")
assert.equal(requests.at(-1), "DELETE /debriefs/2")
// Without microphone access the screen stays ready and the reservation is given back.
globalThis.navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError") }
const refused = recorder("refused:flight")
refused.prewarmValue = true
refused.urlValue = "/debriefs"
refused.api = early.api
await refused.connect()
await refused.preparation
assert.equal(refused.warm, false)
assert.equal(refused.saved, null)
assert.equal(requests.at(-1), "DELETE /debriefs/1")
early.database.close(); returning.database.close(); refused.database.close()
console.log("Early live connection, muted microphone and reservation release passed")

const controls = ["idle", "recording paused", "recovery", "busy"].map(states => ({ dataset: { debriefStates: states }, hidden: false }))
const pauseButton = { textContent: "" }
const ui = recorder("ui")
ui.element.querySelectorAll = () => controls
ui.element.querySelector = () => pauseButton
for (const state of ["idle", "recording", "paused", "busy", "recovery", "ready", "published"]) {
  ui.showState(state)
  assert.deepEqual(controls.map(control => !control.hidden), controls.map(control => control.dataset.debriefStates.split(" ").includes(state)))
  assert.equal(pauseButton.textContent, state === "paused" ? "Resume recording" : "Pause")
}

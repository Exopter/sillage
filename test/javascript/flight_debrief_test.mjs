import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { indexedDB } from "fake-indexeddb"

globalThis.indexedDB = indexedDB
const source = (await readFile(new URL("../../app/javascript/controllers/flight_debrief_controller.js", import.meta.url), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace(/const TypedController = .*$/m, "const TypedController = class {}")
const { default: Recorder } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const listeners = { addEventListener() {}, removeEventListener() {} }
globalThis.window = { ...listeners, setInterval, clearInterval, setTimeout }
globalThis.document = { ...listeners, visibilityState: "visible", querySelector: () => null }
function recorder(key) {
  const value = new Recorder()
  const events = []
  value.element = { dataset: {}, style: { setProperty() {} }, querySelectorAll: () => [], querySelector: () => null, events, dispatchEvent(event) { events.push(event.type); return true } }
  value.keyValue = key
  value.urlValue = "/debriefs"
  value.statusTarget = { textContent: "" }
  value.transcriptTarget = { textContent: "" }
  value.durationTarget = { textContent: "" }
  value.levelTarget = { value: 0 }
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
assert.equal(other.saved, null)
// A refused upload must preserve the original, including after a fresh controller opens.
reopened.api = async () => { throw Object.assign(new Error("not accepted"), { status: 422 }) }
await reopened.recover()
assert.equal(reopened.element.dataset.state, "recovery")
assert.equal(await (await reopened.store("get")).parts[0].text(), "original audio bytes")
assert.equal(reopened.statusTarget.textContent, "not accepted")
assert.deepEqual(reopened.element.events, [], "a refusal is not retried and audio that exists is never reported missing")
// Once the audio is stored and processing is requested, the device copy is released and the Pilot log refreshes.
const calls = []
let refreshed = 0
reopened.api = async (url) => { calls.push(url); return { url: "/debrief", status: "uploaded", audio: true } }
reopened.refreshLog = () => { refreshed += 1 }
await reopened.recover()
assert.deepEqual(calls.slice(-1), [ "/debrief/process_audio" ])
assert.equal(reopened.element.dataset.state, "published")
assert.equal(await reopened.store("get"), undefined)
assert.equal(refreshed, 1)
first.database.close(); reopened.database.close(); other.database.close()
console.log("Audio recovery, account isolation, refused upload preservation and automatic publication passed")

// A lost connection (FLT-2026-100, 17 November 2026: the audio never left the phone) is not an
// answer: the recording stays on the device and is sent again by itself until it is through.
const flaky = recorder("flaky:flight")
await flaky.connect()
await flaky.store("put", { uuid: "kept", parts: [original], type: "audio/webm", url: null })
flaky.saved = await flaky.store("get")
let attempts = 0
const sent = []
flaky.api = async (url) => {
  if (url === "/debriefs" && (attempts += 1) < 3) throw new TypeError("Load failed")
  sent.push(url)
  return { url: "/debriefs/9", status: url === "/debriefs" ? "recording" : "uploaded" }
}
flaky.wait = async () => { assert.equal((await flaky.store("get")).uuid, "kept", "the audio stays on the device between attempts") }
flaky.refreshLog = () => {}
await flaky.send()
assert.equal(attempts, 3)
assert.deepEqual(sent, ["/debriefs", "/debriefs/9/upload", "/debriefs/9/process_audio"])
assert.deepEqual(flaky.element.events, ["flight-debrief:waiting", "flight-debrief:waiting"])
assert.equal(flaky.element.dataset.state, "published")
assert.equal(await flaky.store("get"), undefined)
// A page that opens with a debrief still on the device sends it without being asked.
const resumed = recorder("resumed:flight")
resumed.autosendValue = true
resumed.api = async (url) => ({ url: "/debriefs/10", status: url === "/debriefs" ? "recording" : "uploaded" })
resumed.refreshLog = () => {}
await resumed.connect()
await resumed.store("put", { uuid: "left", parts: [original], type: "audio/webm", url: null })
resumed.database.close()
await resumed.connect()
while (resumed.sending) await new Promise(resolve => setTimeout(resolve, 5))
assert.equal(resumed.element.dataset.state, "published")
assert.equal(await resumed.store("get"), undefined)
flaky.database.close(); resumed.database.close()
console.log("Automatic resend after a lost connection and on return passed")

// Recording starts with the tap and never waits for the server: the reservation and the live
// transcription join in the background, and a server that cannot be reached costs neither.
const tracks = [{ enabled: true, stopped: false, stop() { this.stopped = true } }]
const stream = { getAudioTracks: () => tracks, getTracks: () => tracks }
let microphones = 0
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => { microphones += 1; return stream } } } })
globalThis.MediaRecorder = class {
  static isTypeSupported = () => true
  state = "inactive"
  mimeType = "audio/webm;codecs=opus"
  start() { this.state = "recording" }
  stop() { this.state = "inactive"; this.onstop?.() }
}
globalThis.AudioContext = class {
  state = "running"
  createAnalyser() { return { frequencyBinCount: 4, getByteTimeDomainData() {} } }
  createMediaStreamSource() { return { connect() {} } }
  async close() { this.state = "closed" }
}
const offline = recorder("offline:flight")
offline.api = async () => { throw new TypeError("Load failed") }
offline.wait = () => new Promise(() => {})
await offline.connect()
await offline.start()
assert.equal(offline.element.dataset.state, "recording", "the recorder runs with no server at all")
assert.equal(offline.recorder.state, "recording")
assert.match(offline.saved.uuid, /^[0-9a-f-]{36}$/)
offline.recorder.ondataavailable({ data: original })
await offline.writeQueue
assert.equal((await offline.store("get")).parts.length, 1, "the audio is on the device while it records")
await new Promise(resolve => setTimeout(resolve, 5))
assert.match(offline.statusTarget.textContent, /Recording on this phone/)
clearInterval(offline.meterTimer)
offline.database.close()

// The live connection opens with the screen. The microphone stays muted until the
// tap, and a connection that is never used gives its reservation back.
const early = recorder("early:flight")
early.prewarmValue = true
const requests = []
early.api = async (url, _body, method = "POST") => { requests.push(`${method} ${url}`); return { uuid: "reserved", url: "/debriefs/1" } }
let connected = 0
early.live = async () => { connected += 1; early.liveStream = early.stream; early.peer = { connectionState: "connected", close() {} } }
microphones = 0
await early.connect()
await early.preparation
assert.equal(early.warm, true)
assert.equal(connected, 1)
assert.equal(tracks[0].enabled, false, "nothing is sent before the operator records")
assert.equal(early.element.dataset.state, "idle")
assert.deepEqual(requests, ["POST /debriefs"])
assert.equal(await early.store("get"), undefined, "nothing is kept on the device before a recording exists")
// The tap reuses the open microphone and connection: no second request of either kind.
await early.start()
assert.equal(tracks[0].enabled, true)
assert.equal(microphones, 1)
await new Promise(resolve => setTimeout(resolve, 5))
assert.equal(connected, 1)
assert.deepEqual(requests, ["POST /debriefs"])
assert.equal(early.saved.url, "/debriefs/1")
// Skipping gives the reservation back and leaves nothing on the device.
early.abandoned = true
early.recorder.stop()
while (early.element.dataset.state !== "idle") await new Promise(resolve => setTimeout(resolve, 20))
assert.equal(tracks[0].stopped, true)
assert.deepEqual(requests, ["POST /debriefs", "DELETE /debriefs/1"])
assert.equal(await early.store("get"), undefined)
assert.deepEqual(early.element.events, ["flight-debrief:abandoned"])
// An entry with nothing recorded, left by a closed page, is dropped on this device only:
// it never deletes a reservation another screen may be using.
await early.store("put", { uuid: "left-behind", parts: [], type: "", url: "/debriefs/2" })
const returning = recorder("early:flight")
returning.api = early.api
await returning.connect()
assert.equal(returning.element.dataset.state, "idle")
assert.equal(await returning.store("get"), undefined)
assert.equal(requests.at(-1), "DELETE /debriefs/1")
// Without microphone access the screen stays ready and says why on the tap.
globalThis.navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError") }
const refused = recorder("refused:flight")
refused.prewarmValue = true
refused.api = early.api
await refused.connect()
await refused.preparation
assert.equal(refused.warm, false)
assert.equal(refused.saved, null)
await refused.start()
assert.equal(refused.element.dataset.state, "idle")
assert.match(refused.statusTarget.textContent, /Microphone access is blocked/)
// A refusal is not remembered: once access is given, the next tap records.
globalThis.navigator.mediaDevices.getUserMedia = async () => stream
refused.link = async () => {}
await refused.start()
assert.equal(refused.element.dataset.state, "recording")
clearInterval(refused.meterTimer)
early.database.close(); returning.database.close(); refused.database.close()
console.log("Immediate local recording, early live connection, muted microphone and reservation release passed")

// FLT-2026-100 and 105 (17 November 2026): the tap that ends the debrief must send it even when
// the recorder was interrupted and never reports its stop, and when closing audio never completes.
const stalled = recorder("stalled:flight")
stalled.wait = () => new Promise(() => {})
await stalled.connect()
globalThis.navigator.mediaDevices.getUserMedia = async () => stream
stalled.link = async () => {}
await stalled.start()
stalled.recorder.ondataavailable({ data: original })
stalled.recorder.stop = function () { this.state = "inactive" }
stalled.audioContext.close = () => new Promise(() => {})
const delivered = []
stalled.api = async (url) => { delivered.push(url); return { url: "/debriefs/11", audio: url !== "/debriefs" } }
stalled.refreshLog = () => {}
stalled.stop()
stalled.stop()
while (stalled.element.dataset.state !== "published") await new Promise(resolve => setTimeout(resolve, 20))
assert.deepEqual(delivered, ["/debriefs", "/debriefs/11/upload", "/debriefs/11/live", "/debriefs/11/process_audio"].filter(url => !url.endsWith("/live")))
// A recorder the system stopped while the screen still said "recording" is saved and sent on return.
const interrupted = recorder("interrupted:flight")
interrupted.wait = () => new Promise(() => {})
await interrupted.connect()
interrupted.link = async () => {}
await interrupted.start()
interrupted.recorder.ondataavailable({ data: original })
interrupted.recorder.state = "inactive"
interrupted.api = async (url) => ({ url: "/debriefs/12", audio: url !== "/debriefs" })
interrupted.refreshLog = () => {}
interrupted.kick()
while (interrupted.element.dataset.state !== "published") await new Promise(resolve => setTimeout(resolve, 20))
// A debrief the server already wrote from the live words still receives its audio.
const late = recorder("late:flight")
await late.connect()
late.saved = { uuid: "late", parts: [original], type: "audio/webm", url: null }
const lateCalls = []
late.api = async (url) => { lateCalls.push(url); return { url: "/debriefs/13", status: "published", audio: false } }
late.refreshLog = () => {}
await late.send()
assert.deepEqual(lateCalls, ["/debriefs", "/debriefs/13/upload", "/debriefs/13/process_audio"])
// FLT-2026-111: a recording resent by a reopened page carries the ticks saved with it.
const ticks = recorder("ticks:flight")
await ticks.connect()
ticks.element.dataset.checklist = "{}"
ticks.saved = { uuid: "ticks", parts: [original], type: "audio/webm", url: null, checklist: { cg: "5", feelings: "Noted" } }
let processed = null
ticks.api = async (url, body) => { if (url.endsWith("process_audio")) processed = body; return { url: "/debriefs/14", audio: true } }
ticks.refreshLog = () => {}
await ticks.send()
assert.deepEqual(processed.checklist, { cg: "5", feelings: "Noted" })
ticks.database.close()
stalled.database.close(); interrupted.database.close(); late.database.close()
console.log("Send after an interrupted or silent recorder and late audio passed")

// What is heard live is handed to the server while recording, a few seconds apart, so a
// debrief whose audio never arrives still has its words (FLT-2026-100).
const heard = recorder("heard")
const kept = []
heard.api = async (url, body) => { kept.push([url, body.transcript]) }
heard.turns.set("a", "Glide ratio 3.5")
heard.keepLive()
assert.deepEqual(kept, [], "nothing is sent before the server knows the recording")
heard.debriefUrl = "/debriefs/7"
heard.keepLive()
heard.turns.set("b", "speed 150")
heard.keepLive()
assert.deepEqual(kept, [["/debriefs/7/live", "Glide ratio 3.5"]], "sends are spaced")
heard.keepLive(true)
heard.keepLive(true)
assert.deepEqual(kept.at(-1), ["/debriefs/7/live", "Glide ratio 3.5\nspeed 150"])
assert.equal(kept.length, 2, "the same words are not sent twice")
console.log("Live transcript kept on the server passed")

// A send needs a real pause: a short breath inside a figure no longer cuts the phrase.
const pacing = recorder("pacing")
const commits = []
pacing.channel = { readyState: "open", send: message => commits.push(JSON.parse(message).type) }
pacing.recorder = { state: "recording" }
pacing.floor = 0.02
const hear = (level, from, to) => { for (let now = from; now < to; now += 200) pacing.phrase(level, now) }
hear(0.5, 1000, 2000); hear(0.02, 2000, 2600); hear(0.5, 2600, 3400)
assert.deepEqual(commits, [], "600 ms of quiet inside a sentence is not a pause")
hear(0.02, 3400, 4600)
assert.deepEqual(commits, ["input_audio_buffer.commit"])
hear(0.5, 4600, 13000)
assert.equal(commits.length, 2, "speech without a pause is sent after eight seconds")
console.log("Phrase pacing passed")

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

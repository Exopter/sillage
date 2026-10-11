import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
const connectionURL = new URL("../../app/javascript/lib/aircraft_connection.js", import.meta.url).href
const source = readFileSync(new URL("../../app/javascript/controllers/signal_workspace_controller.js", import.meta.url), "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/const TypedController = .*$/m, "const TypedController = class {}")
import {ImuHealth} from "../../app/javascript/lib/imu_health.js"
import {SignalTelemetry} from "../../app/javascript/lib/signal_telemetry.js"
globalThis.window = { location: {href: "https://example.com/signal"} }
globalThis.history = {state: null}
const requests = []
const metadata = []
const writes = []
globalThis.signalLifecycleDependencies = {
  ImuHealth, SignalTelemetry,
  openDatabase: () => new Promise((resolve, reject) => requests.push({resolve, reject})),
  readMetadata: () => new Promise((resolve) => metadata.push(resolve)),
  writeMetadata: async (_database, key, value) => writes.push({key, value}),
  registerUsbPageRelease: () => () => {},
  SignalMap: class { start() {} }
}
const prelude = "const {ImuHealth, SignalTelemetry, openDatabase, readMetadata, writeMetadata, registerUsbPageRelease, SignalMap} = globalThis.signalLifecycleDependencies;\n"
const {default: Workspace} = await import(`data:text/javascript;base64,${Buffer.from(`import {observeRecorderConnection, forgetRecorderConnection} from "${connectionURL}";\n` + prelude + source).toString("base64")}`)
const tick = () => new Promise((resolve) => setImmediate(resolve))
let closed = 0
const database = {close() {closed += 1}}
const view = new Workspace()
view.sessionValue = "session"
view.showWarning = (message) => {throw new Error(message)}
const disconnected = view.connect()
view.connectionGeneration = null
requests.shift().resolve(database)
await disconnected
assert.equal(closed, 1)
assert.equal(view.db, null)

const stale = view.connect()
requests.shift().resolve(database)
await tick()
assert.equal(metadata.length, 3)
view.connectionGeneration = Symbol("new connection")
view.nextSequence = 42
metadata.shift()(1)
metadata.shift()("ended")
metadata.shift()(undefined)
await stale
assert.equal(closed, 2)
assert.equal(view.nextSequence, 42, "old metadata cannot overwrite the new connection")
assert.equal(view.ended, false)

const failed = view.connect()
view.connectionGeneration = null
requests.shift().reject(new Error("storage unavailable"))
await failed
console.log("Signal delayed storage, stale metadata and disconnected failure tests passed")

// Restoring an active acquisition resumes it without asking for an exit decision.
Object.assign(window, {addEventListener() {}, setInterval() {return 1}})
globalThis.document = {addEventListener() {}}
let navigationType = "reload"
Object.defineProperty(globalThis, "performance", {configurable: true, value: {getEntriesByType: () => [{type: navigationType}]}})
async function resume({review = false, disposition = null, endedAt = null} = {}) {
  let reconnected = 0, prompted = 0
  const restored = new Workspace()
  Object.assign(restored, {
    sessionValue: "session", reviewValue: review, connectButtonTarget: {},
    restoreLayout() {}, refreshTelemetry() {}, prepareLocalStorage: async () => {}, flushOutbox: async () => {},
    autoReconnect: async () => {reconnected++}, requestExit() {prompted++}
  })
  const connecting = restored.connect()
  requests.shift().resolve(database)
  await tick()
  metadata.shift()(42)
  metadata.shift()(endedAt)
  metadata.shift()({active: !endedAt, disposition})
  await connecting
  return {restored, reconnected, prompted}
}
const resumed = await resume()
assert.equal(resumed.reconnected, 1)
assert.equal(resumed.prompted, 0)
assert.equal(resumed.restored.sessionValue, "session")
assert.equal(resumed.restored.nextSequence, 42, "refresh preserves the capture batch sequence")
assert.equal(resumed.restored.ended, false)
assert.deepEqual(writes.at(-1), {key: "session:recovery", value: {active: true, disposition: null}})
const reviewedReload = await resume({review: true})
assert.equal(reviewedReload.reconnected, 1)
assert.equal(reviewedReload.prompted, 0, "refresh resumes even when the original URL requested a review")
navigationType = "navigate"
const explicitReview = await resume({review: true})
assert.equal(explicitReview.prompted, 1, "explicit review from Signal home keeps the save/discard choice")
assert.equal(explicitReview.reconnected, 0)
for (const disposition of ["save", "discard"]) {
  navigationType = "reload"
  const finalizing = await resume({disposition, endedAt: "2026-10-11T17:00:00Z"})
  assert.equal(finalizing.reconnected, 0, "an interrupted completion must not restart acquisition")
  assert.equal(finalizing.prompted, 1)
  assert.equal(finalizing.restored.completionDisposition, disposition)
  assert.equal(finalizing.restored.ended, true)
}
console.log("Signal refresh continuation, explicit review and interrupted completion tests passed")

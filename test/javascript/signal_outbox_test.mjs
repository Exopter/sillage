import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const connectionURL = new URL("../../app/javascript/lib/aircraft_connection.js", import.meta.url).href
const source = (await readFile(new URL("../../app/javascript/controllers/signal_workspace_controller.js", import.meta.url), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace("extends Controller", "extends class {}")
  .replace(/const TypedController = .*$/m, "const TypedController = class {}")
const outboxURL = new URL("../../app/javascript/lib/signal_outbox.js", import.meta.url).href
const healthURL = new URL("../../app/javascript/lib/imu_health.js", import.meta.url).href
const telemetryURL = new URL("../../app/javascript/lib/signal_telemetry.js", import.meta.url).href
const { transactionRequest } = await import(outboxURL)
const { default: Workspace } = await import(`data:text/javascript;base64,${Buffer.from(`import {ImuHealth} from "${healthURL}";\nimport { SignalTelemetry } from "${telemetryURL}"\nimport { OUTBOX_STORE, META_STORE, transactionRequest, putOutbox, readOutbox, oldestOutbox, deleteOutbox, readMetadata, writeMetadata, writeOutbox } from "${outboxURL}"\nimport {observeRecorderConnection, forgetRecorderConnection} from "${connectionURL}";\n${source}`).toString("base64")}`)
globalThis.IDBKeyRange = { bound: () => ({}) }
const tick = () => new Promise((resolve) => setImmediate(resolve))

// Drive request success and transaction completion separately, including a late abort.
class Database {
  transactions = []
  values = { outbox: new Map(), metadata: new Map() }
  transaction(names) {
    const changes = []
    const transaction = {
      names,
      changes,
      objectStore: (name) => ({
        get: (key) => ({ result: this.values[name].get(key) }),
        put: (record) => {
          changes.push({ name, record })
          return { result: record.id || record.key }
        },
        index: () => ({
          getAll: () => ({ result: [...this.values[name].values()] }),
          get: () => ({ result: [...this.values[name].values()][0] })
        }),
        delete: (key) => { changes.push({ name, key }); return {} }
      }),
      commit: () => {
        for (const { name, record, key } of changes) {
          if (record) this.values[name].set(record.id || record.key, record)
          else this.values[name].delete(key)
        }
        transaction.oncomplete()
      },
      abort: () => transaction.onabort()
    }
    this.transactions.push(transaction)
    if (this.autoCommit) queueMicrotask(() => transaction.commit())
    return transaction
  }
}

const database = new Database()
let settled = false
const write = transactionRequest(database, "outbox", "readwrite", (store) => store.put({ id: "first" }))
write.then(() => { settled = true }, () => { settled = true })
await tick()
assert.equal(settled, false, "request success is not a durable write")
database.transactions[0].error = new Error("QuotaExceededError")
database.transactions[0].abort()
await assert.rejects(write, /QuotaExceededError/)
assert.equal(database.values.outbox.size, 0)

function workspace() {
  return Object.assign(new Workspace(), {
    db: new Database(), sessionValue: "session", batchUrlValue: "/batch", completeUrlValue: "/complete",
    pendingSamples: [], nextSequence: 0, ended: false, ending: false, telemetry: {},
    connectButtonTarget: {}, dataStatusTarget: {}, showWarning(message) { throw new Error(message) }, async flushOutbox() {}
  })
}

const capture = workspace()
const firstSample = { recorded_at: "2026-09-05T10:00:00Z" }
const lastSample = { recorded_at: "2026-09-05T10:00:01Z" }
capture.pendingSamples.push(firstSample)
const first = capture.queuePendingBatch()
const rejected = assert.rejects(first, /aborted/)
await tick()
capture.pendingSamples.push(lastSample)
const second = capture.queuePendingBatch()
assert.equal(capture.db.transactions.length, 1, "batch writes must serialize")
capture.db.transactions[0].abort()
await rejected
await tick()
assert.equal(capture.nextSequence, 0, "a failed transaction must not consume a sequence")
const retry = capture.db.transactions[1]
assert.deepEqual(retry.names, ["outbox", "metadata"])
retry.commit()
await second
assert.equal(capture.nextSequence, 1)
assert.deepEqual(capture.db.values.outbox.get("session:batch:0").body.samples, [firstSample, lastSample])
assert.equal(capture.db.values.metadata.get("session:next-sequence").value, 1)

const navigations = []
globalThis.window = { confirm: () => true, location: {assign: url => navigations.push(url)} }
const ending = workspace()
let drained = false
ending.stopSerial = async () => {
  await tick()
  ending.pendingSamples.push(lastSample)
  drained = true
}
let flushed = false
ending.flushOutbox = async () => { flushed = true }
const completion = ending.finishSession("save")
await tick()
await tick()
assert.equal(drained, true)
assert.equal(flushed, false)
assert.equal(ending.db.transactions.length, 1)
ending.db.transactions[0].commit()
await tick()
assert.equal(ending.ended, false, "completion is not committed yet")
assert.deepEqual(navigations, [], "navigation must wait for durable capture completion")
assert.equal(ending.db.transactions[1].changes.find(({ name }) => name === "outbox").record.kind, "complete")
ending.db.transactions[1].commit()
await completion
assert.equal(ending.ended, true)
assert.equal(flushed, true)
assert.ok(ending.db.values.metadata.get("session:ended-at").value)
assert.deepEqual(ending.db.values.outbox.get("session:batch:0").body.samples, [lastSample])

const failedEnd = workspace()
failedEnd.pendingSamples.push(lastSample)
failedEnd.stopSerial = async () => {}
const warnings = []
failedEnd.showWarning = (message) => warnings.push(message)
const abortedEnd = failedEnd.finishSession("save")
await tick()
failedEnd.db.transactions[0].abort()
await abortedEnd
assert.equal(failedEnd.ended, false)
assert.deepEqual(failedEnd.pendingSamples, [lastSample])
assert.equal(failedEnd.db.values.outbox.size, 0)
assert.equal(warnings.length, 1)

const retriedEnd = failedEnd.finishSession("save")
await tick()
failedEnd.db.transactions[1].commit()
await tick()
failedEnd.db.transactions[2].abort()
await retriedEnd
assert.equal(failedEnd.ended, false)
assert.equal(failedEnd.nextSequence, 1)
assert.equal(failedEnd.db.values.outbox.size, 1, "the committed final batch must survive a completion failure")
assert.equal(failedEnd.db.values.metadata.has("session:ended-at"), false)

const finalRetry = failedEnd.finishSession("save")
await tick()
failedEnd.db.transactions[3].commit()
await finalRetry
assert.equal(failedEnd.ended, true)
assert.equal(failedEnd.db.values.outbox.size, 2, "retry must reuse the final batch instead of duplicating it")

Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true })
globalThis.document = { querySelector: () => null }
const cloud = workspace()
delete cloud.flushOutbox
cloud.cloudStatusTarget = {}
cloud.db.autoCommit = true
cloud.db.values.outbox.set("bad", {
  id: "bad", session: "session", kind: "batch", sequence: 7, url: "/batch", method: "POST", body: {sequence:7,first_received_at:"2026-09-06T10:00:00Z",last_received_at:"2026-09-06T10:00:00Z",samples:[]}, queuedAt: Date.now()
})
globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ error: "samples[1].latitude must be a finite number" }) })
await cloud.flushOutbox()
assert.match(cloud.cloudStatusTarget.textContent, /Sync blocked: Batch 7: samples\[1\]\.latitude/)
assert.equal(cloud.db.values.outbox.size, 1, "a rejected batch must stay in the durable outbox")
globalThis.fetch = async () => ({ ok: true })
await cloud.flushOutbox()
assert.equal(cloud.db.values.outbox.size, 0)
assert.equal(cloud.cloudError, null)
assert.equal(cloud.cloudStatusTarget.textContent, "Live")
// End session returns home only after the server has acknowledged every queued record.
cloud.ended = true
cloud.returnHomeAfterSync = true
cloud.homeUrlValue = "/signal?view=home"
cloud.db.values.outbox.set("completion", {
  id:"completion", session:"session", kind:"complete", url:"/complete", method:"PATCH", body:{ended_at:new Date().toISOString()}, queuedAt:Date.now()
})
let finishCompletion
fetch = async () => new Promise(resolve => { finishCompletion = resolve })
const pendingCompletion = cloud.flushOutbox()
await tick()
await cloud.refreshCloudStatus()
assert.deepEqual(navigations, [], "an in-flight completion must not be abandoned by navigation")
finishCompletion({ok:false,status:503,json:async () => ({error:"Temporarily unavailable"})})
await pendingCompletion
assert.deepEqual(navigations, [], "failed synchronization keeps the retry page open")
assert.equal(cloud.returnHomeAfterSync, true)
fetch = async () => ({ok:true})
await cloud.flushOutbox()
assert.deepEqual(navigations, ["/signal?view=home"])
await cloud.refreshCloudStatus()
assert.equal(navigations.length, 1, "completion triggers a single navigation")

const quality = workspace()
quality.db.autoCommit = true
quality.eventUrlValue = "/events"
quality.imuHealth.quality = {deviceId:"ECU-A172E0",bootId:42,imuEpoch:1,firmware:"fdr_integrated/56"}
await quality.recordQualityEvent("Magnetic disturbance", ["magnetic_disturbance"], 17)
assert.equal(quality.db.values.metadata.get("imu-check:17:invalidated").value, true)
assert.equal(quality.db.values.outbox.size, 1, "invalidation remains queued while cloud sync is unavailable")
const reloaded = workspace()
reloaded.db = quality.db
reloaded.imuHealth.quality = quality.imuHealth.quality
let checkId = 17
globalThis.fetch = async () => ({ok:true,json:async()=>({preflight:{id:checkId,outcome:"passed",boot_id:42,imu_epoch:1,firmware:"fdr_integrated/56"}})})
await reloaded.loadQualityContext("ECU-A172E0/42/1/fdr_integrated/56")
assert.equal(reloaded.preflightInvalidated, true, "a stale cloud response cannot revive an invalidated preflight after reload")
checkId = 18
await reloaded.loadQualityContext("ECU-A172E0/42/1/fdr_integrated/56")
assert.equal(reloaded.preflightInvalidated, false, "a new preflight can replace the invalidated check")
console.log("Signal outbox durability, preflight invalidation and shutdown tests passed")

const advisory = workspace()
advisory.db.autoCommit = true
advisory.eventUrlValue = "/events"
advisory.imuHealth.quality = quality.imuHealth.quality
await advisory.recordQualityEvent("Gyroscope manufacturer status 0/3", [], undefined, ["Gyroscope manufacturer status 0/3"])
const warning = [...advisory.db.values.outbox.values()][0]
assert.equal(warning.body.event_type,"warning")
assert.equal(warning.body.metadata.invalidate_preflight_id,null)
assert.equal(warning.body.metadata.warnings.length,1)
assert.equal(advisory.db.values.metadata.size,0,"an advisory does not persist a preflight invalidation")

// Asking to leave is reversible and must not stop capture before a decision.
const prompt = workspace()
prompt.db.autoCommit = true
prompt.hasExitDialogTarget = true
prompt.exitActionTargets = []
prompt.homeUrlValue = "/signal?view=home"
prompt.exitErrorTarget = {}
prompt.exitStatusTarget = {}
prompt.exitDialogTarget = {open: false, showModal() {this.open = true}, close() {this.open = false}}
prompt.autoReconnect = async () => {}
prompt.pendingSamples = [firstSample]
prompt.endSession()
assert.equal(prompt.exitDialogTarget.open, true)
assert.equal(prompt.ended, false)
assert.equal(prompt.pendingSamples.length, 1)
prompt.continueSession()
assert.equal(prompt.exitDialogTarget.open, false)
assert.equal(prompt.pendingSamples.length, 1)
let prevented = 0
prompt.interceptVisit({preventDefault() {prevented++}, detail: {url: "/flights"}})
assert.equal(prevented, 1)
assert.equal(prompt.exitDestination, "/flights")
prompt.continueSession()
const unload = {preventDefault() {prevented++}}
prompt.warnBeforeUnload(unload)
assert.equal(prevented, 2, "closing an unassigned session is guarded even without a connected radio")
assert.equal(unload.returnValue, "")
assert.equal(prompt.exitDialogTarget.open, false, "the native warning must not open the save dialog behind it")
assert.equal(prompt.ended, false, "cancelling the browser warning keeps the session active")
assert.equal(prompt.pendingSamples.length, 1)
assert.equal(prompt.exitDestination, "")
prompt.leaving = true
prompt.warnBeforeUnload({preventDefault() {prevented++}})
assert.equal(prevented, 2, "an acknowledged exit does not trigger another browser warning")

// Discard must be durable before deleting the local raw capture, and an offline
// decision must retain both its queue record and raw file until it can finish.
const discard = workspace()
discard.db.autoCommit = true
discard.flightCodeValue = "UNASSIGNED"
discard.homeUrlValue = "/signal?view=home"
discard.stopSerial = async () => {}
discard.cloudStatusTarget = {}
discard.flushOutbox = Workspace.prototype.flushOutbox
const removed = []
navigator.storage = {getDirectory: async () => ({removeEntry: async name => removed.push(name)})}
navigator.onLine = false
await discard.finishSession("discard")
assert.equal(discard.db.values.outbox.get("session:complete").body.disposition, "discard")
assert.equal(discard.db.values.metadata.get("session:recovery").value.disposition, "discard")
assert.deepEqual(removed, [])
navigator.onLine = true
fetch = async () => ({ok:true})
await discard.flushOutbox()
assert.deepEqual(removed, ["UNASSIGNED-session.mavcap"])
assert.equal(discard.db.values.outbox.size, 0)
assert.deepEqual(discard.db.values.metadata.get("session:recovery").value, {active:false})

// Logout is a form submission: do not invalidate authentication before the
// acquisition and its completion have been acknowledged.
globalThis.HTMLFormElement = class {}
let submissions = 0
const logout = Object.assign(new HTMLFormElement(), {method: "post", target: "", requestSubmit() {submissions++}})
prompt.leaving = false
prompt.pendingSamples = []
prompt.interceptSubmit({target: logout, submitter: null, preventDefault() {}, stopImmediatePropagation() {}})
assert.equal(prompt.exitDialogTarget.open, true)
assert.equal(submissions, 0)
prompt.continueSession()
assert.equal(prompt.exitForm, null)
prompt.interceptSubmit({target: logout, submitter: null, preventDefault() {}, stopImmediatePropagation() {}})
prompt.stopSerial = async () => {}
prompt.cloudStatusTarget = {}
prompt.flushOutbox = Workspace.prototype.flushOutbox
navigator.onLine = false
await prompt.finishSession("save")
assert.equal(submissions, 0, "offline completion must keep the authenticated page open")
navigator.onLine = true
await prompt.flushOutbox()
assert.equal(submissions, 1, "submit logout only after completion is acknowledged")
console.log("Signal exit decisions, navigation protection and acknowledged discard tests passed")

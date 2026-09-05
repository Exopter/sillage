import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/signal_workspace_controller.js", import.meta.url), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace("extends Controller", "extends class {}")
const { default: Workspace, transactionRequest } = await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { transactionRequest }`).toString("base64")}`)
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
        put: (record) => {
          changes.push({ name, record })
          return { result: record.id || record.key }
        },
        getAll: () => ({ result: [...this.values[name].values()] }),
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
    dataStatusTarget: {}, showWarning(message) { throw new Error(message) }, async flushOutbox() {}
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

globalThis.window = { confirm: () => true }
const ending = workspace()
let drained = false
ending.stopSerial = async () => {
  await tick()
  ending.pendingSamples.push(lastSample)
  drained = true
}
let flushed = false
ending.flushOutbox = async () => { flushed = true }
const completion = ending.endSession()
await tick()
await tick()
assert.equal(drained, true)
assert.equal(flushed, false)
assert.equal(ending.db.transactions.length, 1)
ending.db.transactions[0].commit()
await tick()
assert.equal(ending.ended, false, "completion is not committed yet")
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
const abortedEnd = failedEnd.endSession()
await tick()
failedEnd.db.transactions[0].abort()
await abortedEnd
assert.equal(failedEnd.ended, false)
assert.deepEqual(failedEnd.pendingSamples, [lastSample])
assert.equal(failedEnd.db.values.outbox.size, 0)
assert.equal(warnings.length, 1)

const retriedEnd = failedEnd.endSession()
await tick()
failedEnd.db.transactions[1].commit()
await tick()
failedEnd.db.transactions[2].abort()
await retriedEnd
assert.equal(failedEnd.ended, false)
assert.equal(failedEnd.nextSequence, 1)
assert.equal(failedEnd.db.values.outbox.size, 1, "the committed final batch must survive a completion failure")
assert.equal(failedEnd.db.values.metadata.has("session:ended-at"), false)

const finalRetry = failedEnd.endSession()
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
  id: "bad", session: "session", kind: "batch", sequence: 7, url: "/batch", method: "POST", body: {}, queuedAt: Date.now()
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
console.log("Signal outbox durability and shutdown tests passed")

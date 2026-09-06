import assert from "node:assert/strict"
import "fake-indexeddb/auto"
import { openDatabase, readOutbox, oldestOutbox, deleteOutbox, writeOutbox, transactionRequest, OUTBOX_STORE } from "../../app/javascript/lib/signal_outbox.js"

// Upgrade an actual v1 database with interleaved sessions and lexically misleading sequences.
const old = await new Promise((resolve, reject) => {
  const request = indexedDB.open("sillage-signal-v1", 1)
  request.onupgradeneeded = () => {
    request.result.createObjectStore("outbox", { keyPath: "id" })
    request.result.createObjectStore("metadata", { keyPath: "key" })
  }
  request.onerror = () => reject(request.error)
  request.onsuccess = () => resolve(request.result)
})
await new Promise((resolve) => {
  const tx = old.transaction("outbox", "readwrite")
  for (const session of ["first", "second"]) {
    for (let sequence = 99; sequence >= 0; sequence--) {
      tx.objectStore("outbox").put({ id: `${session}:batch:${sequence}`, session, kind: "batch", sequence, method:"POST", url:"/batch", body:{sequence,first_received_at:"2026-09-06T10:00:00Z",last_received_at:"2026-09-06T10:00:00Z",samples:[]}, queuedAt: 100 + sequence })
    }
    tx.objectStore("outbox").put({ id: `${session}:complete`, session, kind: "complete", method:"PATCH",url:"/complete",body:{ended_at:"2026-09-06T10:00:00Z"}, queuedAt: 1 })
    tx.objectStore("outbox").put({ id: `${session}:event`, session, kind: "event", method:"POST",url:"/event",body:{event_uuid:"id",event_type:"marker",occurred_at:"2026-09-06T10:00:00Z",label:"Marker",metadata:{}}, queuedAt: 2 })
  }
  tx.oncomplete = resolve
})
old.close()
const db = await openDatabase()
const first = await readOutbox(db, "first")
assert.equal(first.length, 64)
assert.deepEqual(first.map((record) => record.sequence), Array.from({ length: 64 }, (_, index) => index))
assert.equal((await oldestOutbox(db, "first")).queuedAt, 1)
for (const record of first) await deleteOutbox(db, record.id)
const last = await readOutbox(db, "first")
assert.equal(last.length, 38)
assert.equal(last.at(-2).kind, "event")
assert.equal(last.at(-1).kind, "complete")
assert.equal((await readOutbox(db, "second")).length, 64)
const corrupt = {id: "corrupt", session: "invalid", kind: "batch", method: "POST", url: "/batch", sequence: 0, queuedAt: 1,
  body: {sequence: 0, first_received_at: "2026-09-06T00:00:00Z", last_received_at: "2026-09-06T00:00:00Z", samples: [{kind: "gps", recorded_at: "now", latitude: NaN, longitude: 1}]}}
await writeOutbox(db, corrupt)
await assert.rejects(readOutbox(db, "invalid"), /data has been retained/)
assert.equal((await transactionRequest(db, OUTBOX_STORE, "readonly", (store) => store.get("corrupt"))).id, "corrupt")
db.close()
console.log("Signal outbox migration, session index, bounded batches and completion order passed")

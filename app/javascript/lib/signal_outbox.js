export const OUTBOX_STORE = "outbox"
export const META_STORE = "metadata"
const DATABASE_NAME = "sillage-signal-v1"
const DATABASE_VERSION = 2

/** @typedef {import("../types/signal").OutboxRecord} OutboxRecord */

/** @param {IDBObjectStore} store @param {OutboxRecord} record */
export function putOutbox(store, record) {
  const rank = { batch: 0, event: 1, complete: 2 }
  return store.put({ ...record, order: [record.session, rank[record.kind], record.kind === "batch" ? record.sequence : 0, record.queuedAt, record.id] })
}

/** @returns {Promise<IDBDatabase>} */
export function openDatabase() {
  return new Promise((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      const store = database.objectStoreNames.contains(OUTBOX_STORE)
        ? (/** @type {IDBTransaction} */ (request.transaction)).objectStore(OUTBOX_STORE)
        : database.createObjectStore(OUTBOX_STORE, { keyPath: "id" })
      store.createIndex("order", "order")
      store.createIndex("age", ["session", "queuedAt"])
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        if (!cursor.result) return
        putOutbox(store, cursor.result.value)
        cursor.result.continue()
      }
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: "key" })
    }
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error("Close other Signal tabs and reload to upgrade local storage."))
    }
  })
}

/** @param {string} session */
function sessionRange(session) { return IDBKeyRange.bound([session], [session, []]) }

/** @param {IDBDatabase} database @param {OutboxRecord} record */
export function writeOutbox(database, record) { return transactionRequest(database, OUTBOX_STORE, "readwrite", (store) => putOutbox(store, record)) }
/** @param {IDBDatabase} database @param {string} id */
export function deleteOutbox(database, id) { return transactionRequest(database, OUTBOX_STORE, "readwrite", (store) => store.delete(id)) }
/** @param {IDBDatabase} database @param {string} session @returns {Promise<OutboxRecord[]>} */
export async function readOutbox(database, session) {
  const records = await transactionRequest(database, OUTBOX_STORE, "readonly", (store) => store.index("order").getAll(sessionRange(session), 64))
  return records.map(parseOutboxRecord)
}
/** @param {IDBDatabase} database @param {string} session @returns {Promise<{queuedAt:number} | undefined>} */
export async function oldestOutbox(database, session) {
  const record = await transactionRequest(database, OUTBOX_STORE, "readonly", (store) => store.index("age").get(sessionRange(session)))
  if (record === undefined) return undefined
  if (!isObject(record) || typeof record.queuedAt !== "number" || !Number.isFinite(record.queuedAt)) throw new Error("Invalid local Signal queue timestamp.")
  return {queuedAt: record.queuedAt}
}
/** @param {IDBDatabase} database @param {string} key @param {unknown} value */
export function writeMetadata(database, key, value) { return transactionRequest(database, META_STORE, "readwrite", (store) => store.put({ key, value })) }
/** @param {IDBDatabase} database @param {string} key @returns {Promise<unknown>} */
export async function readMetadata(database, key) {
  const record = await transactionRequest(database, META_STORE, "readonly", (store) => store.get(key))
  return isObject(record) ? record.value : undefined
}

/** @template T @param {IDBDatabase} database @param {string | string[]} storeName @param {IDBTransactionMode} mode @param {(store: IDBObjectStore, transaction: IDBTransaction) => IDBRequest<T>} operation @returns {Promise<T>} */
export function transactionRequest(database, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    /** @type {IDBRequest<T>} */
    let request
    transaction.oncomplete = () => resolve(request?.result)
    transaction.onabort = () => reject(transaction.error || new Error("Local storage transaction aborted"))
    try {
      request = operation(transaction.objectStore(Array.isArray(storeName) ? storeName[0] : storeName), transaction)
    } catch (error) {
      transaction.abort()
      reject(error)
    }
  })
}

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) }

/** @param {unknown} value @returns {OutboxRecord} */
export function parseOutboxRecord(value) {
  const invalid = () => { throw new Error("A local Signal record is invalid. Its data has been retained; export the capture before clearing browser storage.") }
  if (!isObject(value) || ![value.id, value.session, value.url].every((field) => typeof field === "string" && field.length > 0)
      || typeof value.queuedAt !== "number" || !Number.isFinite(value.queuedAt) || !isObject(value.body)) return invalid()
  const body = value.body
  if (value.kind === "batch") {
    if (![body.mavlink_system_id, body.mavlink_component_id].every((id) => id == null || typeof id === "string")
        || (body.position != null && (!isObject(body.position) || !finiteNumber(body.position.latitude) || !finiteNumber(body.position.longitude)))) return invalid()
    if (value.method !== "POST" || typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0
        || body.sequence !== value.sequence || typeof body.first_received_at !== "string" || typeof body.last_received_at !== "string"
        || !Array.isArray(body.samples) || !body.samples.every((sample) => isObject(sample) && typeof sample.recorded_at === "string" && (
          sample.kind === "gps" ? finiteNumber(sample.latitude) && Math.abs(sample.latitude) <= 90 && finiteNumber(sample.longitude) && Math.abs(sample.longitude) <= 180
            && ["altitude_m", "horizontal_accuracy_m", "vertical_accuracy_m", "horizontal_speed_mps", "heading_deg", "gps_fix", "satellite_count"].every((key) => sample[key] === undefined || finiteNumber(sample[key]))
            : sample.kind === "sensor" && typeof sample.sensor_type === "string" && isObject(sample.readings)
        ))) return invalid()
  } else if (value.kind === "event") {
    if (value.method !== "POST" || ![body.event_uuid, body.event_type, body.occurred_at, body.label].every((field) => typeof field === "string") || !isObject(body.metadata)) return invalid()
  } else if (value.kind === "complete") {
    if (value.method !== "PATCH" || typeof body.ended_at !== "string") return invalid()
  } else return invalid()
  return /** @type {OutboxRecord} */ (value)
}

/** @param {unknown} value @returns {value is number} */
function finiteNumber(value) { return typeof value === "number" && Number.isFinite(value) }

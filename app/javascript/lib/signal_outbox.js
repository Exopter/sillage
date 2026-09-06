export const OUTBOX_STORE = "outbox"
export const META_STORE = "metadata"
const DATABASE_NAME = "sillage-signal-v1"
const DATABASE_VERSION = 2

/** @typedef {{ id: string, session: string, kind: "batch" | "event" | "complete", sequence?: number, queuedAt: number, url: string, method: string, body: object }} OutboxRecord */

/** @param {IDBObjectStore} store @param {OutboxRecord} record */
export function putOutbox(store, record) {
  const rank = { batch: 0, event: 1, complete: 2 }
  return store.put({ ...record, order: [record.session, rank[record.kind], record.sequence || 0, record.queuedAt, record.id] })
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
export function readOutbox(database, session) { return transactionRequest(database, OUTBOX_STORE, "readonly", (store) => store.index("order").getAll(sessionRange(session), 64)) }
/** @param {IDBDatabase} database @param {string} session @returns {Promise<OutboxRecord | undefined>} */
export function oldestOutbox(database, session) { return transactionRequest(database, OUTBOX_STORE, "readonly", (store) => store.index("age").get(sessionRange(session))) }
/** @param {IDBDatabase} database @param {string} key @param {unknown} value */
export function writeMetadata(database, key, value) { return transactionRequest(database, META_STORE, "readwrite", (store) => store.put({ key, value })) }
/** @param {IDBDatabase} database @param {string} key */
export async function readMetadata(database, key) { return (await transactionRequest(database, META_STORE, "readonly", (store) => store.get(key)))?.value }

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

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

// Exercise the real orchestration with persistent partial-file storage and a
// recorder fake that can change its selection during a transfer.
const partialSource = `export class PartialFdrFile {
  static async open(device, manifest) {
    const key = manifest.fileIndex
    const stored = globalThis.partials
    if (!stored.has(key)) stored.set(key, 0)
    return {
      get size() { return stored.get(key) },
      async append(offset, bytes) { if (offset !== stored.get(key)) throw new Error("Bad resume offset"); stored.set(key, offset + bytes.length) },
      async blob() { return new Blob([new Uint8Array(stored.get(key))]) },
      async close() {}, async remove() { stored.delete(key) }
    }
  }
}`
const partialURL = `data:text/javascript;base64,${Buffer.from(partialSource).toString("base64")}`
const source = (await readFile(new URL("../../app/javascript/lib/fdr_import_queue.js", import.meta.url), "utf8"))
  .replace('"fdr_partial_file"', JSON.stringify(partialURL))
const { FdrImportQueue, formatRecordingDuration, formatRecordingSize } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
assert.equal(formatRecordingDuration(1122000), "18 min 42 s")
assert.equal(formatRecordingDuration(29520000), "8 h 12 min 00 s")
assert.equal(formatRecordingDuration(90061000), "25 h 01 min 01 s")
assert.equal(formatRecordingDuration(0), "0 s")
assert.equal(formatRecordingDuration(null), "Unavailable")
assert.equal(formatRecordingDuration(undefined), "Unavailable")
assert.equal(formatRecordingSize(1181116006), "1.10 GiB")
assert.equal(formatRecordingSize(78643200), "75.0 MiB")
assert.equal(formatRecordingSize(4096), "4.0 KiB")
assert.equal(formatRecordingSize(64), "64 B")
const manifest = (fileIndex) => ({ state: 2, fileIndex, bootId: 10, sizeBytes: 8192, formatVersion: 3, filename: `FDR00000${fileIndex}.BIN`, sha256: "a".repeat(64), priority: false })
const device = { deviceId: "ECU-123456", bootId: 10 }
function fixture() {
  globalThis.partials = new Map()
  const acks = [], chunks = [], commands = [], completed = new Set()
  let next = 1, paused = false
  const client = {
    async importCatalog() { return { fileIndex: 0 } },
    async nextImport() { return paused ? { state: 3 } : completed.size === 2 ? { state: 0 } : manifest(next) },
    async readChunk(index, offset, size) { chunks.push([index, offset]); return new Uint8Array(size) },
    async acknowledge(index) { acks.push(index); completed.add(index); next = index === 1 ? 2 : 1 },
    async controlImport(action, index) {
      commands.push([action, index])
      if (action === 1) next = index
      if (action === 4) paused = true
      if (action === 5) paused = false
      if (action === 6) { completed.add(index); next = index === 1 ? 2 : 1 }
      return { paused }
    }
  }
  const queue = new FdrImportQueue(null, () => {})
  queue.attach(client, device)
  return { queue, client, acks, chunks, commands }
}

{
  const { queue, client, acks, chunks } = fixture()
  let switched = false
  const uploads = []
  await queue.run(client, device, {
    active: () => true,
    progress: async (file, offset) => {
      if (!switched && offset === 4096) {
        switched = true
        queue.entries.set(2, { ...manifest(2), flags: 0 }); queue.selected.add(2)
        await queue.action("priority")
      }
    },
    upload: async (file) => { uploads.push(file.fileIndex); assert.ok(!acks.includes(file.fileIndex)) }
  })
  assert.deepEqual(uploads, [2, 1], "the requested flight overtakes the large transfer")
  assert.deepEqual(acks, [2, 1])
  assert.equal(chunks.filter(([file, offset]) => file === 1 && offset === 0).length, 1, "resume preserves the first chunk")
  assert.ok(chunks.find(([file, offset]) => file === 1 && offset === 4096))
}
{
  const { queue, client, acks } = fixture()
  let paused = false
  await queue.run(client, device, {
    active: () => true,
    progress: async (_, offset) => { if (!paused && offset === 4096) { paused = true; await queue.action("pause") } },
    upload: async () => { throw new Error("A paused transfer must not upload") }
  })
  assert.deepEqual(acks, [])
  assert.equal(globalThis.partials.get(1), 4096)
  await queue.action("pause") // Resume uses the same control.
  await queue.run(client, device, { active: () => true, progress() {}, async upload() {} })
  assert.deepEqual(acks, [1, 2])
}
{
  const { queue, client, acks, commands } = fixture()
  await queue.run(client, device, {
    active: () => true, progress() {},
    async upload(file) { if (file.fileIndex === 1) throw new Error("Checksum mismatch") }
  })
  assert.deepEqual(acks, [2], "failed validation never acknowledges or deletes the recording")
  assert.ok(commands.some(([action, index]) => action === 6 && index === 1))
  assert.equal(globalThis.partials.get(1), 8192)
}
{
  const { queue, client, acks } = fixture()
  let interrupted = false
  await queue.run(client, device, {
    active: () => true, progress() {},
    async upload(file, blob, signal) {
      if (file.fileIndex !== 1 || interrupted) return
      interrupted = true
      queue.entries.set(2, { ...manifest(2), flags: 0 }); queue.selected.add(2)
      await queue.action("priority")
      assert.ok(signal.aborted, "priority also cancels server validation polling")
      throw new DOMException("Interrupted", "AbortError")
    }
  })
  assert.deepEqual(acks, [2, 1])
}
{
  const { queue, client } = fixture()
  queue.entries.set(1, { ...manifest(1), flags: 0 }); queue.selected.add(1); queue.cursor = 1
  client.importCatalog = async (before) => before ? { fileIndex: 0 } : { ...manifest(10), flags: 0 }
  client.nextImport = async () => ({ state: 0 })
  await queue.run(client, device, { active: () => true, progress() {}, async upload() {} })
  assert.ok(queue.entries.has(1) && queue.entries.has(10), "background polling preserves older catalogue pages")
  assert.ok(queue.selected.has(1), "background polling never clears the operator selection")
  assert.equal(queue.cursor, 1, "pagination remains at the last manually loaded page")
}
console.log("FDR import queue interruption and resume tests passed")

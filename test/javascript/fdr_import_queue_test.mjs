import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { heartbeatPayloads } from "../../app/javascript/lib/fdr_api.js"

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
const { FdrImportQueue, groupRecordings, formatRecordingDuration, formatRecordingSize, formatRecordingDate, isShortRecording, isFilteredRecording } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
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
{
  const element = { hidden: true, addEventListener() {}, querySelector() { return null }, querySelectorAll() { return [] } }
  const queue = new FdrImportQueue(element, () => {})
  const catalog = {
    version: 1, boot_id: 10, revision: 2, paused: false, command_sequence: 0, command_result: 0,
    before_index: 0, next_before_index: 292,
    files: [{ file_index: 292, boot_id: 10, size_bytes: 14050664, flags: 0, duration_ms: 1558126, started_at_unix_ms: 1792324797500 }]
  }
  const payload = (importQueue) => ({ heartbeats: [{ recorder: { device_id: device.deviceId }, seen_at: "2026-10-18T15:32:53Z", status: { import_queue: importQueue } }] })
  const heartbeat = heartbeatPayloads(payload(catalog))[0]
  queue.wifi(heartbeat.recorder.device_id, heartbeat.status.import_queue)
  assert.equal(element.hidden, false, "the file panel opens from the parsed Wi-Fi response")
  assert.equal(queue.entries.get(292).sizeBytes, 14050664)
  assert.equal(queue.entries.get(292).durationMs, 1558126)
  assert.equal(queue.entries.get(292).startedAtUnixMs, 1792324797500)
  assert.equal(queue.cursor, 292)
  assert.equal(queue.wifiReady, true)
  for (const invalid of [{ ...catalog, files: {} }, { ...catalog, files: [{ ...catalog.files[0], flags: "0" }] }]) {
    assert.throws(() => heartbeatPayloads(payload(invalid)), /invalid recorder file/)
  }
  queue.wifi(device.deviceId, heartbeatPayloads(payload(undefined))[0].status.import_queue)
  assert.equal(element.hidden, true, "older firmware remains compatible without a file catalogue")
}
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

assert.equal(formatRecordingDate(null), "Unknown date")
assert.match(formatRecordingDate(1792324797500), /2026/)
assert.equal(isShortRecording({ durationMs: 59999 }), true)
assert.equal(isShortRecording({ durationMs: 60000 }), false)
assert.equal(isShortRecording({ durationMs: null }), false)
assert.equal(isShortRecording({ durationMs: 0 }), true)
{
  class Node {
    children = []
    dataset = {}
    textContent = ""
    append(...nodes) { this.children.push(...nodes) }
    replaceChildren() { this.children = [] }
    setAttribute() {}
  }
  const body = new Node(), summary = new Node()
  globalThis.document = { createElement() { return new Node() } }
  const element = { addEventListener() {}, querySelector(selector) { return selector === "[data-import-files]" ? body : selector === "[data-import-filter-summary]" ? summary : null }, querySelectorAll() { return [] } }
  const queue = new FdrImportQueue(element, () => {})
  const rows = () => body.children.filter((row) => row.children.length === 6)
  queue.entries.set(1, {fileIndex:1, flags:0, sizeBytes:100, durationMs:59999})
  queue.entries.set(2, {fileIndex:2, flags:0, sizeBytes:100, durationMs:60000, startedAtUnixMs:1792324797500})
  queue.entries.set(3, {fileIndex:3, flags:0, sizeBytes:100, durationMs:null})
  queue.selected.add(1)
  queue.render()
  assert.equal(rows().length, 2)
  assert.equal(queue.selected.has(1), false, "hidden recordings are removed from selection")
  assert.match(summary.textContent, /2 of 3 loaded/)
  assert.equal(rows()[0].children[1].children[0].textContent, "Unknown date")
  queue.showShort = true; queue.render()
  assert.equal(rows().length, 3)
  assert.equal(rows()[2].children[4].children[0].textContent, "Manual import only")
  queue.entries.delete(2); queue.entries.delete(3); queue.showShort = false; queue.render()
  assert.match(body.children[0].children[0].textContent, /No recordings match/)
  queue.entries.set(4, {fileIndex:4, flags:64, sizeBytes:100, durationMs:120000})
  queue.entries.set(5, {fileIndex:5, flags:128, sizeBytes:100, durationMs:120000})
  queue.selected.add(4); queue.render()
  assert.equal(queue.selected.has(4), false)
  assert.match(summary.textContent, /0 of 3 loaded/)
  queue.showShort = true; queue.render()
  assert.equal(rows().length, 3)
  assert.equal(rows()[1].children[4].children[0].textContent, "No GPS movement")
  assert.equal(rows()[1].children[0].children[0].disabled, false, "manual selection remains available")
  queue.entries.set(6, {fileIndex:6, flags:2, sizeBytes:100, durationMs:120000})
  queue.filter = "imported"; queue.render()
  assert.equal(rows().length, 1)
  assert.equal(rows()[0].children[0].children[0].disabled, true)
  queue.filter = "all"; queue.search = "fdr000004"; queue.render()
  assert.equal(rows().length, 1)
  assert.match(rows()[0].children[1].children[1].textContent, /000004/)

  delete globalThis.document
}

assert.equal(isFilteredRecording({durationMs:120000, flags:64}), true)
assert.equal(isFilteredRecording({durationMs:120000, flags:128}), true)
assert.equal(isFilteredRecording({durationMs:null, flags:0}), false)
assert.equal(isFilteredRecording({durationMs:120000, flags:4}), false, "explicit skip remains visible")

const recording = (fileIndex, date, flags = 0) => ({ fileIndex, startedAtUnixMs: date ? Date.parse(date) : null, flags, durationMs: 120000, sizeBytes: 100, bootId: 1 })
const catalogue = [recording(10, "2026-10-18T16:00:00Z"), recording(9, null), recording(8, "2026-10-18T12:00:00Z"), recording(7, null), recording(6, "2026-10-17T09:00:00Z"), recording(5, null)]
const groups = groupRecordings(catalogue.toReversed(), "UTC")
assert.deepEqual(groups.map(g => g.rows.map(r => r.entry.fileIndex)), [[10, 9, 8], [7], [6], [5]])
assert.equal(groups[0].label, "18 Oct 2026")
assert.equal(groups[0].rows[1].bounds, "Between 12:00 and 16:00")
assert.equal(groups[1].label, "17 Oct 2026 to 18 Oct 2026")
assert.equal(groups[1].uncertain, true)
assert.equal(groups[3].label, "Before 17 Oct 2026")
assert.equal(groupRecordings([recording(2, null), recording(1, "2026-10-18T12:00:00Z")], "UTC")[0].label, "After 18 Oct 2026")
assert.equal(groupRecordings([recording(2, null), recording(1, null)], "UTC").length, 1)
assert.equal(groupRecordings([], "UTC").length, 0)
assert.equal(formatRecordingDate(1e20), "Unknown date")
assert.equal(formatRecordingDate(-1), "Unknown date")
assert.equal(formatRecordingDate(NaN), "Unknown date")
const midnight = [recording(3, "2026-10-18T00:30:00Z"), recording(2, null), recording(1, "2026-10-17T23:30:00Z")]
assert.equal(groupRecordings(midnight, "UTC").length, 3)
assert.equal(groupRecordings(midnight, "Europe/Paris").length, 1, "day grouping follows the viewer timezone")
const conflict = groupRecordings([recording(3, "2026-10-17T09:00:00Z"), recording(2, null), recording(1, "2026-10-18T09:00:00Z")], "UTC")
assert.match(conflict[1].rows[0].bounds, /timestamps conflict/)
assert.deepEqual(conflict.flatMap(g => g.rows.map(r => r.entry.fileIndex)), [3, 2, 1])
console.log("FDR chronological grouping, uncertainty, timezone and catalogue filter tests passed")

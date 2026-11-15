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
  value.keyValue = key
  value.statusTarget = { textContent: "" }
  value.summaryTarget = { value: "" }
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
// Failed publication must preserve the original, including after a fresh controller opens.
reopened.api = async () => { throw new Error("network unavailable") }
await reopened.publish()
assert.equal(await (await reopened.store("get")).parts[0].text(), "original audio bytes")
assert.equal(reopened.statusTarget.textContent, "network unavailable")
first.database.close(); reopened.database.close(); other.database.close()
console.log("Audio recovery, account isolation and failed publication preservation passed")

import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
const source = readFileSync(new URL("../../app/javascript/controllers/signal_workspace_controller.js", import.meta.url), "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/const TypedController = .*$/m, "const TypedController = class {}")
const requests = []
const metadata = []
globalThis.signalLifecycleDependencies = {
  openDatabase: () => new Promise((resolve, reject) => requests.push({resolve, reject})),
  readMetadata: () => new Promise((resolve) => metadata.push(resolve)),
  registerUsbPageRelease: () => () => {}
}
const prelude = "const {openDatabase, readMetadata, registerUsbPageRelease} = globalThis.signalLifecycleDependencies;\n"
const {default: Workspace} = await import(`data:text/javascript;base64,${Buffer.from(prelude + source).toString("base64")}`)
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
assert.equal(metadata.length, 2)
view.connectionGeneration = Symbol("new connection")
view.nextSequence = 42
metadata.shift()(1)
metadata.shift()("ended")
await stale
assert.equal(closed, 2)
assert.equal(view.nextSequence, 42, "old metadata cannot overwrite the new connection")
assert.equal(view.ended, false)

const failed = view.connect()
view.connectionGeneration = null
requests.shift().reject(new Error("storage unavailable"))
await failed
console.log("Signal delayed storage, stale metadata and disconnected failure tests passed")

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const listeners = new Map()
globalThis.document = {
  addEventListener(name, listener) { listeners.set(name, listener) },
  removeEventListener(name, listener) {
    if (listeners.get(name) === listener) listeners.delete(name)
  }
}

const source = await readFile(
  new URL("../../app/javascript/lib/usb_page_lifecycle.js", import.meta.url),
  "utf8"
)
const lifecycle = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

let finishRelease
let releaseStarted = false
const unregister = lifecycle.registerUsbPageRelease(async () => {
  releaseStarted = true
  await new Promise((resolve) => { finishRelease = resolve })
})

const beforeRender = listeners.get("turbo:before-render")
assert.equal(typeof beforeRender, "function")

let prevented = false
let resumed = false
beforeRender({
  preventDefault() { prevented = true },
  detail: { resume() { resumed = true } }
})

assert.equal(prevented, true)
await Promise.resolve()
assert.equal(releaseStarted, true)
assert.equal(resumed, false)

finishRelease()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(resumed, true)

unregister()
assert.equal(listeners.has("turbo:before-render"), false)

console.log("USB page lifecycle tests passed")

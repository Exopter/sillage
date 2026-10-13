import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/folder_color_controller.js", import.meta.url), "utf8"))
  .replace('from "@hotwired/stimulus"', 'from "data:text/javascript,export class Controller {}"')
  .replace('from "@hotwired/turbo-rails"', 'from "data:text/javascript,export const Turbo = globalThis.Turbo"')
let cleared = 0
globalThis.Turbo = { cache: { clear() { cleared++ } } }
globalThis.HTMLButtonElement = class {}
globalThis.document = { querySelector: () => ({ getAttribute: () => "csrf" }) }
const { default: Palette } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const controller = new Palette()
let shown = 0
let applied
Object.assign(controller, {
  colorValue: "graphite", urlValue: "/flight-folders/8/color", element: { isConnected: true },
  triggerTarget: { disabled: false, focus() {} }, errorTarget: { hidden: true },
  paletteTarget: { hidePopover() {}, showPopover() { shown++ } },
  refresh() { applied = this.colorValue }
})
const button = new HTMLButtonElement()
button.dataset = { color: "aqua" }
controller.swatchTargets = [button]
const requests = []
globalThis.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }))
const first = controller.choose({ currentTarget: button })
assert.equal(applied, "aqua", "the icon updates before the network responds")
assert.equal(button.disabled, true)
await controller.choose({ currentTarget: button })
assert.equal(requests.length, 1, "rapid clicks do not race writes")
assert.equal(requests[0].options.headers["X-CSRF-Token"], "csrf")
requests[0].resolve({ ok: true, json: async () => ({ color: "aqua" }) })
await first
assert.equal(cleared, 1, "back navigation must not restore stale colors")
assert.equal(button.disabled, false)
button.dataset.color = "violet"
const failed = controller.choose({ currentTarget: button })
requests[1].resolve({ ok: false })
await failed
assert.equal(applied, "aqua", "failed saving restores the persisted color")
assert.equal(shown, 1)
assert.equal(controller.errorTarget.hidden, false)
assert.match(controller.errorTarget.textContent, /Could not save/)
const disconnected = controller.choose({ currentTarget: button })
controller.element.isConnected = false
requests[2].reject(new Error("Offline"))
await disconnected
assert.equal(shown, 1, "leaving the page does not reopen a detached palette")
console.log("Folder color: optimistic update, serialized saves, cache invalidation and failure recovery passed")

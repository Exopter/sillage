import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/flight_browser_controller.js", import.meta.url), "utf8"))
  .replace('from "@hotwired/stimulus"', 'from "data:text/javascript,export class Controller {}"')
  .replace('from "@hotwired/turbo-rails"', 'from "data:text/javascript,export const Turbo = {visit() {}}"')
const { default: Browser } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
class Element { constructor(dataset = {}) { this.dataset = dataset; this.draggable = true } toggleAttribute() {} removeAttribute() {} }
globalThis.HTMLElement = Element
globalThis.HTMLAnchorElement = class extends Element {}
const controller = new Browser()
const items = [{ value: "flight:1", checked: false }, { value: "flight:2", checked: false }, { value: "import:3", checked: false }]
let requests = 0, lastSubmitter
const submitter = { disabled: true }
const destination = { value: "", dispatchEvent() { submitter.disabled = !items.some((item) => item.checked) || items.some((item) => item.checked && item.value.startsWith("import:")) } }
Object.assign(controller, {
  element: { querySelectorAll: () => [] },
  selectionTarget: {
    querySelectorAll: (selector) => selector.includes(":checked") ? items.filter((item) => item.checked) : items,
    querySelector: (selector) => selector.startsWith("select") ? destination : submitter,
    requestSubmit(button) { requests++; lastSubmitter = button }
  }
})
const event = (currentTarget) => ({ currentTarget, prevented: false, preventDefault() { this.prevented = true }, dataTransfer: { setData() {} } })
const target = new Element({ folderDestination: "9" })
controller.drop(event(target))
assert.equal(requests, 0, "external drops never submit arbitrary flight IDs")
controller.startDrag(event(new Element({ entry: "flight:1" })))
assert.deepEqual(controller.dragEntries, ["flight:1"])
controller.drop(event(target))
assert.equal(requests, 1)
assert.equal(lastSubmitter, submitter)
assert.equal(destination.value, "9")
assert.deepEqual(items.map((item) => item.checked), [true, false, false])
assert.deepEqual(controller.dragEntries, [])
items[1].checked = true
controller.startDrag(event(new Element({ entry: "flight:1" })))
assert.deepEqual(controller.dragEntries, ["flight:1", "flight:2"], "dragging a checked flight moves the checked group")
items[2].checked = true
const mixed = event(new Element({ entry: "flight:1" }))
controller.startDrag(mixed)
assert.equal(mixed.prevented, true, "a mixed source/flight selection cannot be dragged")
assert.deepEqual(controller.dragEntries, [])
const readonly = new Element({ entry: "flight:7" }); readonly.draggable = false
const otherOwner = event(readonly); controller.startDrag(otherOwner)
assert.equal(otherOwner.prevented, true)
const folderless = event(new Element({})); controller.overFolder(folderless)
assert.equal(folderless.prevented, false, "library links without destinations do not accept drops")
controller.entryTargets = []
controller.navigate({ key: "ArrowDown", target: new Element(), preventDefault() { assert.fail("typing must not trigger navigation") } })
let selectedUrl
globalThis.window = { location: { href: "http://localhost/flights/new?folder=9", origin: "http://localhost" }, history: { state: {}, replaceState(_state, _title, url) { selectedUrl = url } } }
const row = { setAttribute() {}, getAttribute: () => "flight:1" }
const link = new HTMLAnchorElement()
link.closest = () => row
controller.entryTargets = [link]
controller.element = { dataset: { indexUrl: "/flights?folder=9&q=Campaign&page=2" }, setAttribute() {} }
controller.select({ currentTarget: link })
assert.equal(selectedUrl.pathname, "/flights", "previewing from an editor must restore the collection URL")
assert.equal(selectedUrl.searchParams.get("folder"), "9")
assert.equal(selectedUrl.searchParams.get("q"), "Campaign")
assert.equal(selectedUrl.searchParams.get("page"), "2")
assert.equal(selectedUrl.searchParams.get("selected"), "flight:1")
console.log("Flight browser ownership, internal drops, grouped moves and mixed selections passed")

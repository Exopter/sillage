import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/folder_members_controller.js", import.meta.url), "utf8"))
  .replace('from "@hotwired/stimulus"', 'from "data:text/javascript,export class Controller {}"')
const { default: Members } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const controller = new Members()
const attributes = new Map()
Object.assign(controller, {
  urlValue: "/flight-folders/members",
  searchTarget: { value: "", setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key) },
  resultsTarget: { hidden: true, replaceChildren() {}, children: [] },
  statusTarget: {},
  selectedIds: () => ["2"],
  renderResults() { this.resultsTarget.hidden = this.matches.length === 0 }
})
const requests = []
globalThis.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }))
const response = (members) => ({ ok: true, json: async () => ({ members, has_more: false }) })

const first = controller.lookup("old", controller.revision)
controller.cancelSearch()
assert.equal(requests[0].options.signal.aborted, true)
const second = controller.lookup("current", controller.revision)
assert.match(requests[1].url, /exclude_ids%5B%5D=2/)
requests[1].resolve(response([{ id: 2, email: "selected@example.test" }, { id: 3, email: "current@example.test" }]))
await second
assert.deepEqual(controller.matches.map((member) => member.id), [3], "selected members cannot be added twice")
requests[0].resolve(response([{ id: 4, email: "old@example.test" }]))
await first
assert.deepEqual(controller.matches.map((member) => member.id), [3], "late responses never replace a newer search")

controller.cancelSearch()
const failed = controller.lookup("failure", controller.revision)
requests[2].reject(new Error("Offline"))
await failed
assert.equal(controller.resultsTarget.hidden, true)
assert.match(controller.statusTarget.textContent, /Unable to search/)

controller.searchTarget.value = "a"
controller.search()
assert.match(controller.statusTarget.textContent, /at least 2/)
assert.equal(requests.length, 3, "short queries do not request the directory")

controller.matches = [{ id: 3, email: "first@example.test" }, { id: 4, email: "second@example.test" }]
controller.resultsTarget.hidden = false
controller.resultsTarget.children = [3, 4].map((id) => ({ id: `option-${id}`, setAttribute() {}, scrollIntoView() {} }))
let added
controller.add = (index) => { added = controller.matches[index].id }
const key = (key) => ({ key, preventDefault() {}, stopPropagation() {} })
controller.navigate(key("ArrowUp"))
assert.equal(attributes.get("aria-activedescendant"), "option-4")
controller.navigate(key("Enter"))
assert.equal(added, 4)
controller.navigate(key("Escape"))
assert.equal(attributes.get("aria-expanded"), "false")
assert.equal(attributes.has("aria-activedescendant"), false)

const pending = controller.lookup("unmounted", controller.revision)
controller.disconnect()
requests[3].resolve(response([{ id: 5, email: "late@example.test" }]))
await pending
assert.deepEqual(controller.matches, [], "closing the dialog invalidates pending results")
console.log("Member search cancellation, stale responses, duplicate exclusion, failures and keyboard selection passed")

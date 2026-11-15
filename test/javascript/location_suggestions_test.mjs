import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/location_suggestions_controller.js", import.meta.url), "utf8"))
  .replace('from "@hotwired/stimulus"', 'from "data:text/javascript,export class Controller {}"')
const { default: Suggestions } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const controller = new Suggestions()
const attributes = new Map()
const dispatched = []
const options = ["Aérodrome de Bouloc", "Bouloc", "Paris"].map((textContent, index) => ({
  textContent, id: `location-${index}`, hidden: false, attributes: new Map(),
  setAttribute(key, value) { this.attributes.set(key, value) }, scrollIntoView() {}
}))
Object.assign(controller, {
  inputTarget: { value: "", setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key), dispatchEvent: (event) => dispatched.push(event.type) },
  resultsTarget: { hidden: true }, optionTargets: options, statusTarget: {}
})
let prevented = 0
const key = (key) => ({ key, preventDefault() { prevented++ }, stopPropagation() {} })
controller.connect()
controller.inputTarget.value = "aerodrome"
controller.search()
assert.deepEqual(controller.matches, [options[0]], "accent-free queries find accented existing names")
controller.navigate(key("ArrowDown"))
assert.equal(attributes.get("aria-activedescendant"), "location-0")
controller.navigate(key("Enter"))
assert.equal(controller.inputTarget.value, "Aérodrome de Bouloc", "selection preserves the stored spelling")
assert.deepEqual(dispatched, ["input", "change"])
assert.equal(attributes.get("aria-expanded"), "false")
controller.inputTarget.value = "bou"
controller.search()
controller.navigate(key("ArrowUp"))
assert.equal(attributes.get("aria-activedescendant"), "location-1")
controller.navigate(key("Escape"))
assert.equal(controller.inputTarget.value, "bou", "dismissal preserves typed input")
assert.equal(attributes.has("aria-activedescendant"), false)
controller.inputTarget.value = "New airfield"
controller.search()
assert.equal(controller.resultsTarget.hidden, true)
const count = prevented
controller.navigate(key("Enter"))
assert.equal(prevented, count, "free text can submit without selecting an existing location")
assert.equal(controller.inputTarget.value, "New airfield")
console.log("Location filtering, keyboard selection, dismissal and free text passed")

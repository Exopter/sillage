import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/table_selection_controller.js", import.meta.url), "utf8"))
  .replace('from "@hotwired/stimulus"', 'from "data:text/javascript,export class Controller {}"')
const { default: TableSelection } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const controller = new TableSelection()
const rows = [ {}, {}, {} ]
const inputs = rows.map((row, index) => ({ value: `flight:${index + 1}`, checked: true, closest: () => ({ toggleAttribute: (key, value) => { row[key] = value } }) }))
Object.assign(controller, { itemTargets: inputs, allTarget: {}, countTarget: {}, deleteTarget: { dataset: {} }, clearTarget: {}, moveTarget: {}, destinationTarget: { value: "5" }, element: { dataset: {} } })
controller.connect()
assert.equal(controller.countTarget.textContent, "0 selected")
assert.ok(inputs.every((input) => !input.checked), "cached selection is cleared on navigation")
assert.equal(controller.deleteTarget.disabled, true)
inputs[1].checked = true
controller.update()
assert.equal(controller.allTarget.indeterminate, true)
assert.equal(controller.allTarget.checked, false)
assert.equal(controller.countTarget.textContent, "1 selected")
assert.match(controller.deleteTarget.dataset.turboConfirm, /1 selected entry and all associated flight data/)
assert.equal(controller.element.dataset.turboConfirm, undefined, "moving does not show the deletion confirmation")
assert.equal(controller.moveTarget.disabled, true, "a destination must be chosen")
controller.destinationTarget.value = "5"
controller.update()
assert.equal(controller.moveTarget.disabled, false)
inputs[1].value = "import:2"
controller.update()
assert.equal(controller.moveTarget.disabled, true, "raw recordings cannot be moved")
assert.match(controller.moveTarget.title, /only flights/)
inputs[1].value = "flight:2"
assert.equal(rows[1]["data-selected"], true)
assert.equal(controller.deleteTarget.disabled, false)
controller.allTarget.checked = true
controller.toggleAll()
assert.ok(inputs.every((input) => input.checked))
assert.equal(controller.allTarget.indeterminate, false)
assert.equal(controller.countTarget.textContent, "3 selected")
assert.match(controller.deleteTarget.dataset.turboConfirm, /3 selected entries/)
controller.destinationTarget.value = "unfiled"
controller.update()
assert.equal(controller.moveTarget.disabled, false, "flights can be removed from folders")
controller.reset()
let prevented = false
controller.submit({ preventDefault() { prevented = true } })
assert.equal(prevented, true)
assert.equal(controller.clearTarget.disabled, true)
assert.equal(controller.moveTarget.disabled, true)
assert.equal(controller.destinationTarget.value, "")
controller.itemTargets = []
controller.update()
assert.equal(controller.allTarget.disabled, true)
console.log("Table selection, mixed state, navigation reset and confirmation tests passed")

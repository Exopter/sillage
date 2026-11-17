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
// A full page of a longer list can be extended to every flight; only Edit then applies.
const page = [ 1, 2 ].map((id) => ({ value: `flight:${id}`, checked: true, defaultChecked: false, closest: () => null }))
const wide = new TableSelection()
Object.assign(wide, { itemTargets: page, allTarget: {}, countTarget: {}, deleteTarget: { dataset: {} }, clearTarget: {}, moveTarget: {}, destinationTarget: { value: "5" },
  hasScopeTarget: true, scopeTarget: { value: "page" }, hasEditTarget: true, editTarget: {}, extendTarget: {}, extendTextTarget: {}, extendButtonTarget: {}, totalValue: 47, element: { dataset: {} } })
wide.update()
assert.equal(wide.extendTarget.hidden, false)
assert.equal(wide.extendButtonTarget.textContent, "Select all 47 flights in this list")
assert.equal(wide.editTarget.disabled, false)
wide.selectAll()
assert.equal(wide.scopeTarget.value, "all")
assert.equal(wide.countTarget.textContent, "All 47 flights selected")
assert.equal(wide.deleteTarget.disabled, true, "deleting stays limited to one page")
assert.equal(wide.moveTarget.disabled, true)
assert.equal(wide.editTarget.disabled, false)
page[0].checked = false
wide.update()
assert.equal(wide.scopeTarget.value, "page", "unticking a flight returns to a page selection")
assert.equal(wide.extendTarget.hidden, true)
page[0].defaultChecked = true
wide.connect()
assert.equal(page[1].checked, true, "a selection rendered ticked by the server is kept")
console.log("Table selection, mixed state, navigation reset and confirmation tests passed")

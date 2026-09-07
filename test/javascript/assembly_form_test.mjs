import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/assembly_form_controller.js", import.meta.url), "utf8"))
  .replace('from "@hotwired/stimulus"', 'from "data:text/javascript,export class Controller {}"')
const {default: AssemblyForm} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const form = new AssemblyForm()
Object.assign(form, {
  hasTypeTarget: true, typeTarget: {value: ""}, parametersTarget: {},
  configurationTargets: [{checked: false, dataset: {version: "V42"}}],
  methodTarget: {value: ""}, previewTarget: {}, submitTarget: {}
})
form.connect()
assert.equal(form.parametersTarget.hidden, true)
assert.equal(form.parametersTarget.disabled, true)
assert.equal(form.submitTarget.disabled, true)
form.typeTarget.value = "ExoFDR"
form.update()
assert.equal(form.parametersTarget.hidden, false)
assert.equal(form.parametersTarget.disabled, false)
assert.equal(form.submitTarget.disabled, true)
form.configurationTargets[0].checked = true
form.methodTarget.value = "PERF"
form.update()
assert.equal(form.submitTarget.disabled, false)
assert.match(form.previewTarget.textContent, /EXOFDR-V42-PERF-…/)
form.methodTarget.value = "PCB"
form.update()
assert.match(form.previewTarget.textContent, /EXOFDR-V42-PCB-…/)
form.typeTarget.value = ""
form.update()
assert.equal(form.parametersTarget.disabled, true)
assert.equal(form.submitTarget.disabled, true)
form.hasTypeTarget = false
form.update() // Editing an existing assembly has no mutable type/configuration inputs.
console.log("Assembly form selection and preview tests passed")

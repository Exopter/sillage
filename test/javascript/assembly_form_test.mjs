import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/assembly_form_controller.js", import.meta.url), "utf8"))
  .replace('from "@hotwired/stimulus"', 'from "data:text/javascript,export class Controller {}"')
const {default: AssemblyForm} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const form = new AssemblyForm()
Object.assign(form, {
  hasTypeTarget: true, typeTarget: {value: ""}, parametersTarget: {}, identityTarget: {},
  hasParametersTarget: true, hasIdentityTarget: true, hasConfigurationSelectTarget: false,
  configurationTargets: [{checked: false, dataset: {version: "V1"}}],
  methodTarget: {value: "", closest: () => ({})}, componentTarget: {value: "", closest: () => ({})}, previewTarget: {}, submitTarget: {}
})
form.connect()
assert.equal(form.parametersTarget.hidden, true)
assert.equal(form.parametersTarget.disabled, true)
assert.equal(form.submitTarget.disabled, true)
assert.equal(form.identityTarget.disabled, true)
form.typeTarget.value = "ExoFDR"
form.update()
assert.equal(form.parametersTarget.hidden, false)
assert.equal(form.parametersTarget.disabled, false)
assert.equal(form.submitTarget.disabled, true)
form.configurationTargets[0].checked = true
form.methodTarget.value = "PERF"
form.update()
assert.equal(form.submitTarget.disabled, false)
assert.match(form.previewTarget.textContent, /EXOFDR-V1-PERF-…/)
form.methodTarget.value = "PCB"
form.update()
assert.match(form.previewTarget.textContent, /EXOFDR-V1-PCB-…/)
form.configurationTargets[0].dataset.version = "V2"
form.update()
assert.equal(form.submitTarget.disabled, true)
assert.equal(form.methodTarget.disabled, true)
assert.equal(form.componentTarget.required, true)
for (const type of ["SYSTEMS", "MAIN", "CENTRAL", "AIRSPEED", "DISPLAY", "LITE"]) {
  form.componentTarget.value = type
  form.update()
  assert.equal(form.submitTarget.disabled, false)
  assert.ok(form.previewTarget.textContent.includes(`EXOFDR-V2-${type}-…`))
}
form.configurationTargets[0].dataset.version = "V0"
form.update()
assert.equal(form.methodTarget.disabled, false)
assert.equal(form.componentTarget.disabled, true)
assert.match(form.previewTarget.textContent, /EXOFDR-V0-PCB-…/)
form.typeTarget.value = ""
form.update()
assert.equal(form.parametersTarget.disabled, true)
assert.equal(form.submitTarget.disabled, true)
for (const type of ["Parachute", "Exowing"]) {
  form.typeTarget.value = type
  form.configurationTargets = []
  form.methodTarget.value = ""
  form.update()
  assert.equal(form.parametersTarget.disabled, true)
  assert.equal(form.identityTarget.hidden, false)
  assert.equal(form.identityTarget.disabled, false)
  assert.equal(form.submitTarget.disabled, false)
}
form.typeTarget.value = "ExoFDR"
form.update()
assert.equal(form.identityTarget.disabled, true)
assert.equal(form.submitTarget.disabled, true)
form.hasTypeTarget = false
form.update() // Editing an existing assembly has no mutable type/configuration inputs.
form.hasConfigurationSelectTarget = true
form.configurationSelectTarget = {selectedOptions: [{dataset: {version: "V3"}}]}
form.componentTarget.value = "LITE"
form.update()
assert.equal(form.submitTarget.disabled, false)
assert.match(form.previewTarget.textContent, /EXOFDR-V3-LITE-…/)
console.log("Assembly form selection and preview tests passed")

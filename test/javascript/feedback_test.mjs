import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { paintAnnotations } from "../../app/javascript/lib/feedback_annotations.js"

const calls = []
const context = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]) })
paintAnnotations(context, [[{x: 10, y: 20}, {x: 40, y: 50}], [{x: 80, y: 90}]], "red")
assert.ok(calls.some(call => call[0] === "lineTo" && call[1] === 40 && call[2] === 50))
assert.ok(calls.some(call => call[0] === "arc" && call[1] === 80), "Single clicks leave a visible mark")

let source = await readFile(new URL("../../app/javascript/controllers/feedback_controller.js", import.meta.url), "utf8")
source = source.replace('from "@hotwired/stimulus"', 'from "data:text/javascript,export class Controller {}"')
source = source.replace('from "feedback_annotations"', `from "${new URL("../../app/javascript/lib/feedback_annotations.js", import.meta.url).href}"`)
source = source.replace('import("html2canvas-pro")', 'globalThis.captureModule()')
const {default: Feedback} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

const feedback = new Feedback()
const regions = Object.fromEntries(["error", "editor", "receipt", "capture-status"].map(name => [`[data-feedback-${name}]`, {textContent:"", hidden:false, focus() {}}]))
const form = {action: "/feedbacks", reportValidity: () => true, setAttribute() {}}
feedback.element = { isConnected: true, querySelector: selector => selector === "form" ? form : regions[selector], querySelectorAll: () => [] }
let removed = false
feedback.removeScreenshot = () => { removed = true }
globalThis.FormData = class {}
globalThis.fetch = async () => { throw new Error("offline") }
await feedback.submit({preventDefault() {}})
assert.match(regions["[data-feedback-error]"].textContent, /kept here/)
assert.equal(removed, false, "Network failure must retain the screenshot")
assert.equal(feedback.busy, false)

globalThis.fetch = async () => ({ok:false, headers: new Headers({"content-type":"application/json"}), json:async () => ({errors:["Description can't be blank"]})})
await feedback.submit({preventDefault() {}})
assert.match(regions["[data-feedback-error]"].textContent, /blank/)
assert.equal(removed, false)

globalThis.fetch = async () => ({ok:true, headers: new Headers({"content-type":"application/json"}), json:async () => ({saved:true})})
await feedback.submit({preventDefault() {}})
assert.equal(removed, true)
assert.equal(regions["[data-feedback-editor]"].hidden, true)
assert.equal(regions["[data-feedback-receipt]"].hidden, false)

// A capture cancelled while its lazy dependency loads must never replace the draft.
let resolveModule
let renderCalls = 0
globalThis.captureModule = () => new Promise(resolve => {resolveModule = resolve})
const pendingCapture = feedback.capture()
feedback.generation++
resolveModule({default: async () => {renderCalls++}})
await pendingCapture
assert.equal(renderCalls, 0)

console.log("Feedback annotations, persistence acknowledgements, retained drafts and cancellation passed")

// The renderer's scaled context must not scale the user's strokes a second time.
const captured = new Feedback()
const captureRegions = {"[data-feedback-capture-status]":{}, "[data-feedback-preview]":{hidden:true}, "[data-feedback-error]":{}}
const captureFile = {files:null}
const captureImage = {src:""}
let factor = 2
let paintedX = null
const captureContext = {
  save() {}, restore() {}, setTransform() {factor = 1}, scale(x) {factor *= x},
  beginPath() {}, moveTo() {}, lineTo(x) {paintedX = x * factor}, stroke() {}
}
const captureCanvas = {width:200, height:100, getContext:()=>captureContext, toBlob(callback) {callback(new Blob(["png"],{type:"image/png"}))}}
Object.defineProperties(captured, {
  form:{value:form}, file:{value:captureFile}, image:{value:captureImage},
  dialog:{value:{close(){}}}, panel:{value:{showPopover(){}}}
})
captured.element = {isConnected:true, querySelector: selector => captureRegions[selector], querySelectorAll:()=>[]}
captured.removeScreenshot = () => {}
captured.strokes = [[{x:10,y:10},{x:20,y:20}]]
globalThis.window = {innerWidth:100,innerHeight:50,scrollX:0,scrollY:0,devicePixelRatio:2}
globalThis.document = {body:{}}
globalThis.getComputedStyle = () => ({getPropertyValue:()=>"red"})
globalThis.DataTransfer = class {items = {add:()=>{}}; files = []}
globalThis.captureModule = async () => ({default:async()=>captureCanvas})
await captured.capture()
assert.equal(paintedX, 40, "A 20 CSS-pixel coordinate must map to 40 image pixels at 2x, not 80")
assert.equal(captureRegions["[data-feedback-preview]"].hidden, false)
assert.equal(captured.busy, false)
URL.revokeObjectURL(captured.previewUrl)

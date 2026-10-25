import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
const source = (await readFile(new URL("../../app/javascript/controllers/feedback_board_controller.js", import.meta.url), "utf8"))
  .replace('from "@hotwired/stimulus"', 'from "data:text/javascript,export class Controller {}"')
const { default: Board } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
globalThis.Element = class {}
globalThis.HTMLElement = class extends Element { dataset = {}; removeAttribute() {}; setAttribute() {} }
globalThis.HTMLInputElement = class extends HTMLElement { value = "new" }
globalThis.HTMLFormElement = class extends HTMLElement {}
const board = new Board()
const columns = ["new", "reviewing", "planned", "resolved"].map(status => Object.assign(new HTMLElement(), {dataset:{status}}))
const announcement = { textContent: "" }
board.element = { querySelectorAll: selector => selector === "section[data-status]" ? columns : [], querySelector: () => announcement }
const input = new HTMLInputElement()
let submissions = 0
const form = Object.assign(new HTMLFormElement(), { querySelector: () => input, requestSubmit: () => submissions++, closest: () => ({getAttribute: () => "new"}) })
const handle = Object.assign(new HTMLElement(), { closest: () => card })
const card = Object.assign(new HTMLElement(), { querySelector: selector => selector === "form" ? form : handle, closest: () => columns[0] })
const event = { currentTarget: columns[2], preventDefault() {} }
board.pick(card)
board.drop(event)
assert.equal(submissions, 1)
assert.equal(input.value, "planned")
assert.equal(board.pending, true)
board.pick(card)
board.move("resolved")
assert.equal(submissions, 1, "pending requests cannot be duplicated")
board.submitted({target:form,detail:{success:false}})
assert.equal(input.value, "new")
assert.match(announcement.textContent, /Could not update/)
board.pick(card)
board.move("new")
assert.equal(submissions, 1, "same-column moves do not notify")
board.pick(card)
board.move("invalid")
assert.equal(submissions, 1)
board.drop(event)
assert.equal(submissions, 1, "external drops are ignored")
board.key({key:"ArrowRight",target:handle,preventDefault(){}})
assert.equal(input.value, "reviewing")
assert.equal(submissions, 2)
board.submitted({target:form,detail:{success:false}})
board.select({target:handle,stopPropagation(){}})
assert.equal(board.card, card)
board.key({key:"Escape"})
assert.equal(board.card, null)
board.select({target:handle,stopPropagation(){}})
const blank = Object.assign(new Element(), {closest:()=>null})
board.place({target:blank,currentTarget:columns[3]})
assert.equal(input.value, "resolved")
assert.equal(submissions, 3, "touch selection and column tap submit the move")
console.log("Feedback board drag, keyboard, touch, duplicate and failure tests passed")

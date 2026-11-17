import assert from "node:assert/strict"
import { formatLocalTime, groupByLocalDay } from "../../app/javascript/lib/local_time.js"

// One instant, read in the viewer's zone: 10:27:05 UTC is 11:27:05 in Paris in winter.
const instant = new Date("2026-11-16T10:27:05Z")
assert.equal(formatLocalTime(instant, "long", "Europe/Paris"), "16 Nov 2026, 11:27")
assert.equal(formatLocalTime(instant, "seconds", "Europe/Paris"), "16 Nov 2026, 11:27:05")
assert.equal(formatLocalTime(instant, "list", "Europe/Paris"), "16 Nov 2026 \u00b7 11:27")
assert.equal(formatLocalTime(instant, "short", "Europe/Paris"), "16 Nov \u00b7 11:27")
assert.equal(formatLocalTime(instant, "time", "Europe/Paris"), "11:27:05")
assert.equal(formatLocalTime(instant, "date", "Europe/Paris"), "16 Nov 2026")
assert.equal(formatLocalTime(instant, "long", "UTC"), "16 Nov 2026, 10:27")
// The date follows the zone too, and midnight is 00, never 24.
assert.equal(formatLocalTime(new Date("2026-11-16T23:30:00Z"), "list", "Europe/Paris"), "17 Nov 2026 \u00b7 00:30")
assert.equal(formatLocalTime(new Date("2026-07-01T22:15:00Z"), "long", "Europe/Paris"), "02 Jul 2026, 00:15")
assert.equal(formatLocalTime(instant, "unknown", "UTC"), "16 Nov 2026, 10:27")
assert.equal(formatLocalTime(new Date("2026-09-23T13:57:54Z"), "date", "Europe/Paris"), "23 Sep 2026")
// Flight log rows show the time alone under a day header, and both follow the zone.
assert.equal(formatLocalTime(instant, "clock", "Europe/Paris"), "11:27")
assert.equal(formatLocalTime(instant, "day", "Europe/Paris"), "Mon 16 Nov 2026")
assert.equal(formatLocalTime(new Date("2026-11-16T23:30:00Z"), "day", "Europe/Paris"), "Tue 17 Nov 2026")

// Day headers are regrouped in the viewer's zone: here the process zone is forced to Paris.
process.env.TZ = "Europe/Paris"
const node = (dataset, textContent = "") => ({ dataset, textContent, className: "", remove() { list.children.splice(list.children.indexOf(this), 1) }, before(other) { list.children.splice(list.children.indexOf(this), 0, other) } })
const list = { dataset: { localDays: "day" }, ownerDocument: { createElement: () => node({}) }, children: [] }
list.children = [
  node({ dayHeader: "" }, "Mon 16 Nov 2026"), node({ dayAt: "2026-11-16T23:30:00Z" }), node({ dayAt: "2026-11-16T22:10:00Z" }),
  node({ dayHeader: "" }, "Sun 15 Nov 2026"), node({ day: "Sun 15 Nov 2026" }), node({})
]
const headers = () => list.children.map(child => "dayHeader" in child.dataset ? child.textContent : "-").join("|")
groupByLocalDay({ querySelectorAll: () => [list] })
assert.equal(headers(), "Tue 17 Nov 2026|-|Mon 16 Nov 2026|-|Sun 15 Nov 2026|-|-")
assert.equal(list.children[2].className, "day")
groupByLocalDay({ querySelectorAll: () => [list] })
assert.equal(headers(), "Tue 17 Nov 2026|-|Mon 16 Nov 2026|-|Sun 15 Nov 2026|-|-", "a second pass changes nothing")
console.log("Local time formatting passed")

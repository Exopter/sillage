import assert from "node:assert/strict"
import { extractChecklist } from "../../app/javascript/lib/debrief_checklist.js"

assert.deepEqual(extractChecklist(""), {})
assert.deepEqual(
  extractChecklist("Glide ratio was about 2,8. Speed 165. CG setting 3, angle of attack plus 2 degrees."),
  { glide_ratio: "2.8", speed: "165 km/h", cg: "3", aoa: "2" }
)
assert.deepEqual(
  extractChecklist("Finesse 3.1, vitesse de 170 km/h, centrage -1.5, incidence +2. Indice de kiff 8, pureté 7. Rien de spécial."),
  { glide_ratio: "3.1", speed: "170 km/h", cg: "-1.5", aoa: "+2", feelings: "IDK 8 · IDP 7", special: "Noted" }
)
// A point is not ticked by a neighbouring number or an unrelated word.
assert.deepEqual(extractChecklist("I felt good about the special features of this suit, IDP 6."), { feelings: "IDP 6", special: "Noted" })
assert.deepEqual(extractChecklist("We talked for 12 minutes about nothing in particular."), {})
console.log("Debrief checklist extraction passed")

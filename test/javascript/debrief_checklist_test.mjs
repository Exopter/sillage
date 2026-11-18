import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { extractChecklist, spokenNumbers } from "../../app/javascript/lib/debrief_checklist.js"

assert.deepEqual(extractChecklist(""), {})
assert.deepEqual(
  extractChecklist("Glide ratio was about 2,8. Speed 165. CG setting 3, angle of attack plus 2 degrees."),
  { glide_ratio: "2.8", speed: "165 km/h", cg: "3", aoa: "2" }
)
assert.deepEqual(
  extractChecklist("Finesse 3.1, vitesse de 170 km/h, centrage -1.5, incidence +2. Indice de kiff 8, pureté 7. Rien de spécial."),
  { glide_ratio: "3.1", speed: "170 km/h", cg: "-1.5", aoa: "+2", feelings: "IDK 8 · IDP 7", special: "none" }
)
// A point is not ticked by a neighbouring number or an unrelated word.
assert.deepEqual(extractChecklist("I felt good about the special features of this suit, IDP 6."), { feelings: "IDP 6", special: "Noted" })
// Special features name the trials flown: weight, leg wing, payload, with the mass when it is said.
assert.equal(extractChecklist("Special features: two kilos of weight on the legs.").special, "weight 2 kg")
assert.equal(extractChecklist("Lest de 2,5 kg et wingsuit de jambe").special, "weight 2.5 kg \u00b7 leg wing")
assert.equal(extractChecklist("We flew the leg wingsuit with a 500 grams payload").special, "leg wing \u00b7 payload 500 g")
assert.equal(extractChecklist("Premier vol avec la charge utile").special, "payload")
assert.equal(extractChecklist("I am 80 kilos, speed 150 kilometers per hour, leg strap on purple").special, undefined)
assert.deepEqual(extractChecklist("We talked for 12 minutes about nothing in particular."), {})
// Figures dictated digit by digit read as numbers; a lone number word is left alone.
assert.equal(spokenNumbers("speed one five zero, glide two point eight"), "speed 150, glide 2.8")
assert.equal(spokenNumbers("un cinq z\u00e9ro puis deux virgule huit"), "150 puis 2.8")
assert.equal(spokenNumbers("at one point no one moved"), "at one point no one moved")
assert.equal(spokenNumbers("CG three point five\nZero angle of attack"), "CG 3.5\nZero angle of attack")
assert.deepEqual(extractChecklist("Zero degrees of angle of attack, it felt too twitchy"), { aoa: "0", feelings: "too twitchy" })
assert.deepEqual(extractChecklist("Pas d'incidence, les sensations sont bonnes"), { aoa: "none", feelings: "bonnes" })

// A figure belongs to its own label: the CG value in front of "AoA" is not the angle (17 November 2026).
assert.deepEqual(extractChecklist("Glide ratio 3.5 speed 150 CG 3.5 AoA 0"), { glide_ratio: "3.5", speed: "150 km/h", cg: "3.5", aoa: "0" })
assert.deepEqual(extractChecklist("Glide ratio 3.2, speed 155, CG 3.5 AoA setting"), { glide_ratio: "3.2", speed: "155 km/h", cg: "3.5" })
assert.deepEqual(extractChecklist("Glide ratio quatre, speed 150, CG trois point five, AoA z\u00e9ro, bon feeling"), { glide_ratio: "4", speed: "150 km/h", cg: "3.5", aoa: "0", feelings: "bon" })
// A live line cut inside a figure is mended; an ordinary line break is not.
assert.equal(spokenNumbers("Glide ratio 3 point\nTwo, speed"), "Glide ratio 3.2, speed")
assert.equal(spokenNumbers("Glide ratio  3.\nTwo\nSpeed"), "Glide ratio  3.2\nSpeed")
assert.equal(spokenNumbers("speed 150.\nUn peu instable"), "speed 150.\nUn peu instable")

// Tunnel debriefs recorded on 16 and 17 November 2026: what the patterns must tick with no model at all.
const field = JSON.parse(readFileSync(new URL("../fixtures/files/debrief_field_transcripts.json", import.meta.url), "utf8"))
assert.equal(field.length, 11)
for (const { flight, transcript, expected } of field) assert.deepEqual(extractChecklist(transcript), expected, flight)
// Ticks arrive while the pilot is still talking: the opening sentence alone is enough.
assert.deepEqual(extractChecklist("Two point eight speed one three zero CG three point five"), { glide_ratio: "2.8", speed: "130 km/h", cg: "3.5" })
console.log("Debrief checklist extraction passed")

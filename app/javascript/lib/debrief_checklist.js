// Finds the debrief checklist points in a transcript. Mirrors
// app/models/debrief_checklist.rb, which fills the same points from the final transcript.
// The patterns follow how pilots actually dictate in the tunnel (field debriefs of
// 16 November 2026): figures spoken digit by digit ("speed one five zero"), the
// glide ratio given as a bare leading number, "no angle of attack", "the feeling is good".

const NUMBER = "[+-]?\\d+(?:[.,]\\d+)?"
const GAP = "[^\\d+-]{0,24}"
/** @type {Record<string, string>} */
const DIGITS = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  "z\u00e9ro": "0", un: "1", deux: "2", trois: "3", quatre: "4", cinq: "5", sept: "7", huit: "8", neuf: "9" }
const DIGIT_WORD = Object.keys(DIGITS).join("|")
const SPOKEN = new RegExp(`(?<![\\p{L}\\d])(?:${DIGIT_WORD})(?:[ ,]+(?:${DIGIT_WORD}|point|dot|virgule|comma))+(?![\\p{L}\\d])`, "giu")
const AOA = "\\ba\\.?o\\.?a\\.?\\b|angle of attack|angle d.attaque|incidence"
const FEEL = "feel(?:ing|s)?|felt|ressentis?|sensations?"

/** "one five zero" becomes "150" and "two point eight" becomes "2.8". A lone number word is left alone.
 * @param {string} text */
export function spokenNumbers(text) {
  return text.replace(SPOKEN, run => {
    const figure = run.toLowerCase().split(/[ ,]+/).map(word => DIGITS[word] ?? ".").join("")
    return /^\d+(?:\.\d+)?$/.test(figure) ? figure : run
  })
}

/** @param {string} text @param {string} lead @param {string} [value] */
function capture(text, lead, value = NUMBER) {
  const match = new RegExp(`(?:${lead})${GAP}(${value})`, "i").exec(text)
  return match ? match[1].replace(",", ".") : null
}

/** @param {string} text */
function feeling(text) {
  const before = new RegExp(`\\b(good|great|bad|better|worse|nice|weird|strange|bon|bonne|mauvais|super)\\s+(?:${FEEL})\\b`, "i").exec(text)
  if (before) return before[1].toLowerCase()
  const after = new RegExp(`\\b(?:${FEEL})\\b[\\s:,]*((?:(?:is|was|are|were|still|it|the|a|that|i|very|much|quite|est|sont|c.est)\\s+)*)(more|less|not|too|turning|plus|moins|pas)?\\s*([\\p{L}]+)?`, "iu").exec(text)
  if (!after) return null
  return [after[2], after[3]].filter(Boolean).join(" ").toLowerCase() || "Noted"
}

/** @param {string} transcript @returns {Record<string, string>} */
export function extractChecklist(transcript) {
  const text = spokenNumbers(String(transcript || ""))
  /** @type {Record<string, string>} */
  const found = {}
  // The glide ratio opens the debrief; when its name is clipped or misheard it is the bare figure before the speed.
  const glide = capture(text, "glide\\s*ratio|glide|finesse") ||
    /^\s*(?:[\p{L}]+[\s,]+){0,3}(\d[.,]\d+)(?:\s+\d[.,]\d+)?[\s,]*(?:speed|vitesse)/iu.exec(text)?.[1].replace(",", ".") ||
    /(\d[.,]\d+)\s*(?:of\s+)?glide\s*ratio/i.exec(text)?.[1].replace(",", ".")
  if (glide) found.glide_ratio = glide
  const speed = capture(text, "speed|vitesse", "\\d{2,3}")
  if (speed) found.speed = `${speed} km/h`
  const cg = capture(text, "\\bc\\.?g\\.?\\b|cent(?:er|re) (?:of|de) gravit[ye\u00e9]|centrage")
  if (cg) found.cg = cg
  const none = new RegExp(`\\b(?:no|sans|pas d[e\u2019'])\\s*(?:${AOA})`, "i").test(text)
  const zeroBefore = new RegExp(`(?:\\b(zero|z\u00e9ro)|(${NUMBER}))\\s*(?:degrees?|degr[e\u00e9]s?|\u00b0)?\\s*(?:of\\s+|d[e\u2019']\\s*)?(?:${AOA})`, "i").exec(text)
  const aoa = none ? "none" : zeroBefore ? (zeroBefore[1] ? "0" : zeroBefore[2].replace(",", ".")) : capture(text, AOA)
  if (aoa) found.aoa = aoa
  const idk = capture(text, "\\bidk\\b|indice de kiff|\\bkiff\\b")
  const idp = capture(text, "\\bidp\\b|indice de puret[e\u00e9]|\\bpuret[e\u00e9]")
  const scores = [idk && `IDK ${idk}`, idp && `IDP ${idp}`].filter(Boolean)
  const felt = scores.length ? scores.join(" \u00b7 ") : feeling(text)
  if (felt) found.feelings = felt
  if (/special feature|particularit|rien de sp[e\u00e9]cial|nothing special|sp[e\u00e9]cificit/i.test(text)) found.special = "Noted"
  return found
}

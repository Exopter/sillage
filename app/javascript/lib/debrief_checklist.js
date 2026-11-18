// Finds the debrief checklist points in a transcript. Mirrors
// app/models/debrief_checklist.rb, which fills the same points from the final transcript.
// The patterns follow how pilots actually dictate in the tunnel (field debriefs of
// 16 and 17 November 2026): figures spoken digit by digit ("speed one five zero"), the
// glide ratio given as a bare leading number, "no angle of attack", "the feeling is good".

const NUMBER = "[+-]?\\d+(?:[.,]\\d+)?"
// A figure belongs to the label right before it: the gap never runs over the next label.
const LABEL_GAP = "(?:(?!speed|vitesse|\\bc\\.?g\\.?\\b|\\ba\\.?o\\.?a\\.?\\b)[^\\d+-]){0,24}"
/** @type {Record<string, string>} */
const DIGITS = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  "z\u00e9ro": "0", un: "1", deux: "2", trois: "3", quatre: "4", cinq: "5", sept: "7", huit: "8", neuf: "9" }
const DIGIT_WORD = Object.keys(DIGITS).join("|")
const SPOKEN = new RegExp(`(?<![\\p{L}\\d])(?:${DIGIT_WORD})(?:[ ,]+(?:${DIGIT_WORD}|point|dot|virgule|comma))+(?![\\p{L}\\d])`, "giu")
const AOA = "\\ba\\.?o\\.?a\\.?\\b|angle of attack|angle d.attaque|incidence"
const FEEL = "feel(?:ing|s)?|felt|ressentis?|sensations?"
const DECIMAL_WORD = "point|dot|virgule|comma"
// Field debrief of 18 November 2026 (FLT-2026-130): "CG trois et demi" is 3.5.
const HALF = new RegExp(`(?<![\\p{L}\\d.,])(\\d+|${DIGIT_WORD})\\s+(?:et\\s+demie?|and\\s+a\\s+half)(?!\\p{L})`, "giu")
// Field debriefs of 17 November 2026: the live transcript arrives in short lines cut wherever the
// pilot breathes ("Glide ratio 3 point" / "Two, speed"), and a lone number word follows its label
// ("Glide ratio, quatre", "AoA setting zero").
const LABEL = `glide\\s*ratio|finesse|\\bc\\.?g\\.?(?:\\s+setting)?|(?:${AOA})(?:\\s+setting)?`
const MEND_WORD = new RegExp(`\\b(${DECIMAL_WORD})[ \\t]*\\n\\s*`, "gi")
const MEND_FIGURE = new RegExp(`(?<![\\p{L}\\d.,])(\\d)\\.[ \\t]*\\n\\s*(${DIGIT_WORD})(?=\\s*(?:[,.]|\\n|$))`, "giu")
const MIXED = new RegExp(`(?<![\\p{L}\\d.,])(\\d+)\\s+(?:${DECIMAL_WORD})\\s+(${DIGIT_WORD}|\\d)(?![\\p{L}\\d])`, "giu")
const AFTER_LABEL = new RegExp(`((?:${LABEL})[\\s,:.]*(?:(?:is|was|at|est|\u00e0|de|of)\\s+)?)(${DIGIT_WORD})(?=\\s*(?:[,.;:]|\\n|$)|\\s+(?:speed|vitesse|c\\.?g\\b|a\\.?o\\.?a|kilo|km|degr))`, "giu")
// Special features are the trials flown alongside the flight itself: added weight, a leg wing, a payload.
/** @type {[string, RegExp][]} */
const SPECIALS = [
  ["weight", /\bweights?\b|\bballast|\blest|\bpoids\b|\bplombs?\b/i],
  ["leg wing", /\bleg[\s-]*wing(?:suit)?s?\b|\b(?:wingsuit|aile)s? de jambes?\b/i],
  ["payload", /\bpayloads?\b|\bcharge utile\b/i]
]
// The mass said with them ("two kilos of weight", "payload 1.5 kg") belongs to the weight, else to the payload.
const MASS = new RegExp(`(?<![\\p{L}\\d.,])(${NUMBER}|${DIGIT_WORD})\\s*(kg|kilos?|kilogram(?:me)?s?|grams?|grammes?)(?!\\p{L})`, "iu")
const NOTHING_SPECIAL = /rien de sp[e\u00e9]cial|nothing special|no special feature|(?:pas de|aucune) particularit/i
// Words the feeling pattern must not report as the feeling itself ("I felt I had to work").
const NOT_A_FEELING = ["had", "have", "has", "to", "that", "like", "as", "if", "when", "i", "it", "we", "you", "the", "a", "and", "so", "but", "je", "que", "comme"]

/** "one five zero" becomes "150", "two point eight" becomes "2.8" and "trois et demi" becomes "3.5". A lone number word is left alone.
 * @param {string} text */
export function spokenNumbers(text) {
  const digit = (/** @type {string} */ word) => DIGITS[word.toLowerCase()] ?? word
  return text.replace(HALF, (_run, whole) => `${digit(whole)}.5`).replace(MEND_WORD, "$1 ").replace(MEND_FIGURE, (_run, whole, word) => `${whole}.${digit(word)}`).replace(SPOKEN, run => {
    const figure = run.toLowerCase().split(/[ ,]+/).map(word => DIGITS[word] ?? ".").join("")
    return /^\d+(?:\.\d+)?$/.test(figure) ? figure : run
  }).replace(MIXED, (_run, whole, word) => `${whole}.${digit(word)}`).replace(AFTER_LABEL, (_run, lead, word) => `${lead}${digit(word)}`)
}

/** @param {string} text @param {string} lead @param {string} [value] */
function capture(text, lead, value = NUMBER) {
  const match = new RegExp(`(?:${lead})${LABEL_GAP}(${value})`, "i").exec(text)
  return match ? match[1].replace(",", ".") : null
}

/** @param {string} text */
function feeling(text) {
  const before = new RegExp(`\\b(good|great|bad|better|worse|nice|weird|strange|bon|bonne|mauvais|super)\\s+(?:${FEEL})\\b`, "i").exec(text)
  if (before) return before[1].toLowerCase()
  const after = new RegExp(`\\b(?:${FEEL})\\b[\\s:,]*((?:(?:is|was|are|were|still|it|the|a|that|i|very|much|quite|est|sont|c.est)\\s+)*)(more|less|not|too|turning|plus|moins|pas)?\\s*([\\p{L}]+)?`, "iu").exec(text)
  if (!after) return null
  const word = NOT_A_FEELING.includes((after[3] || "").toLowerCase()) ? null : after[3]
  return [after[2], word].filter(Boolean).join(" ").toLowerCase() || "Noted"
}

/** "weight 2 kg \u00b7 leg wing" when trials are named, "none" when the pilot rules them out.
 * @param {string} text */
function special(text) {
  let named = SPECIALS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  const mass = MASS.exec(text)
  const owner = ["weight", "payload"].find(name => named.includes(name))
  if (mass && owner) {
    const figure = `${(DIGITS[mass[1].toLowerCase()] ?? mass[1]).replace(",", ".")} ${/^g/i.test(mass[2]) ? "g" : "kg"}`
    named = named.map(name => name === owner ? `${name} ${figure}` : name)
  }
  if (named.length) return named.join(" \u00b7 ")
  if (NOTHING_SPECIAL.test(text)) return "none"
  return /special feature|particularit|sp[e\u00e9]cificit/i.test(text) ? "Noted" : null
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
  // "CG 3.5 AoA 0": a figure in front of the label is the angle only when a unit or "of" ties them.
  const before = new RegExp(`(?:\\b(zero|z\u00e9ro)|(${NUMBER}))\\s*(?:(?:degrees?|degr[e\u00e9]s?|\u00b0)\\s*(?:of\\s+|d[e\u2019']\\s*)?|of\\s+|d[e\u2019']\\s*)(?:${AOA})`, "i").exec(text)
  const bare = new RegExp(`\\b(?:zero|z\u00e9ro)\\s+(?:${AOA})`, "i").test(text)
  const aoa = none ? "none" : before ? (before[1] ? "0" : before[2].replace(",", ".")) : capture(text, AOA) || (bare ? "0" : null)
  if (aoa) found.aoa = aoa
  const idk = capture(text, "\\bidk\\b|indice de kiff|\\bkiff\\b")
  const idp = capture(text, "\\bidp\\b|indice de puret[e\u00e9]|\\bpuret[e\u00e9]")
  const scores = [idk && `IDK ${idk}`, idp && `IDP ${idp}`].filter(Boolean)
  const felt = scores.length ? scores.join(" \u00b7 ") : feeling(text)
  if (felt) found.feelings = felt
  const noted = special(text)
  if (noted) found.special = noted
  return found
}

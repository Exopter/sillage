// Finds the debrief checklist points in a transcript. Mirrors
// app/models/debrief_checklist.rb, which fills the same points from the final transcript.

const NUMBER = "[+-]?\\d+(?:[.,]\\d+)?"
const GAP = "[^\\d+-]{0,24}"

/** @param {string} text @param {string} lead @param {string} [value] */
function capture(text, lead, value = NUMBER) {
  const match = new RegExp(`(?:${lead})${GAP}(${value})`, "i").exec(text)
  return match ? match[1].replace(",", ".") : null
}

/** @param {string} transcript @returns {Record<string, string>} */
export function extractChecklist(transcript) {
  const text = String(transcript || "")
  /** @type {Record<string, string>} */
  const found = {}
  const glide = capture(text, "glide\\s*ratio|glide|finesse")
  if (glide) found.glide_ratio = glide
  const speed = capture(text, "speed|vitesse", "\\d{2,3}")
  if (speed) found.speed = `${speed} km/h`
  const cg = capture(text, "\\bc\\.?g\\.?\\b|cent(?:er|re) (?:of|de) gravit[yeé]|centrage")
  if (cg) found.cg = cg
  const aoa = capture(text, "\\ba\\.?o\\.?a\\.?\\b|angle of attack|angle d.attaque|incidence")
  if (aoa) found.aoa = aoa
  const idk = capture(text, "\\bidk\\b|indice de kiff|\\bkiff\\b")
  const idp = capture(text, "\\bidp\\b|indice de puret[eé]|\\bpuret[eé]")
  const scores = [idk && `IDK ${idk}`, idp && `IDP ${idp}`].filter(Boolean)
  if (scores.length) found.feelings = scores.join(" · ")
  if (/special feature|particularit|rien de sp[eé]cial|nothing special|sp[eé]cificit/i.test(text)) found.special = "Noted"
  return found
}

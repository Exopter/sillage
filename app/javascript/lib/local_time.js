// Shows every server-rendered instant in the viewer's own time zone. The server
// writes the UTC text as a fallback; this replaces it and keeps UTC in the tooltip.

/** @type {Record<string, (parts: Record<string, string>) => string>} */
const LAYOUTS = {
  long: p => `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}`,
  seconds: p => `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second}`,
  list: p => `${p.day} ${p.month} ${p.year} \u00b7 ${p.hour}:${p.minute}`,
  short: p => `${p.day} ${p.month} \u00b7 ${p.hour}:${p.minute}`,
  time: p => `${p.hour}:${p.minute}:${p.second}`,
  date: p => `${p.day} ${p.month} ${p.year}`
}

/** @param {Date} date @param {string} layout @param {string} [timeZone] */
export function formatLocalTime(date, layout, timeZone = undefined) {
  const format = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone })
  /** @type {Record<string, string>} */
  const parts = {}
  for (const part of format.formatToParts(date)) parts[part.type] = part.value
  // Browsers disagree on "Sep" and "Sept"; keep the three-letter form the server writes.
  parts.month = (parts.month || "").slice(0, 3)
  return (LAYOUTS[layout] || LAYOUTS.long)(parts)
}

/** @param {ParentNode} root */
export function localizeTimes(root) {
  for (const node of root.querySelectorAll("[data-local-time]:not([data-local-time-done])")) {
    const element = /** @type {HTMLElement} */ (node)
    const date = new Date(element.getAttribute("datetime") || element.dataset.at || "")
    if (Number.isNaN(date.getTime())) continue
    element.title ||= `${element.textContent?.trim()} UTC`
    element.textContent = formatLocalTime(date, element.dataset.localTime || "long")
    element.dataset.localTimeDone = "true"
  }
}

if (typeof document !== "undefined") {
  const run = () => localizeTimes(document)
  for (const name of ["DOMContentLoaded", "turbo:load", "turbo:render", "turbo:frame-load"]) document.addEventListener(name, run)
  // Rows added by scripts or streams after the page has loaded.
  new MutationObserver(records => { if (records.some(record => record.addedNodes.length)) run() }).observe(document.documentElement, { childList: true, subtree: true })
  run()
}

import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {{id: number, code: string, pilot: string, aircraft: string, aircraft_id: number | null, pilot_id: number, destination?: string, started_at: string | null, recording: boolean, debrief_url: string, cancel_url: string, end_url: string}} RemoteFlight
 * @typedef {{gateway_connected: boolean, stop_requested: boolean, close_url: string}} RemoteSession
 * @typedef {{state: "ready" | "waiting" | "remote_off" | "offline", aircraft?: string | null}} RemoteStation
 * @typedef {{phase: string, flights_today: number, server_time?: number, station?: RemoteStation, flight?: RemoteFlight, session?: RemoteSession | null, error?: string}} RemoteState
 * @typedef {Object} Bindings
 * @property {string} stateUrlValue
 * @property {string} flightsUrlValue
 * @property {RemoteState} initialValue
 * @property {HTMLElement} titleTarget
 * @property {HTMLElement} linkTarget
 * @property {HTMLElement} countTarget
 * @property {HTMLElement} savedTarget
 * @property {HTMLElement} savedTextTarget
 * @property {HTMLButtonElement} cancelTarget
 * @property {HTMLElement} pilotNameTarget
 * @property {HTMLElement} aircraftNameTarget
 * @property {HTMLElement} clockTarget
 * @property {HTMLElement} flightStatusTarget
 * @property {HTMLElement} errorTarget
 * @property {HTMLButtonElement} forceCloseTarget
 * @property {HTMLElement} debriefsTarget
 * @property {HTMLSelectElement} aircraftTarget
 * @property {HTMLSelectElement} pilotTarget
 * @property {HTMLSelectElement} destinationTarget
 * @property {HTMLElement} stationTarget
 */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))
const DONE_KEY = "sillage-remote-done"

// Phone remote for chained tunnel flights. The server owns the flight state;
// this controller only moves ahead of it where waiting would cost time:
// the debrief opens as soon as End flight is tapped, and the next flight is
// offered as soon as the debrief is handed off.
export default class extends TypedController {
  static values = { stateUrl: String, flightsUrl: String, initial: Object }
  static targets = ["title", "link", "count", "saved", "savedText", "cancel", "pilotName", "aircraftName", "clock", "flightStatus", "error", "forceClose", "debriefs", "aircraft", "pilot", "destination", "station"]
  /** @type {RemoteState} */
  state = { phase: "ready", flights_today: 0 }
  endedFlight = 0
  pollTimer = 0
  clockTimer = 0
  // How far this phone's clock runs ahead of the server's, in milliseconds.
  skew = 0
  savedTimer = 0
  busy = false

  /** @type {HTMLOptionElement[]} */
  folderOptions = []
  /** @type {HTMLOptGroupElement | null} */
  folderGroup = null

  connect() {
    this.folderGroup = this.destinationTarget.querySelector('optgroup[label="Folders"]')
    this.folderOptions = Array.from(this.folderGroup?.querySelectorAll("option") || [])
    this.filterDestinations()
    this.apply(this.initialValue)
    this.pollTimer = window.setInterval(() => { void this.refresh() }, 2000)
    this.clockTimer = window.setInterval(() => this.renderClock(), 500)
  }

  // Lists only the folders the selected pilot can open, so a flight is never filed out of their reach.
  filterDestinations() {
    if (!this.folderGroup) return
    const pilot = this.pilotTarget.value
    const chosen = this.destinationTarget.value
    const allowed = this.folderOptions.filter((option) => (option.dataset.pilots || "").split(",").includes(pilot))
    this.folderGroup.replaceChildren(...allowed)
    this.folderGroup.hidden = allowed.length === 0
    this.destinationTarget.value = allowed.some((option) => option.value === chosen) || !chosen.startsWith("folder:") ? chosen : "team"
  }

  disconnect() {
    clearInterval(this.pollTimer)
    clearInterval(this.clockTimer)
    clearTimeout(this.savedTimer)
  }

  /** @param {string} url @param {string} [method] @param {Record<string, unknown>} [body] @returns {Promise<{ok: boolean, status: number, data: any}>} */
  async call(url, method = "GET", body = undefined) {
    const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || ""
    const response = await fetch(url, {
      method,
      headers: { Accept: "application/json", "X-CSRF-Token": token, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    let data = {}
    try { data = await response.json() } catch { /* Empty body. */ }
    return { ok: response.ok, status: response.status, data }
  }

  async refresh() {
    if (this.busy) return
    try {
      const result = await this.call(this.stateUrlValue)
      if (result.ok) this.apply(result.data)
      this.linkTarget.dataset.offline = "false"
    } catch { this.linkTarget.dataset.offline = "true"; this.renderLink() }
  }

  /** @returns {number} */
  doneFlight() { return Number(localStorage.getItem(DONE_KEY) || 0) }

  /** @param {RemoteState} state */
  phaseOf(state) {
    const id = state.flight?.id || 0
    // A flight handed off on this phone stays behind it, even while the ground station finishes closing it.
    if (["flight", "debrief"].includes(state.phase) && this.doneFlight() === id) return "ready"
    if (state.phase === "flight" && (this.endedFlight === id || state.session?.stop_requested)) return "debrief"
    return state.phase
  }

  /** @param {RemoteState} state */
  apply(state) {
    this.state = state
    if (state.server_time) this.skew = Date.now() - state.server_time
    const phase = this.phaseOf(state)
    this.element.dataset.phase = phase
    this.element.querySelectorAll("[data-remote-phases]").forEach(node => {
      const section = /** @type {HTMLElement} */ (node)
      section.hidden = !section.dataset.remotePhases?.split(" ").includes(phase)
    })
    const flight = state.flight
    this.countTarget.textContent = `Flight ${state.flights_today + 1}`
    this.titleTarget.textContent = phase === "ready" || !flight ? "Tunnel session" : flight.code
    if (flight) {
      this.pilotNameTarget.textContent = flight.pilot
      this.aircraftNameTarget.textContent = [flight.aircraft, flight.destination].filter(Boolean).join(" \u00b7 ")
    }
    if (phase === "debrief" && flight) void this.openDebrief(flight)
    if (phase === "flight" && flight) {
      const session = state.session
      const waited = flight.started_at ? Date.now() - this.skew - Date.parse(flight.started_at) : 0
      this.element.dataset.recording = String(flight.recording && session?.gateway_connected !== false)
      this.flightStatusTarget.textContent = flight.recording
        ? (session?.gateway_connected === false ? "The ground station stopped answering. Keep going: you can still debrief." : "Recording on the ground station.")
        : (waited < 8000 ? "Waiting for the ground station." : "No ground recording. The flight runs on this phone so you can still debrief.")
      this.cancelTarget.hidden = flight.recording
      this.forceCloseTarget.hidden = !(session && session.gateway_connected === false && session.stop_requested)
    }
    this.renderStation()
    this.renderLink()
    this.renderClock()
  }

  // Said before the flight starts: what, if anything, will record it.
  renderStation() {
    const station = this.state.station
    const state = station?.state || "offline"
    this.stationTarget.dataset.state = state
    this.stationTarget.textContent = state === "ready" ? `Ground station ready${station?.aircraft ? ` \u00b7 ${station.aircraft} heard` : ""}. It records when you start.`
      : state === "waiting" ? "Ground station on, but it hears no aircraft. The flight would only be timed."
      : state === "remote_off" ? "Ground station on with its phone remote switched off. Turn it on in Signal to record."
      : "No ground station. The flight will be timed on this phone so you can still debrief."
  }

  renderLink() {
    const phase = this.element.dataset.phase
    const session = this.state.session
    const offline = this.linkTarget.dataset.offline === "true"
    const flight = this.state.flight
    const [state, label] = offline ? ["down", "No connection"]
      : phase === "flight" ? (flight?.recording && session?.gateway_connected !== false ? ["live", "Recording"] : ["wait", "Not recording"])
      : phase === "debrief" ? ["live", "Debrief"]
      : this.state.station?.state === "ready" ? ["idle", "Station ready"] : ["wait", "No recording"]
    this.linkTarget.dataset.state = state
    this.linkTarget.textContent = label
  }

  renderClock() {
    const started = this.state.flight?.started_at
    if (this.element.dataset.phase !== "flight" || !started) return
    const seconds = Math.max(0, Math.floor((Date.now() - this.skew - Date.parse(started)) / 1000))
    this.clockTarget.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  }

  /** @param {string} message */
  fail(message) {
    this.errorTarget.textContent = message
    this.errorTarget.hidden = !message
  }

  async start() {
    if (this.busy) return
    this.busy = true
    this.fail("")
    try {
      void navigator.wakeLock?.request("screen").catch(() => {})
      let result = await this.call(this.flightsUrlValue, "POST", { aircraft_id: this.aircraftTarget.value, pilot_id: this.pilotTarget.value, destination: this.destinationTarget.value })
      if (result.status === 409 && this.state.session?.close_url) {
        // The previous flight never closed on a silent ground station: close it, then start.
        await this.call(this.state.session.close_url, "POST")
        result = await this.call(this.flightsUrlValue, "POST", { aircraft_id: this.aircraftTarget.value, pilot_id: this.pilotTarget.value, destination: this.destinationTarget.value })
      }
      if (result.ok) this.apply(result.data)
      else if (result.status === 409) this.fail("The previous flight is still closing on the ground station. Try again in a few seconds.")
      else this.fail(result.data.error || "The flight could not be started. Try again.")
    } catch { this.fail("No connection. The flight was not started.") } finally { this.busy = false }
  }

  async cancel() {
    const flight = this.state.flight
    if (!flight || this.busy || !window.confirm("Cancel this flight? Nothing is kept.")) return
    this.busy = true
    try {
      const result = await this.call(flight.cancel_url, "DELETE")
      if (result.ok) this.apply(result.data)
    } finally { this.busy = false }
  }

  async end() {
    const flight = this.state.flight
    if (!flight) return
    // Open the debrief at once; the ground station, if any, finishes saving in the background.
    this.endedFlight = flight.id
    this.apply(this.state)
    try {
      const result = await this.call(flight.end_url, "POST")
      if (result.ok) this.apply(result.data)
    } catch { /* The next refresh retries through the state. */ }
  }

  async forceClose() {
    const session = this.state.session
    if (!session || !window.confirm("Close this flight without the ground station? Data it still holds is kept when it reconnects.")) return
    await this.call(session.close_url, "POST")
    await this.refresh()
  }

  /** @param {RemoteFlight} flight */
  async openDebrief(flight) {
    if (this.debriefsTarget.querySelector(`[data-flight-id="${flight.id}"]`)) return
    const holder = document.createElement("div")
    holder.dataset.flightId = String(flight.id)
    this.debriefsTarget.append(holder)
    try {
      const response = await fetch(flight.debrief_url, { headers: { Accept: "text/html" } })
      if (!response.ok) throw new Error("unavailable")
      holder.outerHTML = await response.text()
    } catch { holder.remove() }
  }

  // Hands the debrief off and offers the next flight; the recorder keeps uploading out of sight.
  next() {
    const flight = this.state.flight
    if (!flight) return
    localStorage.setItem(DONE_KEY, String(flight.id))
    this.announce(`${flight.code} handed to the Pilot Log`)
    for (const node of this.debriefsTarget.children) /** @type {HTMLElement} */ (node).hidden = true
    this.apply(this.state)
  }

  /** @param {string} message */
  announce(message) {
    this.savedTextTarget.textContent = message
    this.savedTarget.hidden = false
    clearTimeout(this.savedTimer)
    this.savedTimer = window.setTimeout(() => { this.savedTarget.hidden = true }, 5000)
  }

  /** @param {Event} event */
  published(event) {
    event.preventDefault()
    const node = event.target
    if (node instanceof HTMLElement) node.remove()
  }

  /** @param {Event} event */
  abandoned(event) {
    const node = event.target
    if (node instanceof HTMLElement) node.remove()
    this.next()
    this.announce("Debrief skipped")
  }
}

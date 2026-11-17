import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {{id: number, code: string, pilot: string, aircraft: string, aircraft_id: number | null, pilot_id: number, destination?: string, started_at: string | null, recording: boolean, debrief_url: string, cancel_url: string, end_url: string}} RemoteFlight
 * @typedef {{gateway_connected: boolean, stop_requested: boolean, close_url: string}} RemoteSession
 * @typedef {{state: "ready" | "waiting" | "offline", aircraft?: string | null}} RemoteStation
 * @typedef {{phase: string, flights_today: number, server_time?: number, station?: RemoteStation, flight?: RemoteFlight, session?: RemoteSession | null, error?: string}} RemoteState
 * @typedef {Object} Bindings
 * @property {string} stateUrlValue
 * @property {string} flightsUrlValue
 * @property {RemoteState} initialValue
 * @property {number} userValue
 * @property {HTMLTemplateElement} debriefTemplateTarget
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

// Phone remote for chained tunnel flights. The server owns the flight state, but the
// connection in a tunnel hall is slow and comes and goes (17 November 2026: fifteen
// seconds to upload one debrief), so no button waits for it: every tap changes the
// screen at once and the request follows in the background, retried until it is through.
export default class extends TypedController {
  static values = { stateUrl: String, flightsUrl: String, initial: Object, user: Number }
  static targets = ["debriefTemplate", "title", "link", "count", "saved", "savedText", "cancel", "pilotName", "aircraftName", "clock", "flightStatus", "error", "forceClose", "debriefs", "aircraft", "pilot", "destination", "station"]
  /** @type {RemoteState} */
  state = { phase: "ready", flights_today: 0 }
  endedFlight = 0
  cancelledFlight = 0
  // End tapped before the server confirmed the start.
  endRequested = false
  /** @type {Promise<void> | null} */
  cancelling = null
  /** Flights whose debrief is on this screen: one recorder per flight, whatever the state says. @type {Set<number>} */
  opened = new Set()
  gone = false
  /** Flights whose end is on its way to the server. @type {Set<number>} */
  ending = new Set()
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
    this.gone = false
    this.apply(this.initialValue)
    void this.resumeUnsent()
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
    this.gone = true
    clearInterval(this.pollTimer)
    clearInterval(this.clockTimer)
    clearTimeout(this.savedTimer)
  }

  /** @param {string} url @param {string} [method] @param {Record<string, unknown>} [body] @returns {Promise<{ok: boolean, status: number, data: any}>} */
  async call(url, method = "GET", body = undefined) {
    const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || ""
    const response = await fetch(url, {
      method,
      // A request stuck on a weak connection is given up, so the screen never freezes behind it.
      signal: AbortSignal.timeout(8000),
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
    // A flight handed off or cancelled on this phone stays behind it, even while the server catches up.
    if (id && ["flight", "debrief"].includes(state.phase) && (this.doneFlight() === id || this.cancelledFlight === id)) return "ready"
    if (id && state.phase === "flight" && (this.endedFlight === id || state.session?.stop_requested)) return "debrief"
    return state.phase
  }

  /** @param {number} delay */
  sleep(delay) { return new Promise(resolve => setTimeout(resolve, delay)) }

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
    if (phase === "debrief" && flight) this.openDebrief(flight)
    if (phase === "flight" && flight) {
      const session = state.session
      const waited = flight.started_at ? Date.now() - this.skew - Date.parse(flight.started_at) : 0
      this.element.dataset.recording = String(flight.recording && session?.gateway_connected !== false)
      this.flightStatusTarget.textContent = flight.recording
        ? (session?.gateway_connected === false ? "The ground station stopped answering. Keep going: you can still debrief." : "Recording on the ground station.")
        : (waited < 8000 ? "Waiting for the ground station." : "No ground recording. The flight runs on this phone so you can still debrief.")
      this.cancelTarget.hidden = flight.recording || !flight.id
      this.forceCloseTarget.hidden = !(session && session.gateway_connected === false && session.stop_requested)
    }
    // A flight ended on this phone that the server still shows running: the end never arrived
    // (no connection, or the page was closed on it). It is delivered again.
    if (state.phase === "flight" && flight?.id && (this.endedFlight === flight.id || this.doneFlight() === flight.id) && !state.session?.stop_requested) void this.deliverEnd(flight)
    this.renderStation()
    this.renderLink()
    this.renderClock()
  }

  /** @param {RemoteFlight} flight */
  async deliverEnd(flight) {
    if (this.ending.has(flight.id) || !flight.end_url) return
    this.ending.add(flight.id)
    try {
      await this.confirm(flight.end_url, "POST", (result) => { if (result.ok && this.state.flight?.id === flight.id) window.setTimeout(() => this.apply(result.data)) })
    } finally { this.ending.delete(flight.id) }
  }

  // Said before the flight starts: what, if anything, will record it.
  renderStation() {
    const station = this.state.station
    const state = station?.state || "offline"
    this.stationTarget.dataset.state = state
    this.stationTarget.textContent = state === "ready" ? `Ground station ready${station?.aircraft ? ` \u00b7 ${station.aircraft} heard` : ""}. It records when you start.`
      : state === "waiting" ? "Ground station on, but it hears no aircraft. The flight would only be timed."
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

  // The flight screen and its clock appear with the tap; the server confirms behind them.
  async start() {
    if (this.busy) return
    this.busy = true
    this.fail("")
    void navigator.wakeLock?.request("screen").catch(() => {})
    const previous = this.state
    const chosen = (/** @type {HTMLSelectElement} */ select) => select.selectedOptions[0]?.textContent?.trim() || ""
    const body = { aircraft_id: this.aircraftTarget.value, pilot_id: this.pilotTarget.value, destination: this.destinationTarget.value }
    this.endRequested = false
    this.apply({ ...previous, phase: "flight", session: null, flight: { id: 0, code: "Starting\u2026", pilot: chosen(this.pilotTarget), aircraft: chosen(this.aircraftTarget), aircraft_id: null, pilot_id: 0,
      started_at: new Date(Date.now() - this.skew).toISOString(), recording: false, debrief_url: "", cancel_url: "", end_url: "" } })
    this.aircraftNameTarget.textContent = chosen(this.aircraftTarget)
    this.flightStatusTarget.textContent = "Starting the flight."
    try {
      if (this.cancelling) await this.cancelling
      const result = await this.create(body)
      if (result.ok) {
        this.apply(result.data)
        if (this.endRequested) void this.end()
      } else {
        this.apply(previous)
        this.fail(result.status === 409 ? "The previous flight is still closing on the ground station. Try again in a few seconds." : result.data.error || "The flight could not be started. Try again.")
      }
    } catch {
      this.apply(previous)
      this.fail("No connection. The flight was not started.")
    } finally { this.busy = false; this.endRequested = false }
  }

  // Asks the server for the flight, again when the connection drops. A request may have
  // arrived without its answer: the flight it created is then found in the state.
  /** @param {Record<string, unknown>} body @returns {Promise<{ok: boolean, status: number, data: any}>} */
  async create(body) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        let result = await this.call(this.flightsUrlValue, "POST", body)
        if (result.status === 409) {
          const state = await this.call(this.stateUrlValue)
          const open = state.ok && state.data.phase === "flight" ? state.data.flight : null
          if (open && (this.doneFlight() === open.id || this.endedFlight === open.id)) {
            // The flight in the way was ended on this phone and the server never heard: end it, then start.
            await this.call(open.end_url, "POST")
            result = await this.call(this.flightsUrlValue, "POST", body)
          } else if (open && attempt > 0) return state
        }
        if (result.status === 409 && this.state.session?.close_url) {
          // The previous flight never closed on a silent ground station: close it, then start.
          await this.call(this.state.session.close_url, "POST")
          result = await this.call(this.flightsUrlValue, "POST", body)
        }
        return result
      } catch (error) {
        if (attempt >= 3 || this.gone) throw error
        this.flightStatusTarget.textContent = "Weak connection. Still starting the flight."
        await this.sleep(1000)
      }
    }
  }

  // Back to the next flight at once; the withdrawal reaches the server in the background.
  cancel() {
    const flight = this.state.flight
    if (!flight?.id || this.busy || !window.confirm("Cancel this flight? Nothing is kept.")) return
    this.cancelledFlight = flight.id
    this.apply(this.state)
    this.cancelling = this.confirm(flight.cancel_url, "DELETE", (result) => {
      // The ground station picked the flight up first: it is running, so show it again.
      if (result.status === 409) this.cancelledFlight = 0
      if (result.ok) this.apply(result.data)
      else this.fail(result.data.error || "The flight could not be cancelled.")
    }).finally(() => { this.cancelling = null })
  }

  // Open the debrief at once; the ground station, if any, finishes saving in the background.
  end() {
    const flight = this.state.flight
    if (!flight) return
    if (!flight.id) {
      this.endRequested = true
      this.flightStatusTarget.textContent = "Ending as soon as the flight is confirmed."
      return
    }
    this.endedFlight = flight.id
    this.apply(this.state)
  }

  // Delivers a request the screen has already acted on: retried until the server answers.
  /** @param {string} url @param {string} method @param {(result: {ok: boolean, status: number, data: any}) => void} done */
  async confirm(url, method, done) {
    for (let attempt = 0; !this.gone; attempt += 1) {
      try {
        const result = await this.call(url, method)
        if (result.ok || result.status < 500) { done(result); return }
      } catch { /* No connection: try again. */ }
      await this.sleep(Math.min(8000, 1000 * (attempt + 1)))
    }
  }

  async forceClose() {
    const session = this.state.session
    if (!session || !window.confirm("Close this flight without the ground station? Data it still holds is kept when it reconnects.")) return
    try { await this.call(session.close_url, "POST") } catch { /* The next refresh shows where it stands. */ }
    await this.refresh()
  }

  // The debrief screen is built from the copy already on the page: no request, no wait.
  /** @param {{id: number, code: string}} flight @param {boolean} [hidden] */
  openDebrief(flight, hidden = false) {
    if (!flight.id || this.opened.has(flight.id)) return
    this.opened.add(flight.id)
    const code = flight.code.replace(/[&<>"']/g, "")
    const holder = document.createElement("div")
    holder.innerHTML = this.debriefTemplateTarget.innerHTML.replaceAll("FLIGHT_ID", String(flight.id)).replaceAll("FLIGHT_CODE", code)
    const section = /** @type {HTMLElement | null} */ (holder.firstElementChild)
    if (!section) return
    section.hidden = hidden
    this.debriefsTarget.append(section)
  }

  // Debriefs still on this phone, left by a lost connection or a closed page, are sent on
  // arrival: each gets its recorder back, out of sight, and the recorder sends it.
  async resumeUnsent() {
    try {
      /** @type {IDBDatabase} */
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("sillage-debriefs", 1)
        request.onupgradeneeded = () => request.result.createObjectStore("recordings")
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const store = database.transaction("recordings", "readonly").objectStore("recordings")
      /** @param {IDBRequest} request @returns {Promise<any>} */
      const read = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      const [keys, records] = await Promise.all([read(store.getAllKeys()), read(store.getAll())])
      database.close()
      keys.forEach((/** @type {unknown} */ key, /** @type {number} */ index) => {
        const [owner, flight] = String(key).split(":").map(Number)
        if (owner === this.userValue && flight && records[index]?.parts?.length) this.openDebrief({ id: flight, code: "A saved debrief" }, true)
      })
    } catch { /* No device store: nothing was left behind. */ }
  }

  // Hands the debrief off and offers the next flight; the recorder keeps uploading out of sight.
  next() {
    const flight = this.state.flight
    if (!flight) return
    localStorage.setItem(DONE_KEY, String(flight.id))
    this.announce(`${flight.code} saved. Sending it to the Pilot Log.`)
    for (const node of this.debriefsTarget.children) /** @type {HTMLElement} */ (node).hidden = true
    this.apply(this.state)
  }

  /** @param {string} message @param {boolean} [stays] */
  announce(message, stays = false) {
    this.savedTextTarget.textContent = message
    this.savedTarget.hidden = false
    clearTimeout(this.savedTimer)
    if (!stays) this.savedTimer = window.setTimeout(() => { this.savedTarget.hidden = true }, 5000)
  }

  /** @param {Event} event */
  code(event) { return (event.target instanceof HTMLElement && event.target.dataset.flightCode) || "The debrief" }

  /** @param {Event} event */
  published(event) {
    event.preventDefault()
    this.announce(`${this.code(event)} is in the Pilot Log.`)
    const node = event.target
    if (node instanceof HTMLElement) node.remove()
  }

  // The upload did not get through: say where the audio is, and that nothing is to be done.
  /** @param {Event} event */
  waiting(event) {
    const node = event.target
    if (node instanceof HTMLElement && !node.hidden) return
    this.announce(`${this.code(event)} is saved on this phone. It is sent as soon as the connection is back.`, true)
  }

  /** @param {Event} event */
  empty(event) { this.announce(`${this.code(event)}: no audio was captured.`, true) }

  /** @param {Event} event */
  abandoned(event) {
    const node = event.target
    if (node instanceof HTMLElement) node.remove()
    this.next()
    this.announce("Debrief skipped")
  }
}

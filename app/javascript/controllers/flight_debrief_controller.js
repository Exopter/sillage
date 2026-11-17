import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} Bindings
 * @property {string} urlValue
 * @property {string} keyValue
 * @property {string} commentsUrlValue
 * @property {number} replacesValue
 * @property {boolean} prewarmValue
 * @property {boolean} autosendValue
 * @property {HTMLElement} statusTarget
 * @property {HTMLElement} durationTarget
 * @property {HTMLMeterElement} levelTarget
 * @property {HTMLElement} transcriptTarget
 */
/** @typedef {{uuid: string, parts: Blob[], type: string, url: string | null}} SavedRecording */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))
export default class extends TypedController {
  static values = { url: String, key: String, commentsUrl: String, replaces: Number, prewarm: Boolean, autosend: Boolean }
  static targets = ["status", "transcript", "duration", "level"]
  /** @type {MediaRecorder | null} */
  recorder = null
  /** @type {MediaStream | null} */
  stream = null
  /** @type {RTCPeerConnection | null} */
  peer = null
  /** @type {RTCDataChannel | null} */
  channel = null
  /** @type {IDBDatabase | null} */
  database = null
  /** @type {Blob[]} */
  parts = []
  // The live connection opened ahead of the recording, when the screen asks for it.
  warm = false
  /** @type {Promise<void> | null} */
  preparation = null
  /** @type {Promise<MediaStream> | null} */
  mic = null
  // Identity of the recording, chosen on the phone so that recording never waits for the server.
  uuid = ""
  /** @type {string | null} */
  debriefUrl = null
  sending = false
  keptLive = ""
  keptAt = 0
  stopped = false
  /** @type {(() => void) | null} */
  wake = null
  kick = () => { if (document.visibilityState !== "hidden") this.wake?.() }
  floor = 1
  spokeAt = 0
  pending = 0
  sentAt = 0
  turns = new Map()
  liveComplete = false
  committed = new Set()
  completed = new Set()
  liveFailed = false
  abandoned = false
  /** @type {SavedRecording | null} */
  saved = null
  writeQueue = Promise.resolve()
  commitTimer = 0
  meterTimer = 0
  /** @type {AudioContext | null} */
  audioContext = null
  /** @type {WakeLockSentinel | null} */
  wakeLock = null

  /** @param {string} state */
  showState(state) {
    this.element.dataset.state = state
    this.element.querySelectorAll("[data-debrief-states]").forEach(node => {
      const element = /** @type {HTMLElement} */ (node)
      element.hidden = !element.dataset.debriefStates?.split(" ").includes(state)
    })
    const pause = this.element.querySelector('[data-action="flight-debrief#pause"]')
    if (pause) pause.textContent = state === "paused" ? "Resume recording" : "Pause"
  }

  async connect() {
    this.stopped = false
    this.showState("idle")
    try {
      this.database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("sillage-debriefs", 1)
        request.onupgradeneeded = () => request.result.createObjectStore("recordings")
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      this.saved = (await this.store("get")) || null
      // An entry with nothing recorded is a leftover: it is dropped here, on this device only.
      if (this.saved && !this.saved.parts.length) { await this.store("delete"); this.saved = null }
    } catch { this.saved = null }
    window.addEventListener("online", this.kick)
    document.addEventListener("visibilitychange", this.kick)
    this.showState(this.saved ? "recovery" : "idle")
    if (this.saved) {
      this.statusTarget.textContent = "A saved debrief is available. Recover it before starting another."
      // A debrief left on the phone by a lost connection or a closed page goes out by itself.
      if (this.autosendValue) void this.send()
    } else if (this.prewarmValue) this.preparation = this.prepare()
  }

  // Opens the microphone and the live transcription before the operator records, so
  // the first words are heard. The microphone track stays disabled until the tap:
  // nothing said before it is sent or kept. Recording never depends on this.
  async prepare() {
    try {
      this.stream = await this.microphone()
      if (!this.recorder) this.stream.getAudioTracks().forEach(track => { track.enabled = false })
      await this.reserve()
      await this.live()
      this.warm = true
    } catch { /* The tap on the microphone records anyway; the connection is retried from there. */ }
  }

  // One microphone request, shared by the early connection and the tap.
  microphone() {
    // A refusal is not remembered: the next tap asks again.
    this.mic ||= navigator.mediaDevices.getUserMedia({ audio: true }).catch(error => { this.mic = null; throw error })
    return this.mic
  }

  // Tells the server about this recording. The same identity is sent again with the upload,
  // so a reservation that never got through costs nothing.
  async reserve() {
    if (this.debriefUrl) return
    this.uuid ||= crypto.randomUUID()
    const reservation = await this.api(this.urlValue, { uuid: this.uuid })
    this.debriefUrl = reservation.url
    // A checklist beside the recorder reads the live transcript through this debrief.
    this.element.dataset.debriefUrl = reservation.url
    if (this.saved?.uuid === this.uuid) this.saved.url = reservation.url
  }

  // Gives back a connection or reservation that holds no recording.
  async release() {
    this.warm = false
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.mic = null
    this.peer?.close()
    this.peer = null
    this.channel = null
    const url = this.debriefUrl || this.saved?.url
    this.saved = null
    this.debriefUrl = null
    this.uuid = ""
    delete this.element.dataset.debriefUrl
    try { if (url) await this.api(url, {}, "DELETE") } catch { /* It expires on the server. */ }
    try { await this.store("delete") } catch { /* Nothing was stored. */ }
  }

  disconnect() {
    this.stopped = true
    this.wake?.()
    window.removeEventListener("online", this.kick)
    document.removeEventListener("visibilitychange", this.kick)
    if (this.recorder && this.recorder.state !== "inactive") { this.recorder.stop(); return }
    // Nothing recorded: the early connection and its reservation are given back.
    if (!this.saved && !this.sending) { void this.release(); return }
    this.stream?.getTracks().forEach(track => track.stop())
    this.peer?.close()
    clearInterval(this.meterTimer)
    if (this.audioContext && this.audioContext.state !== "closed") void this.audioContext.close().catch(() => {})
    void this.wakeLock?.release().catch(() => {})
  }

  /** @param {string} method @param {SavedRecording | undefined} [value] @returns {Promise<any>} */
  store(method, value = undefined) {
    return new Promise((resolve, reject) => {
      if (!this.database) { reject(new Error("Local storage is unavailable")); return }
      const transaction = this.database.transaction("recordings", method === "get" ? "readonly" : "readwrite")
      const store = transaction.objectStore("recordings")
      const request = method === "put" ? store.put(value, this.keyValue) : method === "delete" ? store.delete(this.keyValue) : store.get(this.keyValue)
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }

  /** @param {string} url @param {any} [body] @param {string} [method] */
  async api(url, body = {}, method = "POST") {
    const multipart = body instanceof FormData
    // A request that hangs on a weak connection is given up, so the retry can take over.
    const signal = AbortSignal.timeout(multipart ? 180000 : 15000)
    const response = await fetch(url, { method, signal, headers: { Accept: "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "", ...(multipart ? {} : { "Content-Type": "application/json" }) }, ...(method === "GET" ? {} : { body: multipart ? body : JSON.stringify(body) }) })
    if (!response.ok) throw Object.assign(new Error(`Request failed (${response.status}). Saved audio is retained; retry when connected.`), { status: response.status })
    return response.status === 204 ? {} : response.json()
  }

  // Records at once, on the phone alone. The server reservation and the live transcription
  // join in the background: a slow or absent connection never delays the first word.
  async start() {
    if (this.recorder && this.recorder.state !== "inactive") return
    if (this.saved) { this.statusTarget.textContent = "Recover the saved debrief first."; return }
    try {
      this.stream = await this.microphone()
      this.stream.getAudioTracks().forEach(track => { track.enabled = true })
      // Nothing said before the tap is transcribed.
      if (this.channel?.readyState === "open") this.channel.send(JSON.stringify({ type: "input_audio_buffer.clear" }))
      this.uuid ||= crypto.randomUUID()
      this.saved = { uuid: this.uuid, parts: [], type: "", url: this.debriefUrl }
      this.abandoned = false
      this.parts = []; this.turns.clear(); this.committed.clear(); this.completed.clear(); this.liveFailed = false; this.liveComplete = false; this.floor = 1; this.spokeAt = 0; this.pending = 0; this.sentAt = 0
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(value => MediaRecorder.isTypeSupported(value))
      this.recorder = new MediaRecorder(this.stream, type ? { mimeType: type } : {})
      this.saved.type = this.recorder.mimeType
      this.recorder.ondataavailable = event => {
        if (!event.data.size) return
        this.parts.push(event.data)
        if (!this.saved) return
        this.saved.parts = this.parts.slice()
        const snapshot = { ...this.saved }
        this.writeQueue = this.writeQueue.then(() => this.store("put", snapshot)).catch(() => { this.statusTarget.textContent = "Local saving failed. Finish and download or upload before leaving." })
      }
      this.recorder.onstop = () => { void this.finish() }
      this.recorder.start(2000)
      this.showState("recording")
      this.statusTarget.textContent = "Recording\u2026 Keep this screen open."
      this.meter(this.stream)
      if (navigator.wakeLock) void navigator.wakeLock.request("screen").then(lock => { if (this.recorder?.state === "recording") this.wakeLock = lock; else void lock.release() }).catch(() => {})
      void this.link()
    } catch (error) {
      const denied = error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)
      // Nothing was captured: the next tap asks for the microphone again.
      this.mic = null
      this.stream = null
      this.saved = null
      this.showState("idle")
      this.statusTarget.textContent = denied ? "Microphone access is blocked. Allow it for this site, then record again." : error instanceof Error ? error.message : String(error)
    }
  }

  // Joins the server and the live transcription to a recording already running, and keeps
  // trying while it runs. Failing here only costs the live transcript.
  async link() {
    for (let attempt = 0; this.recorder?.state !== "inactive" && !this.stopped; attempt += 1) {
      try {
        if (this.preparation) { await this.preparation; this.preparation = null }
        await this.reserve()
        const alive = this.peer && !["failed", "closed", "disconnected"].includes(this.peer.connectionState)
        if (!alive) { this.peer?.close(); await this.live() }
        return
      } catch {
        if (this.recorder?.state === "recording") this.statusTarget.textContent = "Recording on this phone. The transcript follows once it is sent."
        await this.wait(Math.min(15000, 3000 * (attempt + 1)))
      }
    }
  }

  /** Waits, and returns early when the connection or the screen comes back. @param {number} delay */
  wait(delay) {
    return new Promise(resolve => {
      const timer = setTimeout(done, delay)
      const controller = this
      function done() { clearTimeout(timer); if (controller.wake === done) controller.wake = null; resolve(undefined) }
      this.wake = done
    })
  }

  /** @param {MediaStream} stream */
  meter(stream) {
    this.audioContext = new AudioContext()
    const analyser = this.audioContext.createAnalyser()
    analyser.fftSize = 256
    this.audioContext.createMediaStreamSource(stream).connect(analyser)
    const values = new Uint8Array(analyser.frequencyBinCount)
    let elapsed = 0
    let lastTick = performance.now()
    this.meterTimer = window.setInterval(() => {
      const now = performance.now()
      if (this.recorder?.state === "recording") elapsed += now - lastTick
      lastTick = now
      analyser.getByteTimeDomainData(values)
      this.levelTarget.value = Math.min(1, Math.sqrt(values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / values.length) * 4)
      this.phrase(this.levelTarget.value, now)
      this.element.style.setProperty("--debrief-level", this.levelTarget.value.toFixed(2))
      const seconds = Math.floor(elapsed / 1000)
      this.durationTarget.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    }, 200)
  }

  async live() {
    if (!this.debriefUrl || !this.stream) return
    const secret = await this.api(`${this.debriefUrl}/realtime`)
    this.peer = new RTCPeerConnection()
    for (const track of this.stream.getAudioTracks()) this.peer.addTrack(track, this.stream)
    this.channel = this.peer.createDataChannel("oai-events")
    this.channel.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.type === "input_audio_buffer.committed") this.committed.add(message.item_id)
      if (message.type === "error" || message.type === "conversation.item.input_audio_transcription.failed") this.liveFailed = true
      if (message.type === "conversation.item.input_audio_transcription.delta") {
        this.turns.set(message.item_id, (this.turns.get(message.item_id) || "") + message.delta)
      } else if (message.type === "conversation.item.input_audio_transcription.completed") {
        this.completed.add(message.item_id)
        this.turns.set(message.item_id, message.transcript)
      }
      this.transcriptTarget.textContent = [...this.turns.values()].join("\n")
      this.keepLive()
    }
    const offer = await this.peer.createOffer()
    await this.peer.setLocalDescription(offer)
    const response = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${secret.value}`, "Content-Type": "application/sdp" }, body: offer.sdp })
    if (!response.ok) throw new Error("Live transcription unavailable")
    await this.peer.setRemoteDescription({ type: "answer", sdp: await response.text() })
  }

  // Hands the server what has been heard so far, a few seconds apart. If the audio never
  // arrives, the debrief is written from these words instead of being lost with it.
  /** @param {boolean} [now] */
  keepLive(now = false) {
    const transcript = [...this.turns.values()].join("\n")
    if (!this.debriefUrl || !transcript.trim() || transcript === this.keptLive) return
    if (!now && Date.now() - this.keptAt < 4000) return
    this.keptAt = Date.now()
    this.keptLive = transcript
    void this.api(`${this.debriefUrl}/live`, { transcript, checklist: this.checklist() }).catch(() => { this.keptLive = "" })
  }

  // Sends what was just said for transcription once the pilot has really paused. Each send is
  // transcribed on its own, so a cut inside a sentence costs words: on 17 November 2026 a
  // 400 ms pause split "3 point | two" and "a | symmetrical", and the pieces were misread.
  // A pause is now 900 ms of quiet, and speech without one is sent every eight seconds
  // (it was four). The noise floor follows the room, so a loud tunnel hall still shows pauses.
  /** @param {number} level @param {number} now */
  phrase(level, now) {
    if (this.channel?.readyState !== "open" || this.recorder?.state !== "recording") return
    this.floor = Math.min(level, this.floor * 0.995 + level * 0.005 + 0.001)
    this.sentAt ||= now
    if (level > this.floor * 1.6 + 0.04) { this.spokeAt = now; this.pending ||= now }
    const paused = this.pending > 0 && now - this.spokeAt >= 900 && now - this.pending >= 1200
    if (!paused && now - this.sentAt < 8000) return
    this.channel.send(JSON.stringify({ type: "input_audio_buffer.commit" }))
    this.pending = 0
    this.sentAt = now
  }

  pause() {
    if (this.recorder?.state === "recording") { this.recorder.pause(); this.showState("paused"); this.stream?.getAudioTracks().forEach(track => { track.enabled = false }); this.statusTarget.textContent = "Paused" }
    else if (this.recorder?.state === "paused") { this.stream?.getAudioTracks().forEach(track => { track.enabled = true }); this.recorder.resume(); this.showState("recording"); this.statusTarget.textContent = "Recording…" }
  }

  stop() { if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop() }

  async finish() {
    this.showState("busy")
    this.statusTarget.textContent = "Saving your recording\u2026"
    clearInterval(this.commitTimer)
    clearInterval(this.meterTimer)
    // Nothing here may keep the recording from being sent.
    try { if (this.audioContext?.state !== "closed") await this.audioContext?.close() } catch { /* Already closed. */ }
    try { await this.wakeLock?.release() } catch { /* Already released. */ }
    this.keepLive(true)
    const live = this.settleLive()
    await this.writeQueue
    if (this.abandoned) { await live; await this.dropSaved(); return }
    await this.send(live)
  }

  // Lets the live transcription finish its last words while the audio is already uploading.
  async settleLive() {
    try {
      this.stream?.getAudioTracks().forEach(track => { track.enabled = false })
      if (this.channel?.readyState === "open") {
        const previousCount = this.committed.size
        this.channel.send(JSON.stringify({ type: "input_audio_buffer.commit" }))
        await new Promise(resolve => setTimeout(resolve, 2000))
        this.liveComplete = !this.liveFailed && this.committed.size > previousCount && [...this.committed].every(id => this.completed.has(id))
      }
      this.keepLive(true)
    } catch { this.liveComplete = false } finally {
      this.stream?.getTracks().forEach(track => track.stop())
      this.stream = null
      this.mic = null
      this.peer?.close()
    }
  }

  // The button: send what this device holds.
  async recover() {
    if (this.recorder && this.recorder.state !== "inactive") { this.statusTarget.textContent = "Finish recording first."; return }
    this.wake?.()
    await this.send()
  }

  // Sends the saved recording and keeps trying until it is through: after a failed attempt the
  // audio stays on the device and the next attempt follows by itself, at once when the
  // connection or the screen comes back. Only an answer that will not change stops it.
  /** @param {Promise<void>} [live] */
  async send(live = Promise.resolve()) {
    if (this.sending) return
    this.sending = true
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          this.showState("busy")
          await this.upload(live)
          return
        } catch (error) {
          const status = /** @type {{status?: number}} */ (error).status || 0
          const final = !this.saved || (status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status))
          this.showState(this.saved ? "recovery" : "idle")
          this.statusTarget.textContent = error instanceof Error ? error.message : String(error)
          // Nothing was captured: the screen that moved on must be able to say so.
          if (!this.saved) this.element.dispatchEvent(new CustomEvent("flight-debrief:empty", { bubbles: true }))
          if (final || this.stopped) return
          this.element.dispatchEvent(new CustomEvent("flight-debrief:waiting", { bubbles: true }))
          await this.wait(Math.min(30000, 2000 * 2 ** attempt))
          if (this.stopped) return
        }
      }
    } finally { this.sending = false }
  }

  /** @param {Promise<void>} live */
  async upload(live) {
    // What is in memory is the freshest copy; a reopened page reads the device store.
    if (!this.saved?.parts.length) this.saved = (await this.store("get")) || null
    if (!this.saved) throw new Error("No saved recording on this device.")
    const debrief = await this.api(this.urlValue, { uuid: this.saved.uuid })
    this.saved.url = debrief.url
    try { await this.store("put", this.saved) } catch { /* The copy in memory is still sent. */ }
    if (debrief.status === "recording") {
      const form = new FormData()
      form.append("audio", new Blob(this.saved.parts, { type: this.saved.type }), this.saved.type.includes("mp4") ? "debrief.mp4" : this.saved.type.includes("ogg") ? "debrief.ogg" : "debrief.webm")
      await this.api(`${debrief.url}/upload`, form)
    }
    await live
    await this.api(`${debrief.url}/process_audio`, { transcript: this.liveComplete ? [...this.committed].map(id => this.turns.get(id)).join("\n") : undefined, checklist: this.checklist(), replaces: this.replacesValue || undefined })
    // The entry is in the Pilot log from here on; the summary is written in the background.
    try { await this.store("delete") } catch { /* The server already holds the audio. */ }
    this.saved = null
    this.uuid = ""
    this.debriefUrl = null
    this.showState("published")
    this.statusTarget.textContent = "Saved to the Pilot Log. The summary is being written."
    this.refreshLog()
  }

  /** Checklist points ticked beside the recorder, when the page has a checklist. */
  checklist() {
    try { return JSON.parse(this.element.dataset.checklist || "null") || undefined } catch { return undefined }
  }

  // Leaves the recording without publishing anything: used to skip a debrief between chained flights.
  async abandon() {
    const recording = Boolean(this.recorder && this.recorder.state !== "inactive")
    if (recording && !window.confirm("Skip this debrief? What was recorded is discarded.")) return
    this.abandoned = true
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop()
    else await this.dropSaved()
  }

  async dropSaved() {
    this.preparation = null
    await this.release()
    this.showState("idle")
    this.element.dispatchEvent(new CustomEvent("flight-debrief:abandoned", { bubbles: true }))
  }

  refreshLog() {
    // A host page that chains flights handles the hand-over itself.
    if (!this.element.dispatchEvent(new CustomEvent("flight-debrief:published", { bubbles: true, cancelable: true }))) return
    const frame = /** @type {any} */ (this.element.closest("turbo-frame"))
    if (frame && this.commentsUrlValue) frame.src = this.commentsUrlValue
    else window.location.reload()
  }

  async discard() {
    if (this.recorder && this.recorder.state !== "inactive") { this.statusTarget.textContent = "Finish recording before discarding."; return }
    if (!this.saved || !window.confirm("Delete this unpublished debrief and its saved audio?")) return
    try {
      if (this.saved.url) await this.api(this.saved.url, {}, "DELETE")
      await this.store("delete")
      this.saved = null
      this.uuid = ""
      this.debriefUrl = null
      this.showState("idle")
      this.transcriptTarget.textContent = ""
      this.statusTarget.textContent = "Debrief discarded. You can record again."
    } catch (error) { this.showState(this.saved ? "recovery" : "idle"); this.statusTarget.textContent = error instanceof Error ? error.message : String(error) }
  }
}

import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {Object} Bindings
 * @property {string} urlValue
 * @property {string} keyValue
 * @property {HTMLElement} statusTarget
 * @property {HTMLElement} transcriptTarget
 * @property {HTMLTextAreaElement} summaryTarget
 */
/** @typedef {{uuid: string, parts: Blob[], type: string, url: string | null}} SavedRecording */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))
export default class extends TypedController {
  static values = { url: String, key: String }
  static targets = ["status", "transcript", "summary"]
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
  turns = new Map()
  liveComplete = false
  committed = new Set()
  completed = new Set()
  liveFailed = false
  /** @type {SavedRecording | null} */
  saved = null
  writeQueue = Promise.resolve()
  pollTimer = 0
  commitTimer = 0

  async connect() {
    this.database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sillage-debriefs", 1)
      request.onupgradeneeded = () => request.result.createObjectStore("recordings")
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    this.saved = await this.store("get")
    if (this.saved) this.statusTarget.textContent = "A saved debrief is available. Recover it before starting another."
  }

  disconnect() {
    if (this.recorder?.state !== "inactive") this.recorder?.stop()
    this.stream?.getTracks().forEach(track => track.stop())
    this.peer?.close()
    clearInterval(this.pollTimer)
    clearInterval(this.commitTimer)
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
    const response = await fetch(url, { method, headers: { Accept: "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "", ...(multipart ? {} : { "Content-Type": "application/json" }) }, ...(method === "GET" ? {} : { body: multipart ? body : JSON.stringify(body) }) })
    if (!response.ok) throw new Error(`Request failed (${response.status}). Saved audio is retained; retry when connected.`)
    return response.status === 204 ? {} : response.json()
  }

  async start() {
    try {
      if (this.saved || this.recorder?.state === "recording") throw new Error("Recover the saved debrief first.")
      const reservation = await this.api(this.urlValue, { uuid: crypto.randomUUID() })
      this.saved = { uuid: reservation.uuid, parts: [], type: "", url: reservation.url }
      await this.store("put", this.saved)
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.parts = []; this.turns.clear(); this.committed.clear(); this.completed.clear(); this.liveFailed = false; this.liveComplete = false
      await this.store("put", this.saved || undefined)
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
      this.statusTarget.textContent = "Recording… Keep this screen open."
      try {
        const debrief = await this.api(this.urlValue, { uuid: this.saved.uuid })
        this.saved.url = debrief.url
        await this.live()
      } catch { this.statusTarget.textContent = "Recording locally. Transcription will run after upload." }
    } catch (error) { this.statusTarget.textContent = error instanceof Error ? error.message : String(error) }
  }

  async live() {
    if (!this.saved?.url || !this.stream) return
    const secret = await this.api(`${this.saved.url}/realtime`)
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
    }
    const offer = await this.peer.createOffer()
    await this.peer.setLocalDescription(offer)
    const response = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: `Bearer ${secret.value}`, "Content-Type": "application/sdp" }, body: offer.sdp })
    if (!response.ok) throw new Error("Live transcription unavailable")
    await this.peer.setRemoteDescription({ type: "answer", sdp: await response.text() })
    this.commitTimer = window.setInterval(() => { if (this.channel?.readyState === "open" && this.recorder?.state === "recording") this.channel.send(JSON.stringify({ type: "input_audio_buffer.commit" })) }, 10000)
  }

  pause() {
    if (this.recorder?.state === "recording") { this.recorder.pause(); this.stream?.getAudioTracks().forEach(track => { track.enabled = false }); this.statusTarget.textContent = "Paused" }
    else if (this.recorder?.state === "paused") { this.stream?.getAudioTracks().forEach(track => { track.enabled = true }); this.recorder.resume(); this.statusTarget.textContent = "Recording…" }
  }

  stop() { if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop() }

  async finish() {
    clearInterval(this.commitTimer)
    this.stream?.getAudioTracks().forEach(track => { track.enabled = false })
    if (this.channel?.readyState === "open") {
      this.channel.send(JSON.stringify({ type: "input_audio_buffer.commit" }))
      await new Promise(resolve => setTimeout(resolve, 2000))
      this.liveComplete = !this.liveFailed && this.committed.size > 0 && [...this.committed].every(id => this.completed.has(id))
    }
    this.stream?.getTracks().forEach(track => track.stop())
    this.peer?.close()
    await this.writeQueue
    await this.recover()
  }

  async recover() {
    try {
      if (this.recorder && this.recorder.state !== "inactive") throw new Error("Finish recording first.")
      this.saved = await this.store("get")
      if (!this.saved) throw new Error("No saved recording on this device.")
      const debrief = await this.api(this.urlValue, { uuid: this.saved.uuid })
      this.saved.url = debrief.url
      await this.store("put", this.saved || undefined)
      if (debrief.status === "recording") {
        const form = new FormData()
        form.append("audio", new Blob(this.saved.parts, { type: this.saved.type }), this.saved.type.includes("mp4") ? "debrief.mp4" : "debrief.webm")
        await this.api(`${debrief.url}/upload`, form)
      }
      await this.api(`${debrief.url}/process_audio`, { transcript: this.liveComplete ? [...this.committed].map(id => this.turns.get(id)).join("\n") : undefined })
      this.statusTarget.textContent = "Audio saved. Preparing transcript and summary…"
      clearInterval(this.pollTimer)
      this.pollTimer = window.setInterval(() => this.poll(), 3000)
      await this.poll()
    } catch (error) { this.statusTarget.textContent = error instanceof Error ? error.message : String(error) }
  }

  async poll() {
    try {
      if (!this.saved?.url) return
      const debrief = await this.api(this.saved.url, {}, "GET")
      if (["ready", "published", "failed"].includes(debrief.status)) {
        clearInterval(this.pollTimer)
        this.statusTarget.textContent = debrief.error_message || (debrief.status === "published" ? "Published to Pilot Log." : "Ready to review and publish.")
        this.summaryTarget.value = debrief.summary || ""
        this.transcriptTarget.textContent = debrief.transcript || ""
      }
    } catch { this.statusTarget.textContent = "Connection interrupted. Audio is saved; retry when connected." }
  }

  async discard() {
    if (this.recorder && this.recorder.state !== "inactive") { this.statusTarget.textContent = "Finish recording before discarding."; return }
    if (!this.saved || !window.confirm("Delete this unpublished debrief and its saved audio?")) return
    try {
      if (this.saved.url) await this.api(this.saved.url, {}, "DELETE")
      await this.store("delete")
      this.saved = null
      this.statusTarget.textContent = "Debrief discarded. You can record again."
    } catch (error) { this.statusTarget.textContent = error instanceof Error ? error.message : String(error) }
  }

  async publish() {
    try {
      if (!this.saved?.url) return
      await this.api(`${this.saved.url}/publish`, { summary: this.summaryTarget.value })
      await this.store("delete")
      this.saved = null
      window.location.reload()
    } catch (error) { this.statusTarget.textContent = error instanceof Error ? error.message : String(error) }
  }
}

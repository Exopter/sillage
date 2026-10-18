import { PartialFdrFile } from "fdr_partial_file"

/** @type {Record<string, number>} */
const ACTIONS = { priority: 1, skip: 2, restore: 3, pause: 4, resume: 5, catalog: 7 }
/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** @typedef {{fileIndex: number, bootId: number, sizeBytes: number, flags: number, durationMs?: number | null, startedAtUnixMs?: number | null}} Entry */
/** @typedef {import("./fdr_sync_protocol").UsbFdrClient} Client */
/** @typedef {Awaited<ReturnType<Client["nextImport"]>>} Preparation */

export class FdrImportQueue {
  /** @param {HTMLElement | null} element @param {() => void} interrupt */
  constructor(element, interrupt) {
    this.element = element
    this.interrupt = interrupt
    /** @type {Client | null} */ this.client = null
    this.deviceId = ""
    this.bootId = 0
    this.epoch = 0
    this.paused = false
    this.running = false
    this.busy = false
    this.cursor = 0
    this.showShort = false
    this.wifiReady = false
    /** @type {Set<number>} */ this.pendingCommands = new Set()
    this.checkingCommands = false
    this.commandFailed = false
    /** @type {Map<number, Entry>} */ this.entries = new Map()
    /** @type {Set<number>} */ this.selected = new Set()
    /** @param {Event} event */
    this.click = (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-import-action]") : null
      if (button instanceof HTMLElement) void this.action(button.dataset.importAction || "").catch((error) => this.notice(error.message))
    }
    /** @param {Event} event */
    this.change = (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) return
      if (input.hasAttribute("data-import-show-short")) { this.showShort = input.checked; this.render(); return }
      const index = Number(input.value)
      if (input.checked) this.selected.add(index)
      else this.selected.delete(index)
      this.updateButtons()
    }
    element?.addEventListener("click", this.click)
    element?.addEventListener("change", this.change)
  }

  destroy() {
    this.epoch++
    this.element?.removeEventListener("click", this.click)
    this.element?.removeEventListener("change", this.change)
  }

  /** @param {Client} client @param {{deviceId: string, bootId: number}} device */
  attach(client, device) {
    this.resetIdentity(device.deviceId, device.bootId)
    this.client = client
    this.wifiReady = false
    if (this.element) this.element.hidden = false
  }

  detach() { this.client = null; this.epoch++; this.interrupt(); if (this.element) this.element.hidden = true }

  /** @param {string} deviceId @param {number} bootId */
  resetIdentity(deviceId, bootId) {
    if (deviceId === this.deviceId && bootId === this.bootId) return
    this.deviceId = deviceId; this.bootId = bootId
    this.entries.clear(); this.selected.clear(); this.cursor = 0; this.pendingCommands.clear()
    this.commandFailed = false
  }

  /** @param {string} deviceId @param {any} queue */
  wifi(deviceId, queue) {
    if (this.client || !this.element) return
    this.wifiReady = queue?.version === 1
    this.element.hidden = !this.wifiReady
    if (!this.wifiReady) return
    this.resetIdentity(deviceId, queue.boot_id)
    if (queue.before_index === 0) this.entries.clear()
    for (const file of queue.files || []) this.entries.set(file.file_index, {
      fileIndex: file.file_index, bootId: file.boot_id, sizeBytes: file.size_bytes, flags: file.flags,
      durationMs: file.duration_ms ?? null, startedAtUnixMs: file.started_at_unix_ms ?? null
    })
    this.cursor = queue.next_before_index
    this.paused = queue.paused
    if (this.pendingCommands.size) void this.checkCommands().catch((error) => this.notice(error.message))
    this.render()
  }

  /** @param {string} message */
  notice(message) {
    const node = this.element?.querySelector("[data-import-notice]")
    if (node) node.textContent = message
  }

  async refresh(before = 0, reset = true) {
    if (!this.client) return this.cloud("catalog", before, 0)
    const hadEntries = this.entries.size > 0
    if (!before && reset) this.entries.clear()
    let cursor = before
    for (let i = 0; i < 8; i++) {
      const entry = await this.client.importCatalog(cursor)
      if (!entry.fileIndex) { cursor = 0; break }
      this.entries.set(entry.fileIndex, entry); cursor = entry.fileIndex
    }
    if (reset || before || !hadEntries) this.cursor = cursor
    this.render()
  }

  /** @param {string} action */
  async cloud(action, fileIndex = 0, fileBootId = 0) {
    if (!this.wifiReady || !this.element) throw new Error("The recorder is not currently reachable.")
    const response = await fetch(this.element.dataset.commandUrl || "", {
      method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || "" },
      body: JSON.stringify({ device_id: this.deviceId, action_name: action, file_index: fileIndex, file_boot_id: fileBootId })
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "Could not update the import queue.")
    if (!this.pendingCommands.size) this.commandFailed = false
    this.pendingCommands.add(payload.id)
    this.notice("Waiting for the recorder to apply the selection…")
  }

  async checkCommands() {
    if (this.checkingCommands || !this.element) return
    this.checkingCommands = true
    const identity = this.deviceId
    try {
      const url = `${this.element.dataset.commandUrl}?device_id=${encodeURIComponent(identity)}`
      const response = await fetch(url, { headers: { Accept: "application/json" } })
      if (!response.ok) throw new Error("Could not confirm the recorder selection. Refresh to retry.")
      const payload = await response.json()
      if (identity !== this.deviceId) return
      for (const command of payload.commands || []) {
        if (!this.pendingCommands.has(command.id) || command.status === "pending") continue
        this.commandFailed ||= command.status !== "acknowledged"
        this.pendingCommands.delete(command.id)
      }
      if (this.commandFailed) this.notice("Some selections failed or expired. Refresh and try again.")
      else if (!this.pendingCommands.size) this.notice("Recorder selection updated.")
    } finally { this.checkingCommands = false }
  }

  /** @param {string} action */
  async action(action) {
    if (this.busy) return
    this.busy = true; this.updateButtons()
    try {
      if (action === "refresh" || action === "older") return await this.refresh(action === "older" ? this.cursor : 0)
      if (action === "pause") action = this.paused ? "resume" : "pause"
      const files = ["pause", "resume"].includes(action) ? [{ fileIndex: 0, bootId: 0 }]
        : [...this.selected].sort((a, b) => a - b).map((index) => this.entries.get(index)).filter((file) => file !== undefined)
      if (!files.length) return
      this.epoch++
      this.interrupt()
      for (const file of files) {
        if (this.client) {
          const result = await this.client.controlImport(ACTIONS[action], file.fileIndex, file.bootId)
          this.paused = result.paused
        } else await this.cloud(action, file.fileIndex, file.bootId)
      }
      this.selected.clear()
      if (this.client) { this.notice(this.paused ? "Transfers paused. Partial files are preserved." : "Recorder selection updated."); await this.refresh() }
    } finally { this.busy = false; this.updateButtons() }
  }

  updateButtons() {
    for (const button of this.element?.querySelectorAll("button[data-import-action]") || []) {
      if (!(button instanceof HTMLButtonElement)) continue
      const action = button.dataset.importAction || ""
      button.disabled = this.busy || (["priority", "skip", "restore"].includes(action) && !this.selected.size)
      if (action === "pause") button.textContent = this.paused ? "Resume transfers" : "Pause transfers"
      if (action === "older" && button.parentElement) button.parentElement.hidden = !this.cursor
    }
  }

  render() {
    const body = this.element?.querySelector("[data-import-files]")
    if (!body) return
    for (const index of this.selected) {
      const entry = this.entries.get(index)
      if (!entry || entry.flags & (1 | 2 | 16) || (!this.showShort && isShortRecording(entry))) this.selected.delete(index)
    }
    body.replaceChildren()
    const all = [...this.entries.values()]
    const visible = all.filter((entry) => this.showShort || !isShortRecording(entry))
    const summary = this.element?.querySelector("[data-import-filter-summary]")
    if (summary) summary.textContent = `${all.length - visible.length} short recordings hidden in the loaded files.`
    if (!visible.length) {
      const row = document.createElement("tr"), cell = document.createElement("td")
      cell.colSpan = 6; cell.textContent = "No recordings match this filter. Show short recordings or load older files."
      row.append(cell); body.append(row)
    }
    for (const entry of visible.sort((a, b) => b.fileIndex - a.fileIndex)) {
      const row = document.createElement("tr")
      const selectCell = document.createElement("td")
      const input = document.createElement("input")
      const filename = `FDR${String(entry.fileIndex).padStart(6, "0")}.BIN`
      input.type = "checkbox"; input.value = String(entry.fileIndex); input.checked = this.selected.has(entry.fileIndex)
      input.disabled = Boolean(entry.flags & (1 | 2 | 16)); input.setAttribute("aria-label", `Select ${filename}`)
      selectCell.append(input); row.append(selectCell)
      const state = entry.flags & 1 ? "Recording" : entry.flags & 16 ? "Damaged" : entry.flags & 2 ? "Imported"
        : entry.flags & 8 ? "Priority" : entry.flags & 4 ? "Skipped" : entry.flags & 32 ? "Deferred" : isShortRecording(entry) ? "Manual import only" : "Available"
      for (const text of [filename, formatRecordingDate(entry.startedAtUnixMs), formatRecordingDuration(entry.durationMs), formatRecordingSize(entry.sizeBytes), state]) {
        const cell = document.createElement("td"); cell.textContent = text; row.append(cell)
      }
      body.append(row)
    }
    this.updateButtons()
  }

  /** @param {Client} client @param {{deviceId: string}} device
   * @param {{active: () => boolean, upload: (manifest: Preparation, blob: Blob, signal: AbortSignal) => Promise<void>, progress: (manifest: Preparation, offset: number) => void}} callbacks */
  async run(client, device, callbacks) {
    if (this.running) return "Import queue already active"
    this.running = true
    let completed = 0
    try {
      await this.refresh(0, false)
      while (callbacks.active()) {
        if (this.busy) { await wait(50); continue }
        const epoch = this.epoch
        const manifest = await client.nextImport()
        if (epoch !== this.epoch) continue
        this.paused = manifest.state === 3
        this.updateButtons()
        if (manifest.state === 0 || manifest.state === 3) break
        if (manifest.state === 4) { this.notice(`${manifest.filename}: preparation failed; retained on the microSD.`); continue }
        callbacks.progress(manifest, 0)
        if (manifest.state === 1) { this.notice(`Preparing ${manifest.filename}…`); await wait(50); continue }
        const partial = await PartialFdrFile.open(device.deviceId, manifest)
        const interrupted = () => epoch !== this.epoch || !callbacks.active()
        const abort = new AbortController()
        const previousInterrupt = this.interrupt
        this.interrupt = () => { abort.abort(); previousInterrupt() }
        try {
          let offset = partial.size
          while (offset < manifest.sizeBytes && !interrupted()) {
            const bytes = await client.readChunk(manifest.fileIndex, offset, Math.min(4096, manifest.sizeBytes - offset))
            if (!bytes.length) throw new Error("The recorder returned an empty chunk.")
            await partial.append(offset, bytes); offset += bytes.length
            callbacks.progress(manifest, offset)
          }
          if (interrupted()) continue
          this.notice(`Validating ${manifest.filename} in Sillage…`)
          await callbacks.upload(manifest, await partial.blob(), abort.signal)
          if (interrupted()) continue
          await client.acknowledge(manifest.fileIndex, manifest.sha256)
          const entry = this.entries.get(manifest.fileIndex)
          if (entry) entry.flags = (entry.flags | 2) & ~8
          this.selected.delete(manifest.fileIndex)
          completed++
          void partial.remove().catch(() => {})
          await this.refresh(0, false)
        } catch (caught) {
          const error = /** @type {import("./fdr_sync_protocol").FdrProtocolError} */ (caught)
          if (interrupted()) continue
          if (error.usbConnectionLost || error.usbRequestTimedOut) throw error
          this.notice(`${manifest.filename}: ${error.message}. Retained for retry.`)
          await client.controlImport(6, manifest.fileIndex, manifest.bootId)
        } finally {
          this.interrupt = previousInterrupt
          await partial.close()
        }
      }
      return this.paused ? "Transfers paused" : `${completed} file${completed === 1 ? "" : "s"} imported · newest first`
    } finally { this.running = false }
  }
}

/** @param {number | null | undefined} milliseconds */
export function formatRecordingDuration(milliseconds) {
  if (milliseconds == null || !Number.isFinite(milliseconds) || milliseconds < 0) return "Unavailable"
  const seconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  return hours ? `${hours} h ${String(minutes).padStart(2, "0")} min ${String(seconds % 60).padStart(2, "0")} s`
    : minutes ? `${minutes} min ${String(seconds % 60).padStart(2, "0")} s` : `${seconds} s`
}

/** @param {number} bytes */
export function formatRecordingSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MiB`
  return `${(bytes / 1073741824).toFixed(2)} GiB`
}

/** @param {Entry} entry */
export function isShortRecording(entry) {
  return typeof entry.durationMs === "number" && entry.durationMs >= 0 && entry.durationMs < 60000
}

/** @param {number | null | undefined} timestamp */
export function formatRecordingDate(timestamp) {
  if (!timestamp || !Number.isFinite(timestamp)) return "Unknown date"
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(timestamp))
}

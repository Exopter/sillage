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
    this.filter = "all"
    this.search = ""
    this.renderKey = ""
    this.wifiReady = false
    /** @type {Set<number>} */ this.pendingCommands = new Set()
    this.checkingCommands = false
    this.commandFailed = false
    /** @type {Map<number, Entry>} */ this.entries = new Map()
    /** @type {Set<number>} */ this.selected = new Set()
    /** @param {Event} event */
    this.click = (event) => {
      const target = event.target instanceof Element ? event.target : null
      const filter = target?.closest("[data-import-filter]")
      if (filter instanceof HTMLElement) { this.filter = filter.dataset.importFilter || "all"; this.render(); return }
      if (target?.closest("[data-import-clear]")) { this.selected.clear(); this.render(); return }
      const button = target?.closest("[data-import-action]")
      if (!(button instanceof HTMLElement)) return
      if (button.dataset.fileIndex) { this.selected.clear(); this.selected.add(Number(button.dataset.fileIndex)) }
      const menu = button.closest("details")
      if (menu) menu.open = false
      void this.action(button.dataset.importAction || "").catch((error) => this.notice(error.message))
    }
    /** @param {Event} event */
    this.change = (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) return
      if (input.hasAttribute("data-import-show-short")) { this.showShort = input.checked; this.render(); return }
      if (input.hasAttribute("data-import-select-all")) {
        for (const entry of this.visibleEntries()) {
          if (entry.flags & (1 | 2 | 16)) continue
          if (input.checked) this.selected.add(entry.fileIndex)
          else this.selected.delete(entry.fileIndex)
        }
        this.render(); return
      }
      if (!input.hasAttribute("data-import-select")) return
      const index = Number(input.value)
      if (input.checked) this.selected.add(index)
      else this.selected.delete(index)
      this.render()
    }
    /** @param {Event} event */
    this.searchInput = (event) => {
      if (!(event.target instanceof HTMLInputElement) || !event.target.hasAttribute("data-import-search")) return
      this.search = event.target.value.trim().toLowerCase(); this.render()
    }
    element?.addEventListener("input", this.searchInput)
    element?.addEventListener("click", this.click)
    element?.addEventListener("change", this.change)
  }

  destroy() {
    this.epoch++
    this.element?.removeEventListener("input", this.searchInput)
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
    if (this.busy || ![...Object.keys(ACTIONS), "refresh", "older"].includes(action)) return
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
    } finally { this.busy = false; this.render(); this.updateButtons() }
  }

  updateButtons() {
    for (const button of this.element?.querySelectorAll("button[data-import-action]") || []) {
      if (!(button instanceof HTMLButtonElement)) continue
      const action = button.dataset.importAction || ""
      button.disabled = this.busy || (Boolean(this.pendingCommands.size) && action !== "refresh") ||
        (["priority", "skip", "restore"].includes(action) && !button.dataset.fileIndex && !this.selected.size)
      if (action === "pause") button.textContent = this.paused ? "Resume imports" : "Pause imports"
      if (action === "older" && button.parentElement) button.parentElement.hidden = !this.cursor
    }
    const workspace = this.element?.closest?.(".exds-recorder-manager")
    const pause = workspace?.querySelector("[data-forge-pause]")
    if (pause && pause instanceof HTMLButtonElement) {
      pause.hidden = !this.client && !this.wifiReady
      pause.disabled = this.busy || Boolean(this.pendingCommands.size)
      pause.textContent = this.paused ? "Resume imports" : "Pause imports"
    }
    const status = workspace?.querySelector("[data-forge-import-status]")
    const detail = workspace?.querySelector("[data-forge-import-detail]")
    if (status) status.textContent = this.pendingCommands.size ? "Updating imports…" : this.paused ? "Automatic imports paused" : "Automatic imports enabled"
    if (detail) detail.textContent = this.paused ? "Your recordings stay on the recorder." : "Available recordings import newest first."
    const selection = this.element?.querySelector("[data-import-selection]")
    if (selection && selection instanceof HTMLElement) selection.hidden = !this.selected.size
    const count = this.element?.querySelector("[data-import-selection-count]")
    if (count) count.textContent = `${this.selected.size} selected`
  }

  visibleEntries() {
    return [...this.entries.values()].filter((entry) => (this.showShort || !isFilteredRecording(entry)) &&
      (this.filter === "all" || recordingCategory(entry) === this.filter) &&
      (!this.search || `${recordingFilename(entry)} ${formatRecordingDate(entry.startedAtUnixMs)}`.toLowerCase().includes(this.search)))
  }

  render() {
    const body = this.element?.querySelector("[data-import-files]")
    if (!body) return
    const visible = this.visibleEntries(), visibleIds = new Set(visible.map((entry) => entry.fileIndex))
    for (const index of this.selected) {
      const entry = this.entries.get(index)
      if (!entry || entry.flags & (1 | 2 | 16) || !visibleIds.has(index)) this.selected.delete(index)
    }
    const renderKey = JSON.stringify([[...this.entries.values()], [...this.selected], this.filter, this.search, this.showShort])
    if (renderKey === this.renderKey) { this.updateButtons(); return }
    this.renderKey = renderKey
    const focusedIndex = document.activeElement && document.activeElement.getAttribute("data-import-select") !== null && document.activeElement instanceof HTMLInputElement ? document.activeElement.value : null
    body.replaceChildren()
    const summary = this.element?.querySelector("[data-import-filter-summary]")
    if (summary) summary.textContent = `${visible.length} of ${this.entries.size} loaded recordings shown. Short, technical and non-moving recordings are excluded by default.`
    for (const button of this.element?.querySelectorAll("[data-import-filter]") || []) {
      if (button instanceof HTMLElement) button.setAttribute("aria-pressed", String(button.dataset.importFilter === this.filter))
    }
    const selectAll = this.element?.querySelector("[data-import-select-all]")
    if (selectAll && selectAll instanceof HTMLInputElement) {
      const selectable = visible.filter((entry) => !(entry.flags & (1 | 2 | 16)))
      selectAll.disabled = !selectable.length
      selectAll.checked = selectable.length > 0 && this.selected.size === selectable.length
      selectAll.indeterminate = this.selected.size > 0 && !selectAll.checked
    }
    if (!visible.length) {
      const row = document.createElement("tr"), cell = document.createElement("td")
      cell.colSpan = 6; cell.textContent = "No recordings match this view. Adjust filters or load older recordings."
      row.append(cell); body.append(row)
    }
    // Infer dates from the complete loaded catalogue before applying visibility filters.
    for (const group of groupRecordings([...this.entries.values()])) {
      const rows = group.rows.filter(({ entry }) => visibleIds.has(entry.fileIndex))
      if (!rows.length) continue
      const heading = document.createElement("tr"), title = document.createElement("th"), count = document.createElement("small")
      heading.className = "exds-recording-group"; title.colSpan = 6
      title.textContent = group.label
      count.textContent = `${group.uncertain ? "Date uncertain · " : ""}${rows.length} recording${rows.length === 1 ? "" : "s"}`
      title.append(count); heading.append(title); body.append(heading)
      for (const { entry, bounds } of rows) {
        const row = document.createElement("tr"), selectCell = document.createElement("td"), input = document.createElement("input")
        const filename = recordingFilename(entry)
        row.dataset.selected = String(this.selected.has(entry.fileIndex))
        input.type = "checkbox"; input.value = String(entry.fileIndex); input.checked = this.selected.has(entry.fileIndex)
        input.disabled = Boolean(entry.flags & (1 | 2 | 16)); input.setAttribute("aria-label", `Select ${filename}`)
        input.setAttribute("data-import-select", "")
        if (focusedIndex === String(entry.fileIndex)) queueMicrotask(() => input.focus({ preventScroll: true }))
        selectCell.append(input); row.append(selectCell)
        const name = document.createElement("td"), time = document.createElement("strong"), file = document.createElement("small")
        time.textContent = validRecordingDate(entry.startedAtUnixMs) ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(/** @type {number} */ (entry.startedAtUnixMs)) : "Unknown date"
        file.textContent = filename; file.className = "exds-recording-name"; name.append(time, file)
        if (bounds) { const note = document.createElement("small"); note.className = "exds-recording-bound"; note.textContent = bounds; name.append(note) }
        row.append(name)
        for (const text of [formatRecordingDuration(entry.durationMs), formatRecordingSize(entry.sizeBytes)]) {
          const cell = document.createElement("td"); cell.textContent = text; row.append(cell)
        }
        const status = document.createElement("td"), state = document.createElement("span")
        state.className = "exds-recording-state"; state.dataset.state = recordingCategory(entry); state.textContent = recordingState(entry)
        status.append(state); row.append(status)
        const actions = document.createElement("td")
        if (!(entry.flags & (1 | 2 | 16))) {
          const menu = document.createElement("details"), trigger = document.createElement("summary"), options = document.createElement("div")
          menu.className = "exds-recording-menu"; trigger.textContent = "•••"; trigger.setAttribute("aria-label", `Actions for ${filename}`)
          for (const [action, label] of [["priority", "Import first"], entry.flags & 4 ? ["restore", "Restore"] : ["skip", "Skip"]]) {
            const button = document.createElement("button"); button.type = "button"; button.textContent = label
            button.dataset.importAction = action; button.dataset.fileIndex = String(entry.fileIndex); options.append(button)
          }
          menu.append(trigger, options); actions.append(menu)
        }
        row.append(actions); body.append(row)
      }
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
  if (!validRecordingDate(timestamp)) return "Unknown date"
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(/** @type {number} */ (timestamp)))
}

/** @param {Entry} entry */
export function isFilteredRecording(entry) {
  return isShortRecording(entry) || Boolean(entry.flags & (64 | 128))
}

/** @param {Entry} entry */
function recordingFilename(entry) { return `FDR${String(entry.fileIndex).padStart(6, "0")}.BIN` }
/** @param {Entry} entry */
function recordingCategory(entry) {
  return entry.flags & 1 ? "recording" : entry.flags & 16 ? "damaged" : entry.flags & 2 ? "imported" : entry.flags & 4 ? "skipped" : "available"
}
/** @param {Entry} entry */
function recordingState(entry) {
  return entry.flags & 1 ? "Recording" : entry.flags & 16 ? "Damaged" : entry.flags & 2 ? "Imported" : entry.flags & 8 ? "Priority" : entry.flags & 4 ? "Skipped" : entry.flags & 32 ? "Deferred" : entry.flags & 64 ? "No GPS movement" : entry.flags & 128 ? "Technical" : isShortRecording(entry) ? "Manual import only" : "Available"
}
/** @param {number | null | undefined} timestamp */
function validRecordingDate(timestamp) { return typeof timestamp === "number" && timestamp > 0 && Number.isFinite(new Date(timestamp).getTime()) }

/** Group contiguous recordings in file sequence, never inventing a timestamp.
 * @param {Entry[]} entries @param {string | undefined} timeZone
 * @returns {{key: string, label: string, uncertain: boolean, rows: {entry: Entry, bounds: string}[]}[]}
 */
export function groupRecordings(entries, timeZone = undefined) {
  const ordered = [...entries].sort((a, b) => b.fileIndex - a.fileIndex)
  const day = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone })
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone })
  /** @type {(number | null)[]} */ const older = []
  /** @type {number | null} */ let previous = null
  for (let i = ordered.length - 1; i >= 0; i--) {
    older[i] = previous
    if (validRecordingDate(ordered[i].startedAtUnixMs)) previous = /** @type {number} */ (ordered[i].startedAtUnixMs)
  }
  /** @type {ReturnType<typeof groupRecordings>} */ const groups = []
  /** @type {number | null} */ let newer = null
  ordered.forEach((entry, i) => {
    const timestamp = entry.startedAtUnixMs
    let key, label, bounds = "", uncertain = false
    if (validRecordingDate(timestamp)) {
      newer = /** @type {number} */ (timestamp); label = day.format(newer); key = label
    } else {
      const lower = older[i], upper = newer
      if (lower && upper && lower <= upper) {
        const start = day.format(lower), end = day.format(upper)
        if (start === end) {
          key = label = start; bounds = `Between ${time.format(lower)} and ${time.format(upper)}`
        } else {
          key = `range:${lower}:${upper}`; label = `${start} to ${end}`; uncertain = true
          bounds = `Between ${start}, ${time.format(lower)} and ${end}, ${time.format(upper)}`
        }
      } else {
        uncertain = true
        label = lower && !upper ? `After ${day.format(lower)}` : upper && !lower ? `Before ${day.format(upper)}` : "Unknown date"
        key = `unknown:${lower}:${upper}`
        bounds = lower && upper ? "Neighbouring timestamps conflict; ordered by file number." : "Ordered by file number; exact date unavailable."
      }
    }
    let group = groups.at(-1)
    if (!group || group.key !== key) { group = { key, label, uncertain, rows: [] }; groups.push(group) }
    group.rows.push({ entry, bounds })
  })
  return groups
}

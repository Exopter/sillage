import { Controller } from "@hotwired/stimulus"
import { AircraftConnectionTransport, setAircraftConnection } from "aircraft_connection"

const DATABASE_NAME = "sillage-signal-v1"
const DATABASE_VERSION = 1
const OUTBOX_STORE = "outbox"
const META_STORE = "metadata"
const BATCH_INTERVAL_MS = 2_000

export default class extends Controller {
  static targets = [
    "presentation", "board", "widget", "mapCanvas", "instrumentCanvas", "chartCanvas",
    "connectButton", "radioStatus", "recorderStatus", "cloudStatus", "warning",
    "heading", "airspeed", "altitude", "verticalSpeed", "glide", "dataStatus",
    "parserStatus", "aircraftMarker", "aircraftLabel", "latestEvent"
  ]

  static values = {
    session: String,
    flightCode: String,
    batchUrl: String,
    eventUrl: String,
    completeUrl: String,
    mapImageUrl: String
  }

  async connect() {
    this.telemetry = { heading: null, airspeed: null, altitude: null, verticalSpeed: null, glide: null, roll: 0, pitch: 0, gps: null, radio: null }
    this.history = { airspeed: [], altitude: [], verticalSpeed: [], validity: [] }
    this.pendingSamples = []
    this.connectedAt = null
    this.lastFrameAt = null
    this.mavlinkSystemId = null
    this.mavlinkComponentId = null
    this.syncing = false
    this.ended = false
    this.layoutStorageKey = `signal-layout:${this.sessionValue}`
    this.db = await openDatabase()
    this.nextSequence = Number(await readMetadata(this.db, `${this.sessionValue}:next-sequence`)) || 0
    this.boundOnline = () => this.flushOutbox()
    this.boundOffline = () => this.refreshCloudStatus()
    this.boundBeforeUnload = (event) => this.warnBeforeUnload(event)
    this.boundResize = () => this.reflowLayout()
    this.boundSerialConnect = async () => {
      await this.stopSerialPromise
      this.autoReconnect()
    }
    this.boundSerialDisconnect = () => {
      this.showWarning("The ground radio was disconnected. Acquisition will resume after USB reconnection.")
      this.stopSerial()
    }
    window.addEventListener("online", this.boundOnline)
    window.addEventListener("offline", this.boundOffline)
    window.addEventListener("beforeunload", this.boundBeforeUnload)
    window.addEventListener("resize", this.boundResize)
    navigator.serial?.addEventListener("connect", this.boundSerialConnect)
    navigator.serial?.addEventListener("disconnect", this.boundSerialDisconnect)
    this.restoreLayout()
    this.batchTimer = window.setInterval(() => this.queuePendingBatch(), BATCH_INTERVAL_MS)
    this.drawAll()
    await this.prepareLocalStorage()
    await this.flushOutbox()
    await this.autoReconnect()
  }

  disconnect() {
    window.clearInterval(this.batchTimer)
    window.removeEventListener("online", this.boundOnline)
    window.removeEventListener("offline", this.boundOffline)
    window.removeEventListener("beforeunload", this.boundBeforeUnload)
    window.removeEventListener("resize", this.boundResize)
    navigator.serial?.removeEventListener("connect", this.boundSerialConnect)
    navigator.serial?.removeEventListener("disconnect", this.boundSerialDisconnect)
    this.stopSerial()
    this.wakeLock?.release()
  }

  async prepareLocalStorage() {
    if (!navigator.storage?.persist) {
      this.showWarning("Persistent browser storage is unavailable. Keep the microSD recorder running.")
      return
    }

    const persistent = await navigator.storage.persisted() || await navigator.storage.persist()
    const estimate = await navigator.storage.estimate()
    if (!persistent) this.showWarning("Persistent storage was not granted. The browser may remove the local capture under storage pressure.")
    if (estimate.quota && estimate.usage && estimate.quota - estimate.usage < 250 * 1024 * 1024) {
      this.showWarning("Less than 250 MB of browser storage remains. Free space before a long acquisition.")
    }
  }

  async autoReconnect() {
    if (!navigator.serial || this.ended) return
    const ports = await navigator.serial.getPorts()
    const lastPort = await readMetadata(this.db, "last-authorized-port")
    const port = ports.find((candidate) => samePort(candidate.getInfo(), lastPort)) || (ports.length === 1 ? ports[0] : null)
    if (port) await this.acquirePort(port)
  }

  async connectStation() {
    if (!navigator.serial) {
      this.showWarning("Web Serial is not available. Use Chrome or Edge on desktop over HTTPS.")
      return
    }
    if (this.port) {
      await this.stopSerial()
      return
    }

    try {
      const authorized = await navigator.serial.getPorts()
      const port = authorized.length === 1 ? authorized[0] : await navigator.serial.requestPort()
      await this.acquirePort(port)
    } catch (error) {
      if (error.name !== "NotFoundError") this.showWarning(`Ground radio connection failed: ${error.message}`)
    }
  }

  async acquirePort(port) {
    if (this.port || this.openingPort) return
    this.openingPort = true
    const lockName = `sillage-signal-port:${port.getInfo().usbVendorId || "serial"}:${port.getInfo().usbProductId || "port"}`
    navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        this.openingPort = false
        this.showWarning("This ground radio is already being read by another browser tab.")
        return
      }
      await new Promise(async (release) => {
        this.releasePortLock = release
        try {
          await this.openSerial(port)
        } catch (error) {
          this.showWarning(`Ground radio connection failed: ${error.message}`)
          await this.stopSerial()
        }
      })
    })
  }

  async openSerial(port) {
    this.port = port
    await port.open({ baudRate: 57_600, bufferSize: 65_536 })
    await writeMetadata(this.db, "last-authorized-port", port.getInfo())
    this.openingPort = false
    this.connectedAt = new Date()
    this.worker = new Worker("/signal_serial_worker.js")
    this.worker.onmessage = ({ data }) => this.handleWorkerMessage(data)
    this.worker.postMessage({ type: "init-capture", filename: `${this.flightCodeValue}-${this.sessionValue}.mavcap` })
    this.connectButtonTarget.querySelector("span:last-child").textContent = "Disconnect ground radio"
    this.connectButtonTarget.setAttribute("aria-label", "Disconnect ground radio")
    this.radioStatusTarget.textContent = "Connected · waiting for MAVLink"
    this.updateGroundRadioState("connected")
    await this.acquireWakeLock()
    this.readSerial()
  }

  async readSerial() {
    while (this.port?.readable && !this.ended) {
      this.reader = this.port.readable.getReader()
      try {
        while (true) {
          const { value, done } = await this.reader.read()
          if (done) break
          if (!value?.length) continue
          const bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
          this.worker.postMessage({ type: "bytes", bytes, receivedAtUs: String(Date.now() * 1000) }, [bytes])
        }
      } catch (error) {
        if (!this.ended) this.showWarning(`The ground radio was disconnected: ${error.message}`)
      } finally {
        this.reader.releaseLock()
        this.reader = null
      }
      break
    }
    if (!this.ended && this.port) await this.stopSerial()
  }

  async stopSerial() {
    if (this.stopSerialPromise) return this.stopSerialPromise

    this.stopSerialPromise = this.performStopSerial()
    try {
      await this.stopSerialPromise
    } finally {
      this.stopSerialPromise = null
    }
  }

  async performStopSerial() {
    try { await this.reader?.cancel() } catch (_) { /* Port may already be gone. */ }
    if (this.worker) {
      await closeWorkerCapture(this.worker)
      this.worker.terminate()
    }
    this.worker = null
    if (this.port) {
      try { await this.port.close() } catch (_) { /* Port may already be closed. */ }
    }
    this.port = null
    this.openingPort = false
    this.releasePortLock?.()
    this.releasePortLock = null
    this.connectButtonTarget.querySelector("span:last-child").textContent = "Connect ground radio"
    this.connectButtonTarget.setAttribute("aria-label", "Connect ground radio")
    this.radioStatusTarget.textContent = "Not connected"
    this.updateGroundRadioState("disconnected")
  }

  updateGroundRadioState(state) {
    setAircraftConnection(AircraftConnectionTransport.GROUND_RADIO, state === "connected")
  }

  handleWorkerMessage(message) {
    if (message.type === "capture-ready") {
      this.recorderStatusTarget.textContent = `Recording locally · ${formatBytes(message.bytes)}`
      return
    }
    if (message.type === "capture-error") {
      this.recorderStatusTarget.textContent = "Local capture unavailable"
      this.showWarning(`Raw capture could not start: ${message.message}`)
      return
    }
    if (message.type !== "frame") return

    this.lastFrameAt = Date.now()
    this.mavlinkSystemId = String(message.systemId)
    this.mavlinkComponentId = String(message.componentId)
    this.radioStatusTarget.textContent = `Live · MAVLink ${message.systemId}/${message.componentId}`
    this.parserStatusTarget.textContent = `${message.parser.errors} CRC errors · ${message.parser.dropped} missing frames`
    this.applyTelemetry(message.decoded, message)
    this.drawAll()
  }

  applyTelemetry(decoded, frame) {
    const recordedAt = new Date(Number(BigInt(frame.receivedAtUs) / 1000n)).toISOString()
    let sample = null
    if (decoded.name === "gps") {
      this.telemetry.gps = [decoded.longitude, decoded.latitude]
      if (this.telemetry.heading == null) this.telemetry.heading = decoded.courseDeg
      if (this.telemetry.altitude == null) this.telemetry.altitude = decoded.altitudeM
      sample = { kind: "gps", recorded_at: recordedAt, latitude: decoded.latitude, longitude: decoded.longitude, altitude_m: decoded.altitudeM, horizontal_accuracy_m: decoded.ephM, vertical_accuracy_m: decoded.epvM, horizontal_speed_mps: decoded.velocityMps, heading_deg: decoded.courseDeg, gps_fix: decoded.fix, satellite_count: decoded.satellites }
    } else if (decoded.name === "vfr_hud") {
      this.telemetry.airspeed = decoded.airspeedMps * 3.6
      this.telemetry.altitude = decoded.altitudeM
      this.telemetry.verticalSpeed = decoded.climbMps
      this.telemetry.heading = normalizeHeading(decoded.headingDeg)
      this.telemetry.glide = Math.abs(decoded.climbMps) > 0.1 ? decoded.groundspeedMps / Math.abs(decoded.climbMps) : null
      sample = this.sensorSample(recordedAt, "VFR_HUD", decoded)
    } else if (decoded.name === "attitude") {
      this.telemetry.roll = decoded.rollDeg
      this.telemetry.pitch = decoded.pitchDeg
      if (this.telemetry.heading == null) this.telemetry.heading = decoded.yawDeg
      sample = this.sensorSample(recordedAt, "ATTITUDE", decoded)
    } else if (decoded.name === "radio") {
      this.telemetry.radio = decoded.rssiDbm
      sample = this.sensorSample(recordedAt, "RADIO_STATUS", decoded)
    } else if (["system_status", "pressure", "status_text", "heartbeat", "ping"].includes(decoded.name)) {
      sample = this.sensorSample(recordedAt, decoded.name.toUpperCase(), decoded)
    }
    if (sample) this.pendingSamples.push(sample)
    this.pushHistory()
    this.renderValues()
  }

  sensorSample(recordedAt, sensorType, readings) {
    return { kind: "sensor", sensor_type: sensorType, recorded_at: recordedAt, readings }
  }

  pushHistory() {
    const push = (key, value) => {
      if (!Number.isFinite(value)) return
      this.history[key].push(value)
      if (this.history[key].length > 180) this.history[key].shift()
    }
    push("airspeed", this.telemetry.airspeed)
    push("altitude", this.telemetry.altitude)
    push("verticalSpeed", this.telemetry.verticalSpeed)
    push("validity", 1)
  }

  renderValues() {
    this.headingTarget.textContent = formatNumber(this.telemetry.heading, 0, 3)
    this.airspeedTarget.textContent = formatNumber(this.telemetry.airspeed, 0)
    this.altitudeTarget.textContent = formatNumber(this.telemetry.altitude, 0)
    this.verticalSpeedTarget.textContent = formatNumber(this.telemetry.verticalSpeed, 1)
    this.glideTarget.textContent = formatNumber(this.telemetry.glide, 1)
    this.dataStatusTarget.textContent = this.lastFrameAt ? "Valid local stream" : "Waiting for telemetry"
    if (this.lastFrameAt) {
      const values = `${formatNumber(this.telemetry.altitude, 0)} m · ${formatNumber(this.telemetry.airspeed, 0)} km/h · ${formatNumber(this.telemetry.heading, 0, 3)}°`
      this.aircraftLabelTarget.textContent = values
    }
  }

  async queuePendingBatch() {
    if (!this.pendingSamples.length || this.ended) return
    const samples = this.pendingSamples.splice(0)
    const sequence = this.nextSequence
    this.nextSequence += 1
    await writeMetadata(this.db, `${this.sessionValue}:next-sequence`, this.nextSequence)
    await writeOutbox(this.db, {
      id: `${this.sessionValue}:batch:${sequence}`,
      session: this.sessionValue,
      kind: "batch",
      sequence,
      url: this.batchUrlValue,
      method: "POST",
      body: {
        sequence,
        first_received_at: samples[0].recorded_at,
        last_received_at: samples.at(-1).recorded_at,
        mavlink_system_id: this.mavlinkSystemId,
        mavlink_component_id: this.mavlinkComponentId,
        position: this.telemetry.gps ? { longitude: this.telemetry.gps[0], latitude: this.telemetry.gps[1] } : null,
        samples
      },
      queuedAt: Date.now()
    })
    await this.flushOutbox()
  }

  async markEvent() {
    const occurredAt = new Date().toISOString()
    const eventUuid = crypto.randomUUID()
    const label = `Operator marker · ${new Date().toLocaleTimeString()}`
    await writeOutbox(this.db, { id: `${this.sessionValue}:event:${eventUuid}`, session: this.sessionValue, kind: "event", url: this.eventUrlValue, method: "POST", body: { event_uuid: eventUuid, event_type: "marker", occurred_at: occurredAt, label, metadata: {} }, queuedAt: Date.now() })
    this.latestEventTarget.hidden = false
    this.latestEventTarget.textContent = label
    await this.flushOutbox()
  }

  async endSession() {
    if (this.ended || !window.confirm("End local capture and move this flight to Processing?")) return
    await this.queuePendingBatch()
    this.ended = true
    const id = `${this.sessionValue}:complete`
    await writeOutbox(this.db, { id, session: this.sessionValue, kind: "complete", url: this.completeUrlValue, method: "PATCH", body: { ended_at: new Date().toISOString() }, queuedAt: Date.now() })
    await this.stopSerial()
    await this.flushOutbox()
    this.dataStatusTarget.textContent = navigator.onLine ? "Session completed" : "Session ended locally"
  }

  async flushOutbox() {
    if (!navigator.onLine || this.syncing || !this.db) {
      this.refreshCloudStatus()
      return
    }
    this.syncing = true
    try {
      const records = (await readOutbox(this.db)).filter((record) => record.session === this.sessionValue).sort(outboxOrder)
      for (const record of records) {
        const response = await fetch(record.url, {
          method: record.method,
          headers: { "Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || "" },
          body: JSON.stringify(record.body)
        })
        if (!response.ok) throw new Error(`Cloud returned ${response.status}`)
        await deleteOutbox(this.db, record.id)
      }
    } catch (error) {
      this.cloudError = error.message
    } finally {
      this.syncing = false
      this.refreshCloudStatus()
    }
  }

  async refreshCloudStatus() {
    const records = this.db ? (await readOutbox(this.db)).filter((record) => record.session === this.sessionValue) : []
    if (!navigator.onLine) {
      this.cloudStatusTarget.textContent = records.length ? `${ageInSeconds(records)} s behind` : "Offline"
    } else if (this.syncing || records.length) {
      this.cloudStatusTarget.textContent = records.length ? `Syncing · ${ageInSeconds(records)} s behind` : "Syncing"
    } else {
      this.cloudStatusTarget.textContent = "Live"
      this.cloudError = null
    }
  }

  async acquireWakeLock() {
    if (!navigator.wakeLock?.request) return
    try { this.wakeLock = await navigator.wakeLock.request("screen") } catch (_) { /* Non-fatal. */ }
  }

  warnBeforeUnload(event) {
    if (this.ended || (!this.port && this.pendingSamples.length === 0)) return
    event.preventDefault()
    event.returnValue = ""
  }

  showWarning(message) {
    this.warningTarget.hidden = false
    this.warningTarget.textContent = message
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (document.fullscreenEnabled && this.presentationTarget.requestFullscreen) {
        await this.presentationTarget.requestFullscreen()
      } else {
        this.showWarning("Full screen is blocked by this browser. Use the browser full-screen shortcut for projection.")
      }
    } catch (_) {
      this.showWarning("Full screen is blocked by this browser. Use the browser full-screen shortcut for projection.")
    }
  }

  setMode(event) {
    const widget = event.currentTarget.closest("[data-widget]")
    const mode = event.currentTarget.dataset.mode
    if (mode === "large") {
      this.widgetTargets.forEach((candidate) => {
        if (candidate !== widget && candidate.dataset.mode !== "hidden") candidate.dataset.mode = "mini"
      })
      widget.dataset.mode = "large"
      this.applyPreset(widget.dataset.widget)
    } else {
      widget.dataset.mode = mode
      const rect = this.widgetRect(widget)
      widget.style.height = `${mode === "hidden" ? 38 : Math.max(170, Math.min(320, rect.height))}px`
      widget.style.width = `${Math.max(250, Math.min(430, rect.width))}px`
      this.clampWidget(widget)
    }
    this.updateModeButtons()
    this.saveLayout()
    this.drawAll()
  }

  resetLayout() {
    this.widgetTargets.forEach((widget) => { widget.removeAttribute("style") })
    this.widgetTargets.forEach((widget) => { widget.dataset.mode = widget.dataset.widget === "map" ? "large" : "mini" })
    this.applyPreset("map")
    this.saveLayout()
  }

  resetWidget(event) {
    const id = event.currentTarget.closest("[data-widget]").dataset.widget
    this.applyPreset(this.widgetTargets.find((widget) => widget.dataset.mode === "large")?.dataset.widget || id)
  }

  restoreLayout() {
    requestAnimationFrame(() => {
      let stored = null
      try { stored = JSON.parse(sessionStorage.getItem(this.layoutStorageKey)) } catch (_) { /* Ignore invalid session state. */ }
      if (stored) {
        const board = stored.__board
        this.widgetTargets.forEach((widget) => {
          const record = stored[widget.dataset.widget]
          if (!record) return
          widget.dataset.mode = record.mode
          Object.assign(widget.style, { left: `${record.left}px`, top: `${record.top}px`, width: `${record.width}px`, height: `${record.height}px` })
        })
        const viewportChanged = board && (Math.abs(board.width - this.boardTarget.clientWidth) > 80 || Math.abs(board.height - this.boardTarget.clientHeight) > 80)
        const oversized = this.widgetTargets.some((widget) => {
          const record = stored[widget.dataset.widget]
          return record && (record.width > this.boardTarget.clientWidth || record.height > this.boardTarget.clientHeight)
        })
        if (viewportChanged || oversized) this.applyPreset(this.widgetTargets.find((widget) => widget.dataset.mode === "large")?.dataset.widget || "map")
        else this.clampAllWidgets()
      } else {
        this.applyPreset("map")
      }
      this.updateModeButtons()
    })
  }

  reflowLayout() {
    window.clearTimeout(this.resizeTimer)
    this.resizeTimer = window.setTimeout(() => {
      this.applyPreset(this.widgetTargets.find((widget) => widget.dataset.mode === "large")?.dataset.widget || "map")
    }, 120)
  }

  applyPreset(largeId) {
    const width = this.boardTarget.clientWidth
    const height = this.boardTarget.clientHeight
    const gap = 10
    const pad = 8
    const minimumSideWidth = width < 960 ? 300 : 250
    const preferredLargeWidth = Math.max(420, Math.round(width * .68) - gap)
    const largeWidth = Math.max(360, Math.min(preferredLargeWidth, width - minimumSideWidth - gap - pad * 2))
    const sideWidth = Math.max(minimumSideWidth, width - largeWidth - gap - pad * 2)
    const sideWidgets = this.widgetTargets.filter((widget) => widget.dataset.widget !== largeId)
    const availableSideHeight = height - pad * 2 - gap
    const visibleSide = sideWidgets.filter((widget) => widget.dataset.mode !== "hidden")
    const hiddenHeight = sideWidgets.filter((widget) => widget.dataset.mode === "hidden").length * 38
    const miniHeight = visibleSide.length ? Math.max(150, (availableSideHeight - hiddenHeight) / visibleSide.length) : 38
    let top = pad

    this.widgetTargets.forEach((widget) => {
      if (widget.dataset.widget === largeId) {
        Object.assign(widget.style, { left: `${pad}px`, top: `${pad}px`, width: `${largeWidth}px`, height: `${height - pad * 2}px` })
      }
    })
    sideWidgets.forEach((widget) => {
      const widgetHeight = widget.dataset.mode === "hidden" ? 38 : miniHeight
      Object.assign(widget.style, { left: `${pad + largeWidth + gap}px`, top: `${top}px`, width: `${sideWidth}px`, height: `${widgetHeight}px` })
      top += widgetHeight + gap
    })
    this.updateModeButtons()
    this.saveLayout()
    this.drawAll()
  }

  startDrag(event) {
    if (event.button !== 0) return
    event.preventDefault()
    const widget = event.currentTarget.closest("[data-widget]")
    const rect = this.widgetRect(widget)
    const boardRect = this.boardTarget.getBoundingClientRect()
    const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
    widget.classList.add("is-dragging")
    widget.style.zIndex = "12"
    const move = (nextEvent) => {
      const left = clamp(start.left + nextEvent.clientX - start.x, 0, boardRect.width - rect.width)
      const top = clamp(start.top + nextEvent.clientY - start.y, 0, boardRect.height - rect.height)
      widget.style.left = `${left}px`
      widget.style.top = `${top}px`
    }
    const stop = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
      widget.classList.remove("is-dragging")
      widget.style.zIndex = ""
      this.saveLayout()
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop, { once: true })
  }

  nudgeWidget(event) {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!direction) return
    event.preventDefault()
    const widget = event.currentTarget.closest("[data-widget]")
    const rect = this.widgetRect(widget)
    const step = event.shiftKey ? 24 : 8
    widget.style.left = `${rect.left + direction[0] * step}px`
    widget.style.top = `${rect.top + direction[1] * step}px`
    this.clampWidget(widget)
    this.saveLayout()
  }

  widgetRect(widget) {
    const board = this.boardTarget.getBoundingClientRect()
    const rect = widget.getBoundingClientRect()
    return { left: rect.left - board.left, top: rect.top - board.top, width: rect.width, height: rect.height }
  }

  clampWidget(widget) {
    const width = this.boardTarget.clientWidth
    const height = this.boardTarget.clientHeight
    let rect = this.widgetRect(widget)
    if (rect.width > width) widget.style.width = `${width}px`
    if (rect.height > height) widget.style.height = `${height}px`
    rect = this.widgetRect(widget)
    widget.style.left = `${clamp(rect.left, 0, Math.max(0, width - rect.width))}px`
    widget.style.top = `${clamp(rect.top, 0, Math.max(0, height - rect.height))}px`
  }

  clampAllWidgets() {
    this.widgetTargets.forEach((widget) => this.clampWidget(widget))
    this.drawAll()
  }

  saveLayout() {
    const layout = { __board: { width: this.boardTarget.clientWidth, height: this.boardTarget.clientHeight } }
    this.widgetTargets.forEach((widget) => { layout[widget.dataset.widget] = { mode: widget.dataset.mode, ...this.widgetRect(widget) } })
    sessionStorage.setItem(this.layoutStorageKey, JSON.stringify(layout))
  }

  updateModeButtons() {
    this.widgetTargets.forEach((widget) => {
      widget.querySelectorAll("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.mode === widget.dataset.mode))
    })
  }

  drawAll() {
    this.drawMap()
    this.drawInstruments()
    this.drawCharts()
  }

  drawMap() {
    const canvas = this.mapCanvasTarget
    const { context, width, height } = prepareCanvas(canvas)
    if (!context || !width || !height) return
    context.clearRect(0, 0, width, height)
    const points = this.history.airspeed.map((_, index, all) => [width * (.12 + index / Math.max(all.length - 1, 1) * .38), height * (.34 + Math.sin(index / 18) * .12)])
    if (!points.length) points.push([width * .12, height * .35], [width * .43, height * .54])
    context.strokeStyle = "rgba(245,248,246,.58)"
    context.lineWidth = 3
    context.setLineDash([10, 8])
    drawPolyline(context, points)
    context.strokeStyle = "#8cff4d"
    context.setLineDash([7, 6])
    drawPolyline(context, points.slice(Math.max(0, points.length - 60)))
    context.setLineDash([])
    const last = points.at(-1)
    const heading = this.telemetry.heading || 36
    this.aircraftMarkerTarget.style.left = `${last[0]}px`
    this.aircraftMarkerTarget.style.top = `${last[1]}px`
    this.aircraftMarkerTarget.style.setProperty("--aircraft-heading", `${heading}deg`)
  }

  drawInstruments() {
    const canvas = this.instrumentCanvasTarget
    const { context: ctx, width: w, height: h } = prepareCanvas(canvas)
    if (!ctx || !w || !h) return
    ctx.fillStyle = "#071011"
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2
    const cy = h / 2 + 8
    const radius = Math.min(w, h) * .34
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI, 0); ctx.lineTo(cx + radius, cy + 25); ctx.lineTo(cx - radius, cy + 25); ctx.closePath(); ctx.clip()
    ctx.fillStyle = "rgba(62,135,206,.45)"; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius)
    ctx.fillStyle = "#10191a"; ctx.fillRect(cx - radius, cy, radius * 2, radius)
    ctx.translate(cx, cy); ctx.rotate((this.telemetry.roll || 0) * Math.PI / 180); ctx.translate(-cx, -cy)
    ctx.strokeStyle = "#e6ece9"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - radius, cy + (this.telemetry.pitch || 0) * 2); ctx.lineTo(cx + radius, cy + (this.telemetry.pitch || 0) * 2); ctx.stroke(); ctx.restore()
    ctx.strokeStyle = "#8cff4d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI, 0); ctx.stroke()
    ctx.strokeStyle = "#ffb74d"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 70, cy - 7); ctx.lineTo(cx - 24, cy - 7); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx + 24, cy - 7); ctx.lineTo(cx + 70, cy - 7); ctx.stroke()
    ctx.fillStyle = "#8cff4d"; ctx.textAlign = "center"; ctx.font = "600 28px ui-monospace"; ctx.fillText(`${formatNumber(this.telemetry.heading, 0, 3)}°`, cx, 42)
    ctx.fillStyle = "#788281"; ctx.font = "600 10px ui-monospace"; ctx.fillText("HEADING", cx, 58)
    ctx.fillStyle = "#e6ece9"; ctx.font = "500 12px ui-monospace"; ctx.fillText("FLIGHT DATA · LIVE", cx, h - 24)
    if (w > 420 && h > 260) {
      drawTape(ctx, 32, cy, "AIRSPEED", this.telemetry.airspeed, "km/h", true)
      drawTape(ctx, w - 32, cy, "ALTITUDE", this.telemetry.altitude, "m", false)
    }
  }

  drawCharts() {
    const canvas = this.chartCanvasTarget
    const { context: ctx, width: w, height: h } = prepareCanvas(canvas)
    if (!ctx || !w || !h) return
    ctx.fillStyle = "#071011"; ctx.fillRect(0, 0, w, h)
    const rows = [["AIRSPEED", this.history.airspeed, "#2fd6c6"], ["ALTITUDE", this.history.altitude, "#2fd6c6"], ["VERTICAL SPEED", this.history.verticalSpeed, "#2fd6c6"], ["DATA VALIDITY", this.history.validity, "#65c87a"]]
    const left = Math.min(120, w * .3)
    const right = w - 14
    const rowHeight = Math.max(35, (h - 20) / rows.length)
    rows.forEach(([label, values, color], index) => {
      const y = 18 + index * rowHeight
      ctx.fillStyle = "#899392"; ctx.font = "600 8px ui-monospace"; ctx.textAlign = "left"; ctx.fillText(label, 12, y)
      ctx.fillStyle = label === "DATA VALIDITY" ? "#65c87a" : "#e6ece9"; ctx.font = "600 13px ui-monospace"; ctx.fillText(label === "DATA VALIDITY" ? "Valid" : formatNumber(values.at(-1), label === "VERTICAL SPEED" ? 1 : 0), 12, y + 17)
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath()
      const minimum = Math.min(...values, 0); const maximum = Math.max(...values, 1); const range = Math.max(maximum - minimum, 1)
      const plotValues = values.length ? values : [0, 0]
      plotValues.forEach((value, valueIndex) => {
        const x = left + valueIndex / Math.max(plotValues.length - 1, 1) * (right - left)
        const plotY = y + 10 - ((value - minimum) / range - .5) * Math.min(20, rowHeight * .35)
        valueIndex ? ctx.lineTo(x, plotY) : ctx.moveTo(x, plotY)
      })
      ctx.stroke()
    })
    ctx.strokeStyle = "#2fd6c6"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w * .72, 10); ctx.lineTo(w * .72, h - 10); ctx.stroke()
  }
}

function closeWorkerCapture(worker) {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      worker.removeEventListener("message", handleMessage)
      resolve()
    }
    const handleMessage = ({ data }) => {
      if (data.type === "capture-closed") finish()
    }
    const timeout = window.setTimeout(finish, 750)
    worker.addEventListener("message", handleMessage)
    worker.postMessage({ type: "close" })
  })
}

function prepareCanvas(canvas) {
  const width = Math.floor(canvas.clientWidth)
  const height = Math.floor(canvas.clientHeight)
  if (!width || !height) return { context: null, width, height }
  const ratio = window.devicePixelRatio || 1
  canvas.width = width * ratio
  canvas.height = height * ratio
  const context = canvas.getContext("2d")
  context.scale(ratio, ratio)
  return { context, width, height }
}

function drawPolyline(context, points) {
  if (!points.length) return
  context.beginPath()
  points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y))
  context.stroke()
}

function drawTape(ctx, x, centerY, label, value, unit, left) {
  ctx.textAlign = left ? "left" : "right"
  ctx.fillStyle = "#899392"; ctx.font = "600 9px ui-monospace"; ctx.fillText(label, x, 78); ctx.fillText(unit, x, 92)
  for (let index = -2; index <= 2; index += 1) {
    const y = centerY + index * 38
    ctx.strokeStyle = "#788281"; ctx.beginPath(); ctx.moveTo(x + (left ? 46 : -46), y); ctx.lineTo(x + (left ? 70 : -70), y); ctx.stroke()
    ctx.fillStyle = index === 0 ? "#8cff4d" : "#e6ece9"; ctx.font = index === 0 ? "600 17px ui-monospace" : "500 11px ui-monospace"
    const base = Number.isFinite(value) ? value : 0
    ctx.fillText(Math.round(base + index * (left ? 10 : 100)), x, y + 5)
  }
}

function formatNumber(value, precision = 0, padding = 0) {
  if (!Number.isFinite(value)) return "---"
  const formatted = Number(value).toFixed(precision)
  return padding ? formatted.padStart(padding, "0") : formatted
}

function normalizeHeading(value) { return (Number(value) + 360) % 360 }
function samePort(info, saved) {
  if (!saved || (saved.usbVendorId == null && saved.usbProductId == null)) return false
  return info.usbVendorId === saved.usbVendorId && info.usbProductId === saved.usbProductId
}
function clamp(value, minimum, maximum) { return Math.min(Math.max(value, minimum), Math.max(minimum, maximum)) }
function formatBytes(value) { return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
function ageInSeconds(records) { return Math.max(1, Math.round((Date.now() - Math.min(...records.map((record) => record.queuedAt))) / 1000)) }
function outboxOrder(left, right) {
  const rank = { batch: 0, event: 1, complete: 2 }
  return (rank[left.kind] - rank[right.kind]) || ((left.sequence || 0) - (right.sequence || 0)) || (left.queuedAt - right.queuedAt)
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) database.createObjectStore(OUTBOX_STORE, { keyPath: "id" })
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: "key" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function writeOutbox(database, record) { return transactionRequest(database, OUTBOX_STORE, "readwrite", (store) => store.put(record)) }
function deleteOutbox(database, id) { return transactionRequest(database, OUTBOX_STORE, "readwrite", (store) => store.delete(id)) }
function readOutbox(database) { return transactionRequest(database, OUTBOX_STORE, "readonly", (store) => store.getAll()) }
function writeMetadata(database, key, value) { return transactionRequest(database, META_STORE, "readwrite", (store) => store.put({ key, value })) }
async function readMetadata(database, key) { return (await transactionRequest(database, META_STORE, "readonly", (store) => store.get(key)))?.value }

function transactionRequest(database, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

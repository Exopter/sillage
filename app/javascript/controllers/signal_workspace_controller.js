import { drawSignalInstruments, instrumentStyle } from "signal_instruments"
import { Controller } from "@hotwired/stimulus"
import { AircraftConnectionTransport, setAircraftConnection } from "aircraft_connection"
import { clamp, signalLayoutPreset, parseSignalLayout } from "signal_layout"
import { ImuHealth } from "imu_health"
import { SignalTelemetry } from "signal_telemetry"
import { SignalMap } from "signal_map"
import { registerUsbPageRelease } from "usb_page_lifecycle"

import { OUTBOX_STORE, META_STORE, openDatabase, putOutbox, writeOutbox, deleteOutbox, readOutbox, oldestOutbox, writeMetadata, readMetadata, transactionRequest } from "signal_outbox"
const BATCH_INTERVAL_MS = 2_000
const CHART_WINDOW_MS = 30_000


/**
 * Stimulus accessors are installed at runtime.
 * @typedef {Object} StimulusBindings
 * @property {HTMLElement} presentationTarget
 * @property {HTMLElement} boardTarget
 * @property {HTMLElement} widgetTarget
 * @property {HTMLElement[]} widgetTargets
 * @property {HTMLCanvasElement} mapCanvasTarget
 * @property {HTMLElement} mapSceneTarget
 * @property {HTMLElement} mapCreditsTarget
 * @property {HTMLElement} mapStatusTarget
 * @property {HTMLButtonElement} mapFollowTarget
 * @property {string} cesiumTokenValue
 * @property {string} cesiumBaseUrlValue
 * @property {HTMLCanvasElement} instrumentCanvasTarget
 * @property {HTMLCanvasElement} chartCanvasTarget
 * @property {HTMLButtonElement} connectButtonTarget
 * @property {HTMLElement} radioStatusTarget
 * @property {HTMLElement} recorderStatusTarget
 * @property {HTMLElement} cloudStatusTarget
 * @property {HTMLElement} qualityAttitudeTarget
 * @property {HTMLElement} qualityHeadingTarget
 * @property {HTMLElement} qualityReasonTarget
 * @property {HTMLElement} preflightStatusTarget
 * @property {string} flightIdValue
 * @property {HTMLElement} warningTarget
 * @property {HTMLElement} headingTarget
 * @property {HTMLElement} airspeedTarget
 * @property {HTMLElement} altitudeTarget
 * @property {HTMLElement} verticalSpeedTarget
 * @property {HTMLElement} glideTarget
 * @property {HTMLElement} dataStatusTarget
 * @property {HTMLElement} parserStatusTarget
 * @property {HTMLElement} aircraftMarkerTarget
 * @property {HTMLElement} aircraftLabelTarget
 * @property {HTMLElement[]} sensorValueTargets
 * @property {HTMLElement[]} streamBadgeTargets
 * @property {HTMLElement} latestEventTarget
 * @property {boolean} completedValue
 * @property {string} sessionValue
 * @property {string} flightCodeValue
 * @property {string} batchUrlValue
 * @property {string} eventUrlValue
 * @property {string} completeUrlValue
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  /** @type {SignalMap | null} */
  map3d = null
  imuHealth = new ImuHealth()
  /** @type {{id:number, boot_id:number, imu_epoch:number, firmware:string, outcome:string, invalidated_at:string|null, summary?:{warnings?:string[]}}|null} */
  preflight = null
  /** @type {number|null} */ referenceField = null
  qualityContextAt = 0
  qualityContextKey = ""
  qualitySignature = ""
  preflightInvalidated = false
  qualityContextLoading = false
  measurements = new SignalTelemetry()
  telemetry = this.measurements.snapshot(0)
  /** @type {number|undefined} */
  renderTimer = undefined
  /** @type {number[]} */
  frameTimes = []
  /** @type {Record<"airspeed"|"altitude"|"verticalSpeed"|"validity",number[]>} */
  history = { airspeed: [], altitude: [], verticalSpeed: [], validity: [] }
  /** @type {number[]} */
  historyTimes = []
  /** @type {import("../types/signal").SignalSample[]} */
  pendingSamples = []
  /** @type {IDBDatabase|null} */
  db = null
  /** @type {SerialPort|null} */
  port = null
  /** @type {Worker|null} */
  worker = null
  /** @type {ReadableStreamDefaultReader<Uint8Array>|null} */
  reader = null
  /** @type {Date|null} */
  connectedAt = null
  /** @type {number|null} */
  lastFrameAt = null
  /** @type {string|null} */
  mavlinkSystemId = null
  /** @type {string|null} */
  mavlinkComponentId = null
  /** @type {Promise<void>|null} */
  portOpening = null
  /** @type {Promise<void>|null} */
  stopSerialPromise = null
  /** @type {(() => void)|null} */
  releasePortLock = null
  /** @type {(() => void)|null} */
  unregisterUsbPageRelease = null
  /** @type {WakeLockSentinel|null} */
  wakeLock = null
  /** @type {string|null} */
  cloudError = null
  /** @type {number|undefined} */
  batchTimer = undefined
  /** @type {number|undefined} */
  resizeTimer = undefined
  /** @type {Promise<void>} */
  batchWrite = Promise.resolve()
  nextSequence = 0
  syncing = false
  ended = false
  ending = false
  openingPort = false
  layoutStorageKey = ""
  /** @type {Map<string, {width:number,height:number}>} */
  miniSizes = new Map()

  boundOnline = () => { this.flushOutbox() }
  boundOffline = () => { this.refreshCloudStatus() }
  boundBeforeUnload = (/** @type {BeforeUnloadEvent} */ event) => this.warnBeforeUnload(event)
  boundResize = () => this.reflowLayout()
  boundSerialConnect = async () => { await this.stopSerialPromise; this.autoReconnect() }
  boundSerialDisconnect = (/** @type {Event} */ event) => {
    if (event.target !== this.port) return
    this.showWarning("The ground radio was disconnected. Acquisition will resume after USB reconnection.")
    this.stopSerial()
  }

  get database() {
    if (!this.db) throw new Error("Local storage is not ready")
    return this.db
  }

  static targets = [
    "presentation", "board", "widget", "mapCanvas", "instrumentCanvas", "chartCanvas",
    "mapScene", "mapCredits", "mapStatus", "mapFollow",
    "connectButton", "radioStatus", "recorderStatus", "cloudStatus", "warning",
    "heading", "airspeed", "altitude", "verticalSpeed", "glide", "dataStatus",
    "qualityAttitude", "qualityHeading", "qualityReason", "preflightStatus",
    "parserStatus", "aircraftMarker", "aircraftLabel", "latestEvent", "sensorValue", "streamBadge"
  ]

  static values = {
    cesiumToken: String,
    cesiumBaseUrl: String,
    completed: Boolean,
    session: String,
    flightCode: String,
    flightId: String,
    batchUrl: String,
    eventUrl: String,
    completeUrl: String
  }

  /** @type {symbol|null} */
  connectionGeneration = null

  async connect() {
    const generation = this.connectionGeneration = Symbol("signal")
    this.imuHealth = new ImuHealth()
    this.preflight = null; this.preflightInvalidated = false; this.qualityContextKey = ""; this.qualitySignature = ""; this.qualityContextAt = 0
    this.measurements = new SignalTelemetry()
    this.telemetry = this.measurements.snapshot(0)
    this.frameTimes = []
    this.history = { airspeed: [], altitude: [], verticalSpeed: [], validity: [] }
    this.historyTimes = []
    this.pendingSamples = []
    this.connectedAt = null
    this.lastFrameAt = null
    this.mavlinkSystemId = null
    this.mavlinkComponentId = null
    this.syncing = false
    this.ended = false
    this.ending = false
    this.batchWrite = Promise.resolve()
    this.unregisterUsbPageRelease = registerUsbPageRelease(() => this.releaseCapture())
    this.layoutStorageKey = `signal-layout:${this.sessionValue}`
    try {
      const database = await openDatabase()
      if (generation !== this.connectionGeneration) { database.close(); return }
      const [nextSequence, endedAt] = await Promise.all([
        readMetadata(database, `${this.sessionValue}:next-sequence`),
        readMetadata(database, `${this.sessionValue}:ended-at`)
      ])
      if (generation !== this.connectionGeneration) { database.close(); return }
      this.db = database
      this.nextSequence = Number(nextSequence) || 0
      this.ended = this.completedValue || Boolean(endedAt)
    } catch (caught) {
      if (generation !== this.connectionGeneration) return
      const error = caught instanceof Error ? caught : new Error(String(caught))
      this.connectButtonTarget.disabled = true
      this.showWarning(`Local storage unavailable: ${error.message}`)
      return
    }
    window.addEventListener("online", this.boundOnline)
    window.addEventListener("offline", this.boundOffline)
    window.addEventListener("beforeunload", this.boundBeforeUnload)
    window.addEventListener("resize", this.boundResize)
    navigator.serial?.addEventListener("connect", this.boundSerialConnect)
    navigator.serial?.addEventListener("disconnect", this.boundSerialDisconnect)
    this.restoreLayout()
    this.map3d = new SignalMap({ container: this.mapSceneTarget, credits: this.mapCreditsTarget,
      status: this.mapStatusTarget, followButton: this.mapFollowTarget,
      baseUrl: this.cesiumBaseUrlValue, token: this.cesiumTokenValue, label: this.flightCodeValue })
    this.map3d.start()
    this.batchTimer = window.setInterval(() => {
      if (!this.ending) this.queuePendingBatch().then(() => this.flushOutbox()).catch((error) => this.showWarning(`Local storage failed: ${error.message}. Keep this page open and free disk space.`))
    }, BATCH_INTERVAL_MS)
    this.connectButtonTarget.disabled = this.ended
    this.renderTimer = window.setInterval(() => this.refreshTelemetry(), 100)
    this.refreshTelemetry()
    await this.prepareLocalStorage()
    await this.flushOutbox()
    if (generation === this.connectionGeneration) await this.autoReconnect()
  }

  disconnect() {
    this.map3d?.destroy()
    this.map3d = null
    this.connectionGeneration = null
    this.unregisterUsbPageRelease?.()
    this.unregisterUsbPageRelease = null
    window.clearInterval(this.batchTimer)
    window.clearInterval(this.renderTimer)
    window.removeEventListener("online", this.boundOnline)
    window.removeEventListener("offline", this.boundOffline)
    window.removeEventListener("beforeunload", this.boundBeforeUnload)
    window.removeEventListener("resize", this.boundResize)
    navigator.serial?.removeEventListener("connect", this.boundSerialConnect)
    navigator.serial?.removeEventListener("disconnect", this.boundSerialDisconnect)
    this.releaseCapture().catch((error) => this.showWarning(`Local storage failed: ${error.message}`))
    this.wakeLock?.release()
  }

  async prepareLocalStorage() {
    if (!navigator.storage?.persist) return

    if (!await navigator.storage.persisted()) await navigator.storage.persist()
    const estimate = await navigator.storage.estimate()
    if (estimate.quota && estimate.usage && estimate.quota - estimate.usage < 250 * 1024 * 1024) {
      this.showWarning("Less than 250 MB of browser storage remains. Free space before a long acquisition.")
    }
  }

  async autoReconnect() {
    const generation = this.connectionGeneration
    if (!navigator.serial || this.ended || this.ending || !generation) return
    const ports = (await navigator.serial.getPorts()).filter(isGroundRadio)
    const lastPort = await readMetadata(this.database, "last-authorized-port")
    const port = ports.find((candidate) => samePort(candidate.getInfo(), lastPort)) || (ports.length === 1 ? ports[0] : null)
    if (port && generation === this.connectionGeneration) await this.acquirePort(port)
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
      const authorized = (await navigator.serial.getPorts()).filter(isGroundRadio)
      const port = authorized.length === 1 ? authorized[0] : await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0403 }, { usbVendorId: 0x10c4 }] })
      await this.acquirePort(port)
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught))
      if (error.name !== "NotFoundError") this.showWarning(`Ground radio connection failed: ${error.message}`)
    }
  }

  /** @param {SerialPort} port */
  async acquirePort(port) {
    const generation = this.connectionGeneration
    if (!generation || this.port || this.openingPort || this.ending || this.ended) return
    this.openingPort = true
    const lockName = `sillage-signal-port:${port.getInfo().usbVendorId || "serial"}:${port.getInfo().usbProductId || "port"}`
    navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
      if (generation !== this.connectionGeneration || this.ending || this.ended) {
        this.openingPort = false
        return
      }
      if (!lock) {
        this.openingPort = false
        this.showWarning("This ground radio is already being read by another browser tab.")
        return
      }
      /** @type {Promise<void>} */
      const released = new Promise((release) => { this.releasePortLock = release })
      try {
        await this.openSerial(port)
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error(String(caught))
        this.showWarning(`Ground radio connection failed: ${error.message}`)
        await this.stopSerial()
      }
      await released
    })
  }

  /** @param {SerialPort} port */
  async openSerial(port) {
    const generation = this.connectionGeneration
    this.port = port
    this.portOpening = port.open({ baudRate: 57_600, bufferSize: 65_536 })
    try {
      await this.portOpening
    } finally {
      this.portOpening = null
    }
    if (generation !== this.connectionGeneration || this.ending || this.ended) return
    await writeMetadata(this.database, "last-authorized-port", port.getInfo())
    if (generation !== this.connectionGeneration || this.ending || this.ended) return
    this.openingPort = false
    this.connectedAt = new Date()
    this.imuHealth = new ImuHealth()
    this.preflight = null; this.preflightInvalidated = false; this.qualityContextKey = ""; this.qualitySignature = ""; this.qualityContextAt = 0
    this.measurements = new SignalTelemetry()
    this.lastFrameAt = null
    this.frameTimes = []
    this.mavlinkSystemId = null
    this.mavlinkComponentId = null
    this.worker = new Worker("/signal_serial_worker.js?v=57-full-identity")
    this.worker.onmessage = ({ data }) => this.handleWorkerMessage(data)
    this.worker.onerror = () => this.showWarning("Telemetry decoding stopped. Reconnect the ground radio.")
    this.worker.postMessage({ type: "init-capture", filename: `${this.flightCodeValue}-${this.sessionValue}.mavcap` })
    const label = this.connectButtonTarget.querySelector("span:last-child") || this.connectButtonTarget
    label.textContent = "Disconnect ground radio"
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
          this.worker?.postMessage({ type: "bytes", bytes, receivedAtUs: String(Date.now() * 1000) }, [bytes])
        }
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error(String(caught))
        if (!this.ended) this.showWarning(`The ground radio was disconnected: ${error.message}`)
      } finally {
        this.reader.releaseLock()
        this.reader = null
      }
      break
    }
    if (!this.ended && this.port) await this.stopSerial()
  }

  async releaseCapture() {
    await this.stopSerial()
    await this.queuePendingBatch()
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
    try { await this.portOpening } catch (_) { /* A failed open still needs to release its lock. */ }
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
    const label = this.connectButtonTarget.querySelector("span:last-child") || this.connectButtonTarget
    label.textContent = "Connect ground radio"
    this.connectButtonTarget.setAttribute("aria-label", "Connect ground radio")
    this.radioStatusTarget.textContent = "Not connected"
    this.imuHealth = new ImuHealth()
    this.preflight = null; this.preflightInvalidated = false; this.qualityContextKey = ""; this.qualitySignature = ""; this.qualityContextAt = 0
    this.measurements = new SignalTelemetry()
    this.refreshTelemetry()
    this.updateGroundRadioState("disconnected")
  }

  /** @param {"connected"|"disconnected"} state */
  updateGroundRadioState(state) {
    setAircraftConnection(AircraftConnectionTransport.GROUND_RADIO, state === "connected")
  }

  /** @param {import("../types/signal").CaptureMessage} message */
  handleWorkerMessage(message) {
    if (message.type === "capture-ready") {
      this.recorderStatusTarget.textContent = "Recording locally"
      return
    }
    if (message.type === "capture-closed") {
      this.recorderStatusTarget.textContent = `Capture saved · ${formatBytes(message.bytes)}`
      return
    }
    if (message.type === "capture-error") {
      this.recorderStatusTarget.textContent = "Local capture unavailable"
      this.showWarning(`Raw capture unavailable: ${message.message}`)
      return
    }
    if (message.type !== "frame") return

    const now = Date.now()
    // SiK injects RADIO_STATUS from its own identity. It must never select the aircraft.
    if (message.decoded.name !== "radio") {
      if (message.decoded.name === "unknown" || message.decoded.name === "ping") return
      if (this.mavlinkSystemId == null) {
        this.mavlinkSystemId = String(message.systemId)
        this.mavlinkComponentId = String(message.componentId)
      }
      if (String(message.systemId) !== this.mavlinkSystemId || String(message.componentId) !== this.mavlinkComponentId) return
      this.lastFrameAt = now
      this.frameTimes.push(now)
    }
    this.parserStatusTarget.textContent = `${message.parser.errors} CRC errors · ${message.parser.dropped} missing frames`
    this.applyTelemetry(message.decoded, message)
  }

  /** @param {import("../types/signal").DecodedMessage} decoded @param {import("../types/signal").FrameMessage} frame */
  applyTelemetry(decoded, frame) {
    const now = Date.now()
    const generation = this.imuHealth.generation
    this.imuHealth.apply(decoded, now)
    if (this.imuHealth.generation !== generation) this.measurements = new SignalTelemetry()
    this.measurements.apply(decoded, now)
    this.telemetry = this.measurements.snapshot(now)
    const recordedAt = new Date(Number(BigInt(frame.receivedAtUs) / 1000n)).toISOString()
    if (decoded.name === "unknown") return
    if (decoded.name === "gps" && this.telemetry.gps) {
      /** @type {import("../types/signal").SignalSample} */
      const sample = { kind: "gps", recorded_at: recordedAt, latitude: decoded.latitude, longitude: decoded.longitude, gps_fix: decoded.fix }
      if (decoded.fix >= 3) sample.altitude_m = decoded.altitudeM
      if (decoded.velocityMps != null) sample.horizontal_speed_mps = decoded.velocityMps
      if (decoded.courseDeg != null) sample.heading_deg = decoded.courseDeg
      if (decoded.satellites != null) sample.satellite_count = decoded.satellites
      this.pendingSamples.push(sample)
    } else {
      // Keep GPS diagnostics without adding an invalid position to the Flight track.
      this.pendingSamples.push(this.sensorSample(recordedAt, decoded.name.toUpperCase(), decoded))
    }
  }

  refreshTelemetry() {
    const now = Date.now()
    this.telemetry = this.measurements.snapshot(now)
    this.frameTimes = this.frameTimes.filter((time) => now - time < 1_000)
    const live = Boolean(this.port && this.lastFrameAt && now - this.lastFrameAt < 1_500)
    const state = this.ended ? "Ended" : live ? "Live" : this.lastFrameAt ? "Stale" : "Waiting"
    this.streamBadgeTargets.forEach((badge) => {
      const widget = badge.closest("[data-widget]")?.getAttribute("data-widget")
      const available = widget === "map" ? this.telemetry.gps != null
        : widget === "instruments" ? this.telemetry.roll != null && this.telemetry.pitch != null : true
      const label = live && !available ? (widget === "map" && this.telemetry.fix != null ? "No fix" : "No data") : state
      badge.textContent = label
      badge.dataset.state = live && !available ? "waiting" : state.toLowerCase()
    })
    if (this.port) {
      this.radioStatusTarget.textContent = live
        ? `Live · ${this.mavlinkSystemId}/${this.mavlinkComponentId} · ${this.frameTimes.length} frames/s${this.telemetry.radio == null ? "" : ` · ${formatNumber(this.telemetry.radio)} dBm`}`
        : this.lastFrameAt ? "No telemetry · link lost" : "Connected · waiting for MAVLink"
    }
    this.dataStatusTarget.textContent = this.ended ? "Session ended locally" : live ? "Receiving telemetry" : this.lastFrameAt ? "Telemetry stale" : "Waiting for telemetry"
    this.pushHistory(live, now)
    this.renderValues()
    this.drawAll()
  }

  /** @param {string} recordedAt @param {string} sensorType @param {import("../types/signal").DecodedMessage} readings @returns {import("../types/signal").SignalSample} */
  sensorSample(recordedAt, sensorType, readings) {
    return { kind: "sensor", sensor_type: sensorType, recorded_at: recordedAt, readings }
  }

  /** @param {boolean} live @param {number} now */
  pushHistory(live, now = Date.now()) {
    // A wall-clock correction must not reorder the visible time axis.
    if (now < (this.historyTimes.at(-1) ?? now)) {
      this.historyTimes = []
      this.history = { airspeed: [], altitude: [], verticalSpeed: [], validity: [] }
    }
    this.historyTimes.push(now)
    let expired = 0
    while (this.historyTimes[expired] < now - CHART_WINDOW_MS) expired++
    this.historyTimes.splice(0, expired)
    for (const key of /** @type {const} */ (["airspeed", "altitude", "verticalSpeed", "validity"])) {
      this.history[key].push(key === "validity" ? Number(live) : this.telemetry[key] ?? NaN)
      this.history[key].splice(0, expired)
    }
  }

  renderValues() {
    this.renderQuality()
    this.headingTarget.textContent = formatNumber(this.telemetry.heading, 0, 3)
    this.airspeedTarget.textContent = formatNumber(this.telemetry.airspeed, 1)
    this.altitudeTarget.textContent = formatNumber(this.telemetry.altitude, 0)
    this.verticalSpeedTarget.textContent = formatNumber(this.telemetry.verticalSpeed, 1)
    this.glideTarget.textContent = formatNumber(this.telemetry.glide, 1)
    this.aircraftLabelTarget.textContent = this.telemetry.gps
      ? `${this.telemetry.gps[1].toFixed(5)}, ${this.telemetry.gps[0].toFixed(5)}` : "No current GPS position"
    const vector = (/** @type {number[]|null} */ values) => values ? values.map((value) => formatNumber(value, 2)).join(" / ") : "---"
    const fix = this.telemetry.fix
    /** @type {Record<string, string>} */
    const values = {
      gLoad: formatNumber(this.telemetry.gLoad, 2),
      accel: vector(this.telemetry.accel), gyro: vector(this.telemetry.gyro), mag: vector(this.telemetry.mag),
      pressure: formatNumber(this.telemetry.pressure, 2), temperature: formatNumber(this.telemetry.temperature, 1),
      gps: fix == null ? "---" : `${fix < 2 ? "No fix" : fix === 2 ? "2D fix" : "3D fix"} · ${formatNumber(this.telemetry.satellites)} sats`
    }
    this.sensorValueTargets.forEach((target) => { target.textContent = values[target.dataset.sensor || ""] || "---" })
  }

  queuePendingBatch() {
    this.batchWrite = (this.batchWrite || Promise.resolve()).catch(() => {}).then(() => this.persistPendingBatch())
    return this.batchWrite
  }

  async persistPendingBatch() {
    if (!this.pendingSamples.length || this.ended) return
    const samples = this.pendingSamples.splice(0)
    const sequence = this.nextSequence
    /** @type {import("signal_outbox").OutboxRecord} */
    const batch = {
      id: `${this.sessionValue}:batch:${sequence}`,
      session: this.sessionValue,
      kind: "batch",
      sequence,
      url: this.batchUrlValue,
      method: "POST",
      body: {
        sequence,
        first_received_at: samples[0].recorded_at,
        last_received_at: samples[samples.length - 1].recorded_at,
        mavlink_system_id: this.mavlinkSystemId,
        mavlink_component_id: this.mavlinkComponentId,
        position: this.telemetry.gps ? { longitude: this.telemetry.gps[0], latitude: this.telemetry.gps[1] } : null,
        samples
      },
      queuedAt: Date.now()
    }
    try {
      await transactionRequest(this.database, [OUTBOX_STORE, META_STORE], "readwrite", (_store, transaction) => {
        transaction.objectStore(META_STORE).put({ key: `${this.sessionValue}:next-sequence`, value: sequence + 1 })
        return putOutbox(transaction.objectStore(OUTBOX_STORE), batch)
      })
      this.nextSequence = sequence + 1
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught))
      this.pendingSamples = samples.concat(this.pendingSamples)
      throw error
    }
  }

  renderQuality() {
    const now = Date.now(), q = this.imuHealth.quality
    const status = this.imuHealth.status(now, this.referenceField)
    this.qualityAttitudeTarget.textContent = status.attitude
    this.qualityAttitudeTarget.dataset.state = status.attitude
    this.qualityHeadingTarget.textContent = status.heading
    this.qualityHeadingTarget.dataset.state = status.heading
    this.qualityReasonTarget.textContent = status.reason
    const key = q ? `${q.deviceId}/${q.bootId}/${q.imuEpoch}/${q.firmware}` : ""
    if (q && !this.qualityContextLoading && (key !== this.qualityContextKey || now - this.qualityContextAt > 30000)) void this.loadQualityContext(key)
    const check = this.preflight
    const sameBoot = q && check && check.boot_id === q.bootId && check.imu_epoch === q.imuEpoch && check.firmware === q.firmware
    if (check && (!sameBoot || status.issues.length > 0)) this.preflightInvalidated = true
    const warnings = status.warnings || []
    const hasWarning = warnings.length > 0 || (check?.summary?.warnings?.length || 0) > 0
    this.preflightStatusTarget.textContent = !check ? "Not checked" : check.invalidated_at || this.preflightInvalidated || !sameBoot ? "Recheck required" : check.outcome === "passed" ? hasWarning ? "Passed with warning" : "Passed for this boot" : "Check failed"
    this.preflightStatusTarget.dataset.state = !check ? "unknown" : check.invalidated_at || this.preflightInvalidated || !sameBoot || check.outcome !== "passed" ? "degraded" : hasWarning ? "warning" : "consistent"
    const signature = `${key}:${status.issues.join(",")}:${warnings.join(",")}:${this.preflightInvalidated}`
    if (signature !== this.qualitySignature && q && this.db && !this.ended && !this.ending) {
      this.qualitySignature = signature
      void this.recordQualityEvent(status.reason, status.issues, this.preflightInvalidated ? check?.id : undefined, warnings)
    }
  }

  /** @param {string} key */
  async loadQualityContext(key) {
    const q = this.imuHealth.quality
    if (!q) return
    this.qualityContextLoading = true
    const connection = this.connectionGeneration
    try {
      const response = await fetch(`/api/v1/imu-checks?device_id=${encodeURIComponent(q.deviceId)}&firmware=${encodeURIComponent(q.firmware)}&flight_id=${encodeURIComponent(this.flightIdValue)}`)
      const result = response.ok ? await response.json() : null
      const locallyInvalidated = result?.preflight && await readMetadata(this.database, `imu-check:${result.preflight.id}:invalidated`)
      const current = this.imuHealth.quality
      if (connection !== this.connectionGeneration || !current || `${current.deviceId}/${current.bootId}/${current.imuEpoch}/${current.firmware}` !== key) return
      if (result?.preflight?.id !== this.preflight?.id) this.preflightInvalidated = false
      if (locallyInvalidated) this.preflightInvalidated = true
      this.preflight = result?.preflight || null
      this.referenceField = result?.reference?.summary?.magnetic_mean_ut ?? null
      this.qualityContextKey = key
    } catch { this.preflight = null }
    finally { this.qualityContextAt = Date.now(); this.qualityContextLoading = false }
  }

  /** @param {string} reason @param {string[]} issues @param {number} [invalidatedId] @param {string[]} [warnings] */
  async recordQualityEvent(reason, issues, invalidatedId, warnings = []) {
    const id = crypto.randomUUID()
    try {
      if (invalidatedId) await writeMetadata(this.database, `imu-check:${invalidatedId}:invalidated`, true)
      await writeOutbox(this.database, { id: `${this.sessionValue}:event:${id}`, session: this.sessionValue, kind: "event", url: this.eventUrlValue, method: "POST", queuedAt: Date.now(),
        body: { event_uuid: id, event_type: issues.length || warnings.length || invalidatedId ? "warning" : "note", occurred_at: new Date().toISOString(), label: `IMU: ${reason}`,
          metadata: { source: "imu_health", issues, warnings, invalidate_preflight_id: invalidatedId ?? null, boot_id: this.imuHealth.quality?.bootId, imu_epoch: this.imuHealth.quality?.imuEpoch } } })
      await this.flushOutbox()
    } catch { this.qualitySignature = "" }
  }

  async markEvent() {
    if (this.ending || this.ended) return
    const occurredAt = new Date().toISOString()
    const eventUuid = crypto.randomUUID()
    const label = `Operator marker · ${new Date().toLocaleTimeString()}`
    await writeOutbox(this.database, { id: `${this.sessionValue}:event:${eventUuid}`, session: this.sessionValue, kind: "event", url: this.eventUrlValue, method: "POST", body: { event_uuid: eventUuid, event_type: "marker", occurred_at: occurredAt, label, metadata: {} }, queuedAt: Date.now() })
    this.latestEventTarget.hidden = false
    this.latestEventTarget.textContent = label
    await this.flushOutbox()
  }

  async endSession() {
    if (this.ended || this.ending || !window.confirm("End local capture? Import the microSD recording afterward to analyse this flight.")) return
    this.ending = true
    try {
      await this.releaseCapture()
      const id = `${this.sessionValue}:complete`
      const endedAt = new Date().toISOString()
      await transactionRequest(this.database, [OUTBOX_STORE, META_STORE], "readwrite", (_store, transaction) => {
        transaction.objectStore(META_STORE).put({ key: `${this.sessionValue}:ended-at`, value: endedAt })
        return putOutbox(transaction.objectStore(OUTBOX_STORE), { id, session: this.sessionValue, kind: "complete", url: this.completeUrlValue, method: "PATCH", body: { ended_at: endedAt }, queuedAt: Date.now() })
      })
      this.ended = true
      this.connectButtonTarget.disabled = true
      await this.flushOutbox()
      this.dataStatusTarget.textContent = "Session ended locally"
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught))
      this.showWarning(`The session could not be saved: ${error.message}. Keep this page open and retry ending the session.`)
    } finally {
      this.ending = false
    }
  }

  async flushOutbox() {
    if (!navigator.onLine || this.syncing || !this.db) {
      this.refreshCloudStatus()
      return
    }
    this.syncing = true
    try {
      while (navigator.onLine) {
      const records = await readOutbox(this.db, this.sessionValue)
      if (!records.length) break
      for (const record of records) {
        const response = await fetch(record.url, {
          method: record.method,
          headers: { "Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || "" },
          body: JSON.stringify(record.body)
        })
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          const detail = typeof body?.error === "string" ? body.error : `Cloud returned ${response.status}`
          throw new Error(record.kind === "batch" ? `Batch ${record.sequence}: ${detail}` : detail)
        }
        await deleteOutbox(this.db, record.id)
      }
      }
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught))
      this.cloudError = error.message
    } finally {
      this.syncing = false
      await this.refreshCloudStatus()
    }
  }

  async refreshCloudStatus() {
    const oldest = this.db ? await oldestOutbox(this.db, this.sessionValue) : null
    const age = oldest ? Math.max(1, Math.round((Date.now() - oldest.queuedAt) / 1000)) : 0
    if (!navigator.onLine) {
      this.cloudStatusTarget.textContent = oldest ? `${age} s behind` : "Offline"
    } else if (!this.syncing && oldest && this.cloudError) {
      this.cloudStatusTarget.textContent = `Sync blocked: ${this.cloudError}`
    } else if (this.syncing || oldest) {
      this.cloudStatusTarget.textContent = oldest ? `Syncing · ${age} s behind` : "Syncing"
    } else {
      this.cloudStatusTarget.textContent = this.ended ? "Synced" : "Live"
      this.cloudError = null
    }
  }

  async acquireWakeLock() {
    if (!navigator.wakeLock?.request) return
    try { this.wakeLock = await navigator.wakeLock.request("screen") } catch (_) { /* Non-fatal. */ }
  }

  /** @param {BeforeUnloadEvent} event */
  warnBeforeUnload(event) {
    if (this.ended || (!this.port && this.pendingSamples.length === 0)) return
    event.preventDefault()
    event.returnValue = ""
  }

  /** @param {string} message */
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

  /** @param {MouseEvent} event */
  setMode(event) {
    const widget = event.currentTarget instanceof Element ? event.currentTarget.closest("[data-widget]") : null
    if (!(widget instanceof HTMLElement) || !(event.currentTarget instanceof HTMLElement)) return
    const mode = event.currentTarget.dataset.mode || "mini"
    if (mode === widget.dataset.mode) return
    const id = widget.dataset.widget || "map"
    const rect = this.widgetRect(widget)
    if (widget.dataset.mode === "mini") this.miniSizes.set(id, { width: rect.width, height: rect.height })
    if (mode === "large") {
      this.widgetTargets.forEach((candidate) => {
        if (candidate !== widget && candidate.dataset.mode !== "hidden") candidate.dataset.mode = "mini"
      })
      widget.dataset.mode = "large"
      this.applyPreset(widget.dataset.widget || "map")
    } else {
      widget.dataset.mode = mode
      if (mode === "hidden") {
        widget.style.height = "38px"
      } else {
        const size = this.miniSizes.get(id) || { width: 430, height: 320 }
        widget.style.height = `${size.height}px`
        widget.style.width = `${size.width}px`
      }
      this.clampWidget(widget)
    }
    this.updateModeButtons()
    this.saveLayout()
    this.drawAll()
  }

  resetLayout() {
    this.miniSizes.clear()
    this.widgetTargets.forEach((widget) => { widget.removeAttribute("style") })
    this.widgetTargets.forEach((widget) => { widget.dataset.mode = widget.dataset.widget === "map" ? "large" : "mini" })
    this.applyPreset("map")
    this.saveLayout()
  }

  /** @param {MouseEvent} event */
  resetWidget(event) {
    const widget = event.currentTarget instanceof Element ? event.currentTarget.closest("[data-widget]") : null
    if (!(widget instanceof HTMLElement)) return
    const id = widget.dataset.widget || "map"
    this.applyPreset(this.widgetTargets.find((widget) => widget.dataset.mode === "large")?.dataset.widget || id)
  }

  restoreLayout() {
    requestAnimationFrame(() => {
      const stored = parseSignalLayout(sessionStorage.getItem(this.layoutStorageKey))
      if (stored) {
        const board = stored.board
        this.widgetTargets.forEach((widget) => {
          const record = stored.widgets[widget.dataset.widget || "map"]
          if (!record) return
          if (record.miniSize) this.miniSizes.set(widget.dataset.widget || "map", record.miniSize)
          widget.dataset.mode = record.mode
          Object.assign(widget.style, { left: `${record.left}px`, top: `${record.top}px`, width: `${record.width}px`, height: `${record.height}px` })
        })
        const viewportChanged = board && (Math.abs(board.width - this.boardTarget.clientWidth) > 80 || Math.abs(board.height - this.boardTarget.clientHeight) > 80)
        const oversized = this.widgetTargets.some((widget) => {
          const record = stored.widgets[widget.dataset.widget || "map"]
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

  /** @param {string} largeId */
  applyPreset(largeId) {
    const width = this.boardTarget.clientWidth
    const height = this.boardTarget.clientHeight
    const rectangles = signalLayoutPreset(
      width,
      height,
      this.widgetTargets.map((widget) => ({ id: widget.dataset.widget || "map", mode: widget.dataset.mode || "mini" })),
      largeId
    )
    this.widgetTargets.forEach((widget) => {
      const rectangle = rectangles[(widget.dataset.widget || "map")]
      Object.assign(widget.style, {
        left: `${rectangle.left}px`,
        top: `${rectangle.top}px`,
        width: `${rectangle.width}px`,
        height: `${rectangle.height}px`
      })
    })
    this.updateModeButtons()
    this.saveLayout()
    this.drawAll()
  }

  /** @param {PointerEvent} event */
  startDrag(event) {
    if (event.button !== 0) return
    event.preventDefault()
    const widget = event.currentTarget instanceof Element ? event.currentTarget.closest("[data-widget]") : null
    if (!(widget instanceof HTMLElement)) return
    const rect = this.widgetRect(widget)
    const boardRect = this.boardTarget.getBoundingClientRect()
    const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
    widget.classList.add("is-dragging")
    widget.style.zIndex = "12"
    const move = (/** @type {PointerEvent} */ nextEvent) => {
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

  /** @param {KeyboardEvent} event */
  nudgeWidget(event) {
    /** @type {Record<string, number[]>} */
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    const widget = event.currentTarget instanceof Element ? event.currentTarget.closest("[data-widget]") : null
    if (!(widget instanceof HTMLElement)) return
    const rect = this.widgetRect(widget)
    const step = event.shiftKey ? 24 : 8
    widget.style.left = `${rect.left + direction[0] * step}px`
    widget.style.top = `${rect.top + direction[1] * step}px`
    this.clampWidget(widget)
    this.saveLayout()
  }

  /** @param {HTMLElement} widget */
  widgetRect(widget) {
    const board = this.boardTarget.getBoundingClientRect()
    const rect = widget.getBoundingClientRect()
    return { left: rect.left - board.left, top: rect.top - board.top, width: rect.width, height: rect.height }
  }

  /** @param {HTMLElement} widget */
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
    /** @type {Record<string, {width:number,height:number,left?:number,top?:number,mode?:string,miniSize?:{width:number,height:number}}>} */
    const layout = { __board: { width: this.boardTarget.clientWidth, height: this.boardTarget.clientHeight } }
    this.widgetTargets.forEach((widget) => {
      const id = widget.dataset.widget || "map"
      const rect = this.widgetRect(widget)
      if (widget.dataset.mode === "mini") this.miniSizes.set(id, { width: rect.width, height: rect.height })
      layout[id] = { mode: widget.dataset.mode, ...rect, miniSize: this.miniSizes.get(id) }
    })
    sessionStorage.setItem(this.layoutStorageKey, JSON.stringify(layout))
  }

  updateModeButtons() {
    this.widgetTargets.forEach((widget) => {
      widget.querySelectorAll("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.getAttribute("data-mode") === widget.dataset.mode)))
    })
  }

  drawAll() {
    this.drawMap()
    this.drawInstruments()
    this.drawCharts()
  }

  drawMap() {
    const ready = this.map3d?.ready || false
    this.mapCanvasTarget.hidden = ready
    this.mapSceneTarget.hidden = !ready
    if (ready) {
      this.aircraftMarkerTarget.hidden = true
      this.map3d?.update(this.telemetry)
      return
    }
    const canvas = this.mapCanvasTarget
    const { context, width, height, fontFamily } = prepareCanvas(canvas)
    if (!context || !width || !height) return
    context.clearRect(0, 0, width, height)
    context.strokeStyle = "#202c31"
    for (let x = 0; x < width; x += 50) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke() }
    for (let y = 0; y < height; y += 50) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke() }
    this.aircraftMarkerTarget.hidden = !this.telemetry.gps
    const track = this.measurements.track
    if (!track.length) {
      context.fillStyle = "#899392"; context.font = `500 13px ${fontFamily}`; context.textAlign = "center"
      context.fillText("Waiting for a GPS position", width / 2, height / 2)
      return
    }
    const [originLon, originLat] = track[0]
    const points = track.map(([lon, lat]) => [(((lon - originLon + 540) % 360) - 180) * Math.cos(originLat * Math.PI / 180) * 111_320, (lat - originLat) * 111_320])
    const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1])
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys)
    const scale = Math.min(Math.max(1, width - 120) / Math.max(100, maxX - minX), Math.max(1, height - 120) / Math.max(100, maxY - minY))
    const projected = points.map(([x, y]) => [width / 2 + (x - (minX + maxX) / 2) * scale, height / 2 - (y - (minY + maxY) / 2) * scale])
    context.strokeStyle = "#8cff4d"; context.lineWidth = 2
    drawPolyline(context, projected)
    const last = projected[projected.length - 1]
    this.aircraftMarkerTarget.style.left = `${last[0]}px`
    this.aircraftMarkerTarget.style.top = `${last[1]}px`
    this.aircraftMarkerTarget.style.setProperty("--aircraft-heading", `${this.telemetry.heading ?? 0}deg`)
    context.fillStyle = "#899392"; context.font = `500 10px ${fontFamily}`; context.textAlign = "left"
    context.fillText(`N ↑ · ${Math.round(50 / scale)} m / grid`, 12, height - 16)
  }

  toggleMapFollow() { this.map3d?.toggleFollow() }

  drawInstruments() {
    const canvas = this.instrumentCanvasTarget
    const { context, width, height } = prepareCanvas(canvas)
    if (!context || !width || !height) return
    drawSignalInstruments(context, width, height, this.telemetry, instrumentStyle(canvas))
  }

  drawCharts() {
    const canvas = this.chartCanvasTarget
    const { context: ctx, width: w, height: h, fontFamily } = prepareCanvas(canvas)
    if (!ctx || !w || !h) return
    const style = instrumentStyle(canvas)
    ctx.fillStyle = style.background; ctx.fillRect(0, 0, w, h)
    /** @type {[string, number[], string][]} */
    const rows = [["AIRSPEED", this.history.airspeed, style.reference], ["ALTITUDE", this.history.altitude, style.reference], ["VERTICAL SPEED", this.history.verticalSpeed, style.reference]]
    const left = Math.min(120, w * .3)
    const right = w - 14
    const axisY = h - 25
    const rowHeight = Math.max(20, (axisY - 52) / rows.length)
    const now = this.historyTimes.at(-1) ?? Date.now()
    const start = now - CHART_WINDOW_MS
    const timeX = (/** @type {number} */ time) => left + (time - start) / CHART_WINDOW_MS * (right - left)
    const tickStep = right - left >= 420 ? 5_000 : 10_000
    ctx.font = `500 9px ${fontFamily}`
    ctx.lineWidth = 0.5
    for (let offset = -CHART_WINDOW_MS; offset <= 0; offset += tickStep) {
      const x = timeX(now + offset)
      ctx.strokeStyle = style.line; ctx.globalAlpha = 0.3
      ctx.beginPath(); ctx.moveTo(x, 9); ctx.lineTo(x, axisY); ctx.stroke()
      ctx.globalAlpha = 1
      ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 4); ctx.stroke()
      ctx.fillStyle = style.muted
      ctx.textAlign = offset === 0 ? "right" : offset === -CHART_WINDOW_MS ? "left" : "center"
      ctx.fillText(offset === 0 ? "NOW" : `${offset / 1000}s`, x, h - 8)
    }
    ctx.strokeStyle = style.line
    ctx.beginPath(); ctx.moveTo(left, axisY); ctx.lineTo(right, axisY); ctx.stroke()
    ctx.fillStyle = style.muted; ctx.textAlign = "left"
    ctx.fillText("TIME · 30 s", 12, h - 8)
    rows.forEach(([label, values, color], index) => {
      const y = 18 + index * rowHeight
      ctx.fillStyle = style.muted; ctx.font = `600 8px ${fontFamily}`; ctx.textAlign = "left"; ctx.fillText(label, 12, y)
      ctx.fillStyle = style.text; ctx.font = `600 13px ${fontFamily}`; ctx.fillText(formatNumber(values.at(-1), label === "VERTICAL SPEED" ? 1 : 0), 12, y + 17)
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath()
      const finiteValues = values.filter(Number.isFinite)
      const minimum = Math.min(...finiteValues, 0); const maximum = Math.max(...finiteValues, 1); const range = Math.max(maximum - minimum, 1)
      const plotValues = values
      let drawing = false
      plotValues.forEach((value, valueIndex) => {
        if (!Number.isFinite(value)) { drawing = false; return }
        const time = this.historyTimes[valueIndex]
        if (time - this.historyTimes[valueIndex - 1] > 1_500) drawing = false
        const x = timeX(time)
        const plotY = y + 10 - ((value - minimum) / range - .5) * Math.min(20, rowHeight * .35)
        drawing ? ctx.lineTo(x, plotY) : ctx.moveTo(x, plotY)
        drawing = true
      })
      ctx.stroke()
    })
    const css = getComputedStyle(canvas)
    const liveColor = css.getPropertyValue("--ex-telemetry-live").trim()
    const noDataColor = css.getPropertyValue("--ex-telemetry-no-data").trim()
    const receptionY = axisY - 28
    ctx.fillStyle = style.muted; ctx.font = `600 8px ${fontFamily}`
    ctx.fillText("TELEMETRY RECEPTION", 12, receptionY)
    ctx.fillStyle = this.history.validity.at(-1) ? liveColor : noDataColor
    ctx.font = `600 13px ${fontFamily}`
    ctx.fillText(this.history.validity.at(-1) ? "Live" : "No data", 12, receptionY + 17)
    ctx.font = `500 8px ${fontFamily}`
    ctx.fillStyle = liveColor; ctx.fillRect(left, receptionY - 6, 6, 6)
    ctx.fillStyle = style.muted; ctx.fillText("Live", left + 10, receptionY)
    ctx.fillStyle = noDataColor; ctx.fillRect(left + 44, receptionY - 6, 6, 6)
    ctx.fillStyle = style.muted; ctx.fillText("No data", left + 54, receptionY)
    this.history.validity.forEach((value, index) => {
      const time = this.historyTimes[index]
      const nextTime = this.historyTimes[index + 1] ?? now
      // Leave unobserved time blank when rendering was suspended.
      if (nextTime - time > 1_500) return
      const x = Math.round(timeX(time))
      ctx.fillStyle = value ? liveColor : noDataColor
      ctx.fillRect(x, receptionY + 9, Math.min(right - x, Math.max(1, Math.round(timeX(nextTime)) - x)), 8)
    })
  }
}

/** @param {Worker} worker @returns {Promise<void>} */
function closeWorkerCapture(worker) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      worker.removeEventListener("message", handleMessage)
      resolve()
    }
    const handleMessage = (/** @type {MessageEvent<import("../types/signal").CaptureMessage>} */ { data }) => {
      if (data.type === "capture-closed") finish()
    }
    const timeout = window.setTimeout(() => {
      worker.removeEventListener("message", handleMessage)
      reject(new Error("The capture worker did not finish draining"))
    }, 5_000)
    worker.addEventListener("message", handleMessage)
    worker.postMessage({ type: "close" })
  })
}

/** @type {WeakMap<HTMLCanvasElement, string>} */
const canvasFonts = new WeakMap()

/** @param {HTMLCanvasElement} canvas */
function prepareCanvas(canvas) {
  const width = Math.floor(canvas.clientWidth)
  const height = Math.floor(canvas.clientHeight)
  const fontFamily = canvasFonts.get(canvas) || getComputedStyle(canvas).getPropertyValue("--ex-font-mono").trim() || "monospace"
  canvasFonts.set(canvas, fontFamily)
  if (!width || !height) return { context: null, width, height, fontFamily }
  const ratio = window.devicePixelRatio || 1
  canvas.width = width * ratio
  canvas.height = height * ratio
  const context = canvas.getContext("2d")
  context?.scale(ratio, ratio)
  return { context, width, height, fontFamily }
}

/** @param {CanvasRenderingContext2D} context @param {number[][]} points */
function drawPolyline(context, points) {
  if (!points.length) return
  context.beginPath()
  points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y))
  context.stroke()
}

/** @param {number|null|undefined} value */
function formatNumber(value, precision = 0, padding = 0) {
  if (!Number.isFinite(value)) return "---"
  const formatted = Number(value).toFixed(precision)
  return padding ? formatted.padStart(padding, "0") : formatted
}

/** @param {SerialPort} port */
function isGroundRadio(port) { return [0x0403, 0x10c4].includes(port.getInfo().usbVendorId || 0) }
/** @param {SerialPortInfo} info @param {unknown} saved */
function samePort(info, saved) {
  if (!saved || typeof saved !== "object") return false
  const vendorId = "usbVendorId" in saved ? saved.usbVendorId : undefined
  const productId = "usbProductId" in saved ? saved.usbProductId : undefined
  return (vendorId != null || productId != null) && info.usbVendorId === vendorId && info.usbProductId === productId
}
/** @param {number} value */
function formatBytes(value) { return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }

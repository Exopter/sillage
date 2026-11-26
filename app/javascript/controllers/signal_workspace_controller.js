import { drawSignalInstruments, instrumentStyle } from "signal_instruments"
import { Controller } from "@hotwired/stimulus"
import { AircraftConnectionTransport, setAircraftConnection, observeRecorderConnection } from "aircraft_connection"
import { clamp, signalLayoutPreset, parseSignalLayout } from "signal_layout"
import { ImuHealth } from "imu_health"
import { NATIVE_MOUNT, interpretImu, mountName, mountZero } from "imu_mount"
import { SignalTelemetry, groundStationHeartbeat, seatModeCommand } from "signal_telemetry"
import { directTelemetryPort, parkTelemetryLink, claimTelemetryLink, closeTelemetryLink } from "signal_transport"
import { resolveRadioIdentity } from "signal_radio_link"
import { SignalMap } from "signal_map"
import { registerUsbPageRelease } from "usb_page_lifecycle"

import { OUTBOX_STORE, META_STORE, openDatabase, putOutbox, writeOutbox, deleteOutbox, readOutbox, oldestOutbox, writeMetadata, readMetadata, transactionRequest } from "signal_outbox"
const BATCH_INTERVAL_MS = 2_000
const CHART_WINDOW_MS = 30_000
// Interrupted telemetry is a caution first; past this delay the link is lost, which is a fault.
const LINK_LOST_AFTER_MS = 10_000


/**
 * Stimulus accessors are installed at runtime.
 * @typedef {Object} StimulusBindings
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
 * @property {HTMLElement} radioStatusTarget
 * @property {HTMLElement} recorderStatusTarget
 * @property {HTMLElement} cloudStatusTarget
 * @property {HTMLElement} qualityAttitudeTarget
 * @property {HTMLElement} qualityHeadingTarget
 * @property {HTMLElement} attitudeDetailTarget
 * @property {HTMLElement} headingDetailTarget
 * @property {HTMLElement} preflightDetailTarget
 * @property {HTMLElement} preflightStatusTarget
 * @property {boolean} hasTriggerStatusTarget
 * @property {number} startBootValue
 * @property {string} triggerValue
 * @property {string} flightIdValue
 * @property {Record<string,string>} mountProfilesValue
 * @property {Record<string,number[]|null>} mountZerosValue
 * @property {HTMLElement} mountLabelTarget
 * @property {boolean} hasMountLabelTarget
 * @property {HTMLElement[]} sensorAxesTargets
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
 * @property {string} recorderDeviceIdValue
 * @property {number} recorderAssemblyIdValue
 * @property {string} sessionValue
 * @property {string} flightCodeValue
 * @property {string} batchUrlValue
 * @property {string} eventUrlValue
 * @property {HTMLDialogElement} exitDialogTarget
 * @property {HTMLElement} exitErrorTarget
 * @property {HTMLElement} exitStatusTarget
 * @property {HTMLInputElement} flightNameTarget
 * @property {HTMLButtonElement[]} exitActionTargets
 * @property {boolean} hasExitDialogTarget
 * @property {boolean} hasFlightNameTarget
 * @property {boolean} reviewValue
 * @property {string} homeUrlValue
 * @property {string} completeUrlValue
 * @property {HTMLElement} aircraftStatusTarget
 * @property {HTMLElement} standbyAircraftTarget
 * @property {HTMLFormElement} startFormTarget
 * @property {HTMLInputElement} startDeviceTarget
 * @property {HTMLInputElement} startTransportTarget
 * @property {HTMLInputElement} startGlideRatioTarget
 * @property {boolean} hasStartGlideRatioTarget
 * @property {boolean} hasMapSceneTarget
 * @property {boolean} hasHeadingTarget
 * @property {boolean} hasAltitudeTarget
 * @property {boolean} hasLatestEventTarget
 * @property {HTMLSelectElement} startFlightTarget
 * @property {HTMLButtonElement} startButtonTarget
 * @property {HTMLElement} startHintTarget
 * @property {HTMLButtonElement[]} modeButtonTargets
 * @property {HTMLElement} modeGroupTarget
 * @property {boolean} hasModeGroupTarget
 */
const LINK_TYPE_KEY = "signal-link-type"
const LINK_TYPES = ["ground-radio", "usb-c", "ble", "wifi"]
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
  acquisitionAuthorized = false
  /** @type {symbol|null} */ captureAuthorization = null
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
  /** @type {number|undefined} */ radioTimer = undefined
  /** @type {WritableStreamDefaultWriter<Uint8Array>|null} */ radioWriter = null
  /** @type {Promise<void>|null} */ radioWrite = null
  triggerBusy = false
  triggerAttemptAt = 0
  radioHeartbeatSequence = 0
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
  returnHomeAfterSync = false
  ending = false
  leaving = false
  exitDestination = ""
  /** @type {{form: HTMLFormElement, submitter: HTMLElement|null}|null} */ exitForm = null
  pageUrl = ""
  /** @type {unknown} */ pageHistoryState = null
  /** @type {"save"|"discard"|null} */ completionDisposition = null
  openingPort = false
  choosingPort = false
  layoutStorageKey = ""
  /** @type {Map<string, {width:number,height:number}>} */
  miniSizes = new Map()
  /** @type {Record<string,string>} */
  mountProfileOverrides = {}
  /** @type {Record<string, number[]|null>} */
  mountZeroOverrides = {}
  /** An open link set aside while a flight starts or ends, so it is never reconnected.
   * @type {import("signal_transport").TelemetryLink|null} */
  parkedLink = null
  /** @type {import("signal_radio_link").RadioIdentity|null} */ standbyIdentity = null
  identityKey = ""
  identityAt = 0
  identityLoading = false
  standbySignature = ""
  standbyAt = 0
  starting = false
  modeChanging = false
  modeNotice = ""

  /** Standby: the link is open and telemetry is shown, but no flight exists and nothing is stored. */
  get standby() { return !this.sessionValue }

  boundOnline = () => { this.flushOutbox() }
  boundOffline = () => { this.refreshCloudStatus() }
  boundBeforeUnload = (/** @type {BeforeUnloadEvent} */ event) => this.warnBeforeUnload(event)
  boundLinkClick = (/** @type {MouseEvent} */ event) => this.interceptLink(event)
  boundSubmit = (/** @type {SubmitEvent} */ event) => this.interceptSubmit(event)
  boundVisit = (/** @type {Event} */ event) => this.interceptVisit(event)
  boundPopState = (/** @type {PopStateEvent} */ event) => {
    if (this.leaving || (this.ended && !this.completionDisposition)) return
    const destination = window.location.href
    event.stopImmediatePropagation()
    history.pushState(this.pageHistoryState, "", this.pageUrl)
    this.requestExit(destination)
  }
  boundPageHide = () => { if (!this.ended) void this.releaseCapture().catch(() => {}) }
  boundVisibility = () => {
    if (document.visibilityState !== "hidden" || this.ended) return
    this.worker?.postMessage({ type: "flush" })
    void this.queuePendingBatch().catch(() => {})
  }
  boundResize = () => this.reflowLayout()
  /** @type {"ground-radio"|"usb-c"|"ble"|"wifi"} */
  connectionKind = "ground-radio"
  usbRecoveryUntil = 0
  nextUsbRecoveryAt = 0
  boundRadioToggle = (/** @type {Event} */ event) => {
    this.usbRecoveryUntil = 0
    const detail = /** @type {CustomEvent} */ (event).detail
    void this.connectStation(detail?.transport || "ground-radio", detail?.deviceId || "")
  }
  boundSerialConnect = async () => { await this.stopSerialPromise; this.autoReconnect() }
  boundSerialDisconnect = (/** @type {Event} */ event) => {
    if (event.target !== this.port) return
    this.showWarning("The telemetry connection was disconnected. Acquisition will resume after USB reconnection.")
    this.stopSerial()
  }

  get database() {
    if (!this.db) throw new Error("Local storage is not ready")
    return this.db
  }

  static targets = ["triggerStatus",
    "board", "widget", "mapCanvas", "instrumentCanvas", "chartCanvas",
    "mapScene", "mapCredits", "mapStatus", "mapFollow",
    "radioStatus", "recorderStatus", "cloudStatus", "warning",
    "heading", "airspeed", "altitude", "verticalSpeed", "glide", "dataStatus",
    "qualityAttitude", "qualityHeading", "attitudeDetail", "headingDetail", "preflightDetail", "preflightStatus",
    "exitDialog", "exitError", "exitStatus", "flightName", "exitAction",
    "parserStatus", "aircraftMarker", "aircraftLabel", "latestEvent", "sensorValue", "streamBadge", "mountLabel", "sensorAxes",
    "aircraftStatus", "standbyAircraft", "startForm", "startDevice", "startTransport", "startFlight", "startButton", "startHint", "modeButton", "modeGroup", "startGlideRatio"
  ]

  static values = {
    cesiumToken: String,
    cesiumBaseUrl: String,
    completed: Boolean,
    review: Boolean,
    session: String,
    recorderDeviceId: String,
    recorderAssemblyId: Number,
    mountProfiles: Object,
    mountZeros: Object,
    flightCode: String,
    trigger: String, startBoot: Number, flightId: String,
    batchUrl: String,
    eventUrl: String,
    homeUrl: String,
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
    this.returnHomeAfterSync = false
    this.leaving = false
    this.completionDisposition = null
    this.exitDestination = ""
    this.exitForm = null
    this.pageUrl = window.location.href
    this.pageHistoryState = history.state
    this.ending = false
    this.batchWrite = Promise.resolve()
    this.unregisterUsbPageRelease = registerUsbPageRelease(() => this.releaseCapture())
    // One layout for the station: it stays put from standby into a recording and back.
    // Signal Tunnel and Signal Sky hold different widgets, so each keeps its own layout.
    this.layoutStorageKey = `signal-layout:station:${this.element.getAttribute("data-signal-environment") || "sky"}`
    this.glideRatio = 0
    this.parkedLink = null
    this.standbyIdentity = null; this.identityKey = ""; this.identityAt = 0; this.identityLoading = false
    this.standbySignature = ""
    this.starting = false
    const linkType = readLinkType()
    if (linkType) this.connectionKind = linkType
    if (this.startBootValue && linkType === "usb-c") this.usbRecoveryUntil = Date.now() + 30000
    const review = this.reviewValue && new URL(this.pageUrl).searchParams.get("review") === "1"
    try {
      const database = await openDatabase()
      if (generation !== this.connectionGeneration) { database.close(); return }
      const [nextSequence, endedAt, recovery] = this.standby ? [0, null, null] : await Promise.all([
        readMetadata(database, `${this.sessionValue}:next-sequence`),
        readMetadata(database, `${this.sessionValue}:ended-at`),
        readMetadata(database, `${this.sessionValue}:recovery`)
      ])
      if (generation !== this.connectionGeneration) { database.close(); return }
      this.db = database
      this.nextSequence = Number(nextSequence) || 0
      this.ended = this.completedValue || Boolean(endedAt)
      if (recovery && typeof recovery === "object") {
        if ("disposition" in recovery && (recovery.disposition === "save" || recovery.disposition === "discard")) this.completionDisposition = recovery.disposition
      }
      if (!this.standby) await writeMetadata(database, `${this.sessionValue}:recovery`, {active: !this.ended, disposition: this.completionDisposition})
      if (generation !== this.connectionGeneration) { database.close(); return }
    } catch (caught) {
      if (generation !== this.connectionGeneration) return
      const error = caught instanceof Error ? caught : new Error(String(caught))
      this.renderRadioControl()
      this.showWarning(`Local storage unavailable: ${error.message}`)
      return
    }
    window.addEventListener("online", this.boundOnline)
    window.addEventListener("offline", this.boundOffline)
    window.addEventListener("resize", this.boundResize)
    window.addEventListener("sillage:ground-radio-toggle", this.boundRadioToggle)
    // Nothing is at stake in standby: leaving the page needs no confirmation.
    if (!this.standby) {
      window.addEventListener("beforeunload", this.boundBeforeUnload)
      document.addEventListener("click", this.boundLinkClick, true)
      document.addEventListener("submit", this.boundSubmit, true)
      document.addEventListener("turbo:before-visit", this.boundVisit)
      window.addEventListener("popstate", this.boundPopState, true)
    }
    document.addEventListener("visibilitychange", this.boundVisibility)
    window.addEventListener("pagehide", this.boundPageHide)
    navigator.serial?.addEventListener("connect", this.boundSerialConnect)
    navigator.serial?.addEventListener("disconnect", this.boundSerialDisconnect)
    this.restoreLayout()
    // Signal Tunnel has no map: nothing there depends on GPS.
    if (this.hasMapSceneTarget) {
      this.map3d = new SignalMap({ container: this.mapSceneTarget, credits: this.mapCreditsTarget,
        status: this.mapStatusTarget, followButton: this.mapFollowTarget,
        baseUrl: this.cesiumBaseUrlValue, token: this.cesiumTokenValue, label: this.flightCodeValue })
      this.map3d.start()
    }
    if (!this.standby) this.batchTimer = window.setInterval(() => {
      if (!this.ending) this.queuePendingBatch().then(() => this.flushOutbox()).catch((error) => this.showWarning(`Local storage failed: ${error.message}. Keep this page open and free disk space.`))
    }, BATCH_INTERVAL_MS)
    this.renderTimer = window.setInterval(() => {
      this.refreshTelemetry()
      if (this.usbRecoveryUntil && !this.port) void this.recoverUsb().catch(() => {})
    }, 100)
    this.refreshTelemetry()
    if (this.standby) {
      await this.resumeLink()
      return
    }
    await this.prepareLocalStorage()
    await this.flushOutbox()
    if (generation === this.connectionGeneration) {
      if (review) {
        const resumeUrl = new URL(this.pageUrl)
        resumeUrl.searchParams.delete("review")
        this.pageUrl = resumeUrl.href
        history.replaceState(this.pageHistoryState, "", this.pageUrl)
      }
      if (review || this.completionDisposition || (this.ended && !this.flightIdValue)) this.requestExit()
      else await this.resumeLink()
    }
  }

  disconnect() {
    this.map3d?.destroy()
    this.map3d = null
    this.connectionGeneration = null
    this.renderRadioMetrics(false, Date.now())
    this.unregisterUsbPageRelease?.()
    this.unregisterUsbPageRelease = null
    window.clearInterval(this.batchTimer)
    window.clearInterval(this.renderTimer)
    window.removeEventListener("online", this.boundOnline)
    window.removeEventListener("offline", this.boundOffline)
    window.removeEventListener("beforeunload", this.boundBeforeUnload)
    window.removeEventListener("resize", this.boundResize)
    window.removeEventListener("sillage:ground-radio-toggle", this.boundRadioToggle)
    window.clearTimeout(this.resizeTimer)
    document.removeEventListener("click", this.boundLinkClick, true)
    document.removeEventListener("submit", this.boundSubmit, true)
    document.removeEventListener("turbo:before-visit", this.boundVisit)
    document.removeEventListener("visibilitychange", this.boundVisibility)
    window.removeEventListener("pagehide", this.boundPageHide)
    window.removeEventListener("popstate", this.boundPopState, true)
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

  /** Carries on with the link the previous screen left open; opens the remembered radio otherwise.
   * @returns {Promise<void>} */
  async resumeLink() {
    const link = this.parkedLink || claimTelemetryLink()
    this.parkedLink = null
    if (!link) return this.autoReconnect()
    if (!this.connectionGeneration || this.port || this.openingPort || this.ending || this.ended) { await closeTelemetryLink(link); return }
    this.connectionKind = link.kind
    this.openingPort = true
    this.releasePortLock = link.release
    this.renderRadioControl()
    try {
      await this.openSerial(link.port, true)
    } catch (caught) {
      this.showWarning(`Telemetry connection failed: ${caught instanceof Error ? caught.message : String(caught)}`)
      await this.stopSerial()
    }
  }

  // A mode transition re-enumerates Seat. Reuse only a previously granted port
  // and verify its EXS1 identity before authentication or recording control.
  async recoverUsb() {
    const generation = this.connectionGeneration
    const now = Date.now()
    if (!navigator.serial || this.connectionKind !== "usb-c" || now >= this.usbRecoveryUntil ||
        now < this.nextUsbRecoveryAt || !generation || !this.db || this.port || this.openingPort ||
        this.choosingPort || this.stopSerialPromise || this.ending || this.ended) return
    this.nextUsbRecoveryAt = now + 2000
    const ports = (await navigator.serial.getPorts()).filter(p => [0x303a, 0x2886].includes(p.getInfo().usbVendorId || 0))
    if (ports.length !== 1 || generation !== this.connectionGeneration || this.connectionKind !== "usb-c" || !this.usbRecoveryUntil) return
    const port = await directTelemetryPort("usb-c", {deviceId: this.recorderDeviceIdValue, sessionUuid: this.sessionValue, nativePort: ports[0]})
    if (generation === this.connectionGeneration && this.connectionKind === "usb-c" && this.usbRecoveryUntil) await this.acquirePort(port)
  }

  /** @returns {Promise<void>} */
  async autoReconnect() {
    const generation = this.connectionGeneration
    if (this.parkedLink) return this.resumeLink()
    if (this.connectionKind === "usb-c") return this.recoverUsb()
    if (this.connectionKind !== "ground-radio" || !navigator.serial || this.ended || this.ending || (this.hasExitDialogTarget && this.exitDialogTarget.open && !(this.triggerValue && localStorage.getItem(this.stopTriggerKey()))) || !generation) return
    const ports = (await navigator.serial.getPorts()).filter(isGroundRadio)
    const lastPort = await readMetadata(this.database, "last-authorized-port")
    const port = ports.find((candidate) => samePort(candidate.getInfo(), lastPort)) || (ports.length === 1 ? ports[0] : null)
    if (port && generation === this.connectionGeneration) await this.acquirePort(port)
  }

  /** @param {"ground-radio"|"usb-c"|"ble"|"wifi"} [kind] @param {string} [deviceId] */
  async connectStation(kind = "ground-radio", deviceId = "") {
    const generation = this.connectionGeneration
    if (!generation || !this.db || this.ended || this.ending || this.openingPort || this.choosingPort || this.stopSerialPromise) return
    if (this.port) { await this.stopSerial(); return }
    if (kind === "ground-radio" && !navigator.serial) {
      this.showWarning("Web Serial is not available. Use Chrome or Edge on desktop over HTTPS.")
      return
    }
    this.connectionKind = kind
    this.choosingPort = true
    this.renderRadioControl()
    try {
      if (kind !== "ground-radio") {
        const port = await directTelemetryPort(kind, {deviceId, sessionUuid: this.sessionValue})
        if (generation === this.connectionGeneration) await this.acquirePort(port)
        else await port.close()
        return
      }
      const authorized = (await navigator.serial.getPorts()).filter(isGroundRadio)
      const port = authorized.length === 1 ? authorized[0] : await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0403 }, { usbVendorId: 0x10c4 }] })
      if (generation === this.connectionGeneration) await this.acquirePort(port)
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught))
      if (error.name !== "NotFoundError") this.showWarning(`Telemetry connection failed: ${error.message}`)
    } finally {
      this.choosingPort = false
      this.renderRadioControl()
    }
  }

  /** @param {SerialPort} port */
  async acquirePort(port) {
    const generation = this.connectionGeneration
    if (!generation || this.port || this.openingPort || this.ending || this.ended) return
    this.openingPort = true
    this.renderRadioControl()
    const lockName = `sillage-signal-${this.connectionKind}-port:${port.getInfo().usbVendorId || "serial"}:${port.getInfo().usbProductId || "port"}`
    navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
      if (generation !== this.connectionGeneration || this.ending || this.ended) {
        this.openingPort = false
        return
      }
      if (!lock) {
        this.openingPort = false
        this.showWarning("This telemetry connection is already being read by another browser tab.")
        return
      }
      /** @type {Promise<void>} */
      const released = new Promise((release) => { this.releasePortLock = release })
      try {
        await this.openSerial(port)
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error(String(caught))
        this.showWarning(`Telemetry connection failed: ${error.message}`)
        await this.stopSerial()
      }
      await released
    })
  }

  /** @param {SerialPort} port @param {boolean} [adopted] The port is already open: it was kept from the previous screen. */
  async openSerial(port, adopted = false) {
    if (!this.standby) await this.joinGateway()
    if (this.ended || this.ending) return
    const generation = this.connectionGeneration
    this.acquisitionAuthorized = false
    this.port = port
    if (!adopted) {
      this.portOpening = port.open({ baudRate: 57_600, bufferSize: 65_536 })
      try {
        await this.portOpening
      } finally {
        this.portOpening = null
      }
    }
    if (generation !== this.connectionGeneration || this.ending || this.ended) return
    if (this.connectionKind === "ground-radio" && !adopted) await writeMetadata(this.database, "last-authorized-port", port.getInfo())
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
    this.worker = new Worker("/signal_serial_worker.js?v=static-pressure-70")
    this.worker.onmessage = ({ data }) => this.handleWorkerMessage(data)
    this.worker.onerror = () => this.showWarning("Telemetry decoding stopped. Reconnect the link.")
    if (!this.standby) this.setStatus(this.recorderStatusTarget, "Checking the recorder", "idle")
    this.renderRadioControl()
    this.setStatus(this.radioStatusTarget, "Connected · waiting for telemetry", "idle")
    this.updateGroundRadioState("connected")
    await this.acquireWakeLock()
    if (generation !== this.connectionGeneration || this.port !== port || this.stopSerialPromise || this.ending || this.ended) return
    this.readSerial()
    this.radioTimer = window.setInterval(() => this.sendRadioHeartbeat(), 1_000)
    void this.sendRadioHeartbeat()
  }

  /** Declares this computer as the one recording the flight, and listens for a stop asked from a phone. */
  async joinGateway() {
    if (!this.recorderDeviceIdValue) throw new Error("This flight has no recorder. Start a new flight.")
    const tokenKey = `signal-gateway:${this.sessionValue}`
    let token = localStorage.getItem(tokenKey)
    if (!token) { token = crypto.randomUUID(); localStorage.setItem(tokenKey, token) }
    const gatewayUrl = `/api/v1/signal_sessions/${this.sessionValue}/gateway`
    const heartbeat = async () => {
      const response = await fetch(gatewayUrl, { method: "POST", headers: { "X-Signal-Gateway": localStorage.getItem(`signal-gateway:${this.sessionValue}`) || "", "Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || "" }, body: JSON.stringify({ token }) })
      if (!response.ok) throw new Error("Another device is recording this flight, or access was revoked.")
      const state = await response.json()
      if (state.stop_requested && !this.ending && !this.ended) {
        // Back to standby, link open, ready for the next start from the phone.
        this.exitDestination = this.homeUrlValue
        await this.finishSession("save")
      }
    }
    await heartbeat()
    if (this.ended || this.ending) return
    const timer = window.setInterval(() => { if (this.port && !this.ended) void heartbeat().catch(() => this.showWarning("Connection to Sillage interrupted. The phone remote cannot end this flight for now.")); else window.clearInterval(timer) }, 3000)
  }

  async sendRadioHeartbeat() {
    const writable = this.port?.writable
    if (!writable || this.radioWrite || this.ended || this.ending || this.stopSerialPromise) return
    this.radioWrite = (async () => {
      try {
        this.radioWriter = writable.getWriter()
        await this.radioWriter.write(groundStationHeartbeat(this.radioHeartbeatSequence++))
      } catch (_) { /* Reception remains usable when radio diagnostics cannot be requested. */ }
      finally { this.radioWriter?.releaseLock(); this.radioWriter = null }
    })()
    try { await this.radioWrite } finally { this.radioWrite = null }
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
        if (!this.ended) this.showWarning(`The telemetry connection was disconnected: ${error.message}`)
      } finally {
        this.reader.releaseLock()
        this.reader = null
      }
      break
    }
    if (!this.ended && this.port) await this.stopSerial()
  }

  /** @param {boolean} [park] */
  async releaseCapture(park = false) {
    await this.stopSerial(park)
    if (!this.standby) await this.queuePendingBatch()
  }

  /** @param {boolean} [park] Stop reading but keep the link open for the next screen. */
  async stopSerial(park = false) {
    if (this.stopSerialPromise) return this.stopSerialPromise

    this.stopSerialPromise = this.performStopSerial(park)
    this.renderRadioControl()
    try {
      await this.stopSerialPromise
    } finally {
      this.stopSerialPromise = null
      this.renderRadioControl()
    }
  }

  /** @param {boolean} park */
  async performStopSerial(park) {
    this.acquisitionAuthorized = false
    this.captureAuthorization = null
    window.clearInterval(this.radioTimer)
    this.radioTimer = undefined
    try { await this.radioWriter?.abort() } catch (_) { /* A disconnected port may reject abort. */ }
    await this.radioWrite
    try { await this.portOpening } catch (_) { /* A failed open still needs to release its lock. */ }
    try { await this.reader?.cancel() } catch (_) { /* Port may already be gone. */ }
    if (this.worker) {
      await closeWorkerCapture(this.worker)
      this.worker.terminate()
    }
    this.worker = null
    const previous = this.parkedLink
    this.parkedLink = null
    if (this.port && park) {
      this.parkedLink = {port: this.port, kind: this.connectionKind, release: this.releasePortLock}
    } else {
      if (this.port) {
        try { await this.port.close() } catch (_) { /* Port may already be closed. */ }
      }
      this.releasePortLock?.()
    }
    if (previous && !this.parkedLink) {
      if (park) this.parkedLink = previous
      else await closeTelemetryLink(previous)
    }
    this.port = null
    this.openingPort = false
    this.releasePortLock = null
    this.renderRadioControl()
    this.setStatus(this.radioStatusTarget, "Not connected", "idle")
    this.imuHealth = new ImuHealth()
    this.preflight = null; this.preflightInvalidated = false; this.qualityContextKey = ""; this.qualitySignature = ""; this.qualityContextAt = 0
    this.measurements = new SignalTelemetry()
    this.refreshTelemetry()
    this.updateGroundRadioState("disconnected")
  }

  /** @param {"connected"|"disconnected"} state */
  updateGroundRadioState(state) {
    setAircraftConnection(this.connectionKind, state === "connected")
  }

  /** @param {import("../types/signal").FrameMessage} message */
  async authorizeCapture(message) {
    if (this.captureAuthorization) return
    const token = this.captureAuthorization = Symbol("capture-authorization")
    const port = this.port
    try {
      const identity = await resolveRadioIdentity(this.recorderDeviceIdValue)
      if (this.captureAuthorization !== token || this.port !== port || !port || this.ended) return
      // An acquisition started on an assembly stays on it; one started without an assembly needs none.
      if (!identity.canAcquire || (this.recorderAssemblyIdValue && identity.assemblyId !== this.recorderAssemblyIdValue)) throw new Error("The recorder is no longer assigned to this acquisition's assembly.")
      this.acquisitionAuthorized = true
      this.worker?.postMessage({type: "init-capture", filename: `${this.flightCodeValue}-${this.sessionValue}.mavcap`})
      this.handleWorkerMessage(message)
    } catch (error) {
      if (this.captureAuthorization === token && this.port === port) {
        this.showWarning(error instanceof Error ? error.message : String(error))
        await this.stopSerial()
      }
    } finally { if (this.captureAuthorization === token) this.captureAuthorization = null }
  }

  /** @param {import("../types/signal").CaptureMessage} message */
  handleWorkerMessage(message) {
    if (this.standby && message.type !== "frame") return
    if (message.type === "capture-ready") {
      this.setStatus(this.recorderStatusTarget, "Recording locally", "nominal")
      return
    }
    if (message.type === "capture-closed") {
      this.setStatus(this.recorderStatusTarget, `Capture saved · ${formatBytes(message.bytes)}`, "nominal")
      return
    }
    if (message.type === "capture-error") {
      this.setStatus(this.recorderStatusTarget, "Local capture unavailable", "fault")
      this.showWarning(`Raw capture unavailable: ${message.message}`)
      return
    }
    if (message.type !== "frame") return
    if (!this.standby && message.decoded.name === "imu_quality" && message.decoded.deviceId !== this.recorderDeviceIdValue &&
        (this.mavlinkSystemId == null || (String(message.systemId) === this.mavlinkSystemId && String(message.componentId) === this.mavlinkComponentId))) {
      this.showWarning("The connected recorder is not the one this flight started with. End this flight and start a new one.")
      void this.stopSerial()
      return
    }
    if (!this.standby && !this.acquisitionAuthorized) {
      if (message.decoded.name === "imu_quality" && message.decoded.deviceId === this.recorderDeviceIdValue) void this.authorizeCapture(message)
      return
    }
    if (message.decoded.name === "heartbeat" && message.decoded.type === 6) return

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
    if (decoded.name === "imu_quality") observeRecorderConnection(this.connectionKind, decoded, now)
    if (this.imuHealth.generation !== generation) this.measurements = new SignalTelemetry()
    this.measurements.apply(interpretImu(decoded, this.activeMountProfile, this.activeMountZero), now)
    this.telemetry = this.measurements.snapshot(now)
    if (this.standby) return
    const recordedAt = new Date(Number(BigInt(frame.receivedAtUs) / 1000n)).toISOString()
    if (decoded.name === "unknown") return
    if (decoded.name === "radio") {
      this.pendingSamples.push({kind: "sensor", sensor_type: "RADIO", recorded_at: recordedAt,
        readings: {...decoded, airTelemetryAgeMs: this.lastFrameAt ? Math.max(0, now - this.lastFrameAt) : null}})
    } else if (decoded.name === "gps" && this.telemetry.gps) {
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
      if (decoded.name === "live_instruments" && decoded.attitude)
        this.pendingSamples.push(this.sensorSample(recordedAt, "ATTITUDE", decoded.attitude))
    }
  }

  refreshTelemetry() {
    this.renderRadioControl()
    const now = Date.now()
    this.telemetry = this.measurements.snapshot(now)
    this.frameTimes = this.frameTimes.filter((time) => now - time < 1_000)
    const live = Boolean(this.port && this.lastFrameAt && now - this.lastFrameAt < 1_500)
    const lost = this.linkLost(live, now)
    const state = this.ended ? "Ended" : live ? "Live" : lost ? "Lost" : this.lastFrameAt ? "Stale" : "Waiting"
    this.streamBadgeTargets.forEach((badge) => {
      const widget = badge.closest("[data-widget]")?.getAttribute("data-widget")
      const available = widget === "map" ? this.telemetry.gps != null
        : widget === "instruments" || widget === "airflow" ? this.telemetry.roll != null && this.telemetry.pitch != null : true
      const label = live && !available ? (widget === "map" && this.telemetry.fix != null ? "No fix" : "No data") : state
      badge.textContent = label
      badge.dataset.state = live && !available ? "waiting" : state.toLowerCase()
    })
    if (this.port) {
      this.setStatus(this.radioStatusTarget, live
        ? `Live · ${this.mavlinkSystemId}/${this.mavlinkComponentId} · ${this.frameTimes.length} frames/s`
        : lost ? "No telemetry · link lost" : this.lastFrameAt ? "Telemetry stale" : "Connected · waiting for telemetry",
      live ? "nominal" : lost ? "fault" : this.lastFrameAt ? "caution" : "idle")
    }
    if (this.standby) this.renderStandby(live, now)
    if (this.hasTriggerStatusTarget) this.renderTrigger(live, now)
    this.renderModules()
    // The wing in the airflow follows the recorder IMU; a stale attitude is sent as missing.
    window.dispatchEvent(new CustomEvent("sillage:signal-telemetry", {detail: {
      roll: live ? this.telemetry.roll : null, pitch: live ? this.telemetry.pitch : null,
      heading: live ? this.telemetry.heading : null,
      pressure: live ? this.telemetry.pressure : null
    }}))
    this.renderRadioMetrics(live, now)
    this.dataStatusTarget.textContent = this.ended ? "Flight ended locally" : live ? "Receiving telemetry" : this.lastFrameAt ? "Telemetry stale" : "Waiting for telemetry"
    this.pushHistory(live, now)
    this.renderValues()
    this.drawAll()
  }

  renderModules() {
    const now = Date.now()
    const live = Boolean(this.port && this.lastFrameAt && now - this.lastFrameAt < 1_500)
    window.dispatchEvent(new CustomEvent("sillage:module-status", {detail: {
      modules: this.telemetry.modules, connected: Boolean(this.port && !this.ended), ended: this.ended, lost: this.linkLost(live, now)
    }}))
  }

  /** Telemetry that was flowing and has been silent long enough: the link is lost.
   * @param {boolean} live @param {number} now */
  linkLost(live, now) {
    return Boolean(this.port && !this.ended && !live && this.lastFrameAt && now - this.lastFrameAt >= LINK_LOST_AFTER_MS)
  }

  /** One status line: its text and the state that colours it.
   * @param {HTMLElement} target @param {string} text @param {"nominal" | "caution" | "fault" | "idle"} state */
  setStatus(target, text, state) {
    target.textContent = text
    target.dataset.state = state
  }

  renderRadioControl() {
    const connected = Boolean(this.port && !this.openingPort)
    const busy = Boolean(this.choosingPort || this.openingPort || this.stopSerialPromise)
    const available = Boolean(this.db && this.connectionGeneration && !this.ended && !this.ending)
    const live = Boolean(connected && this.lastFrameAt && Date.now() - this.lastFrameAt < 1_500)
    const label = this.ended ? "Flight ended" : this.stopSerialPromise ? "Disconnecting" : busy ? "Connecting" : connected ? "Connected" : "Connect"
    const description = connected
      ? `Disconnect ${this.connectionKind}. ${live ? "Receiving telemetry." : "No telemetry received."}`
      : this.ended ? "Flight ended" : "Connect the link"
    window.dispatchEvent(new CustomEvent("sillage:ground-radio-state", {detail: {connected, busy, available, label, description}}))
  }

  /** @param {boolean} live @param {number} now */
  renderRadioMetrics(live, now) {
    // SiK can repeat RF statistics after Air telemetry is lost.
    const report = this.connectionKind === "ground-radio" && live && this.port && !this.ended ? this.telemetry.radio : null
    const state = this.ended ? "Ended" : !this.port ? "Offline" : this.connectionKind !== "ground-radio" ? "No SiK radio" : !live ? "No telemetry" : "Unavailable"
    // Telemetry that was flowing and stopped is stale first, then a lost link.
    const interrupted = state === "No telemetry" && Boolean(this.lastFrameAt)
    const lost = interrupted && this.linkLost(live, now)
    window.dispatchEvent(new CustomEvent("sillage:radio-quality", {detail: {report, state, stale: interrupted && !lost, lost, now}}))
  }

  /** @param {string} recordedAt @param {string} sensorType @param {import("../types/signal").DecodedMessage} readings @returns {import("../types/signal").SignalSample} */
  sensorSample(recordedAt, sensorType, readings) {
    const source = this.imuHealth.quality?.deviceId
    return { kind: "sensor", sensor_type: sensorType, recorded_at: recordedAt,
      readings: source ? {...readings, mount_profile: this.activeMountProfile, ...(this.activeMountZero ? {mount_zero: this.activeMountZero} : {}), device_id: source} : readings }
  }

  get activeMountZero() {
    const id = this.imuHealth.quality?.deviceId
    return id ? mountZero(id in this.mountZeroOverrides ? this.mountZeroOverrides[id] : this.mountZerosValue?.[id]) : null
  }

  get activeMountProfile() {
    const id = this.imuHealth.quality?.deviceId
    return id ? this.mountProfileOverrides[id] || this.mountProfilesValue?.[id] || NATIVE_MOUNT : NATIVE_MOUNT
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
    if (this.hasMountLabelTarget) this.mountLabelTarget.textContent = this.imuHealth.quality
      ? `${mountName(this.activeMountProfile)}${this.activeMountZero ? " · wing zero" : ""} · MAG`
      : "Waiting for recorder mounting"
    for (const target of this.sensorAxesTargets || []) target.textContent = this.telemetry.bodyFrame ? "F/R/D" : "X/Y/Z"
    this.airspeedTarget.textContent = formatNumber(this.telemetry.airspeed, 1)
    if (this.hasHeadingTarget) this.headingTarget.textContent = formatNumber(this.telemetry.heading, 0, 3)
    if (this.hasAltitudeTarget) {
      this.altitudeTarget.textContent = formatNumber(this.telemetry.altitude, 0)
      this.verticalSpeedTarget.textContent = formatNumber(this.telemetry.verticalSpeed, 1)
      this.glideTarget.textContent = formatNumber(this.telemetry.glide, 1)
    }
    if (this.hasMapSceneTarget) this.aircraftLabelTarget.textContent = this.telemetry.gps
      ? `${this.telemetry.gps[1].toFixed(5)}, ${this.telemetry.gps[0].toFixed(5)}` : "No current GPS position"
    const vector = (/** @type {number[]|null} */ values) => values ? values.map((value) => formatNumber(value, 2)).join(" / ") : "---"
    const fix = this.telemetry.fix
    /** @type {Record<string, string>} */
    const values = {
      gLoad: formatNumber(this.telemetry.gLoad, 2),
      accel: vector(this.telemetry.accel), gyro: vector(this.telemetry.gyro), mag: vector(this.telemetry.mag),
      pressure: formatNumber(this.telemetry.pressure, 2), temperature: formatNumber(this.telemetry.temperature, 1),
      staticPressure: formatNumber(this.telemetry.staticPressure == null ? null : this.telemetry.staticPressure / 100, 2),
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
        device_id: this.recorderDeviceIdValue,
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
    const key = q ? `${q.deviceId}/${q.bootId}/${q.imuEpoch}/${q.firmware}` : ""
    if (q && !this.qualityContextLoading && (key !== this.qualityContextKey || now - this.qualityContextAt > 30000)) void this.loadQualityContext(key)
    const check = this.preflight
    const sameBoot = q && check && check.boot_id === q.bootId && check.imu_epoch === q.imuEpoch && check.firmware === q.firmware
    if (check && (!sameBoot || status.issues.length > 0)) this.preflightInvalidated = true
    const warnings = status.warnings || []
    const hasWarning = warnings.length > 0 || (check?.summary?.warnings?.length || 0) > 0
    this.preflightStatusTarget.textContent = !check ? "Not checked" : check.invalidated_at || this.preflightInvalidated || !sameBoot ? "Recheck required" : check.outcome === "passed" ? hasWarning ? "Passed with warning" : "Passed for this boot" : "Check failed"
    this.preflightStatusTarget.dataset.state = !check ? "unknown" : check.invalidated_at || this.preflightInvalidated || !sameBoot || check.outcome !== "passed" ? "degraded" : hasWarning ? "warning" : "consistent"
    let preflightDetail
    if (!check) {
      preflightDetail = !this.flightIdValue ? "A preflight check belongs to a flight. Start one, or open a prepared flight."
        : this.qualityContextLoading ? "Loading the flight preflight check."
        : "No preflight check is available for this flight and recorder. Select the status to run a check."
    } else if (check.invalidated_at || this.preflightInvalidated || !sameBoot) {
      preflightDetail = !q || status.issues.includes("quality_unavailable") ? "Live IMU quality is unavailable. Reconnect the recorder and run a new preflight check."
        : !sameBoot ? "The recorder boot, IMU epoch or firmware no longer matches the saved check. Run a new preflight check."
        : status.issues.length ? `Recheck required: ${status.reason}.`
        : "A previous live check invalidated this preflight. Run a new preflight check."
    } else if (check.outcome !== "passed") {
      preflightDetail = "The latest preflight check failed. Review its results and run a new check."
    } else {
      const advisories = [...new Set([...warnings, ...(check.summary?.warnings || [])])]
      preflightDetail = "The check passed for the current recorder boot, IMU epoch and firmware."
      if (advisories.length) preflightDetail += ` Warning: ${advisories.join(" · ")}.`
    }
    const details = /** @type {Array<[HTMLElement, string]>} */ ([
      [this.attitudeDetailTarget, `Roll and pitch consistency.\n${status.attitudeReason}`],
      [this.headingDetailTarget, `Magnetic heading confidence.\n${status.headingReason}`],
      [this.preflightDetailTarget, preflightDetail]
    ])
    for (const [target, detail] of details) {
      if (target.textContent !== detail) target.textContent = detail
    }
    const signature = `${key}:${status.issues.join(",")}:${warnings.join(",")}:${this.preflightInvalidated}`
    if (signature !== this.qualitySignature && q && this.db && !this.standby && !this.ended && !this.ending) {
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
      if (result?.mount_profile && (result.mount_profile !== this.activeMountProfile || JSON.stringify(mountZero(result.mount_zero)) !== JSON.stringify(this.activeMountZero))) {
        this.mountProfileOverrides[current.deviceId] = result.mount_profile
        this.mountZeroOverrides[current.deviceId] = mountZero(result.mount_zero)
        this.measurements = new SignalTelemetry()
      }
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
    if (this.hasLatestEventTarget) {
      this.latestEventTarget.hidden = false
      this.latestEventTarget.textContent = label
    }
    await this.flushOutbox()
  }

  /** The tunnel glide ratio set on the airflow widget: stamped on the next flight, and
   * marked in the recording when it changes during one.
   * @param {CustomEvent<{ratio: number}>} event
   */
  async setGlideRatio(event) {
    const ratio = event.detail.ratio, changed = this.glideRatio !== 0 && ratio !== this.glideRatio
    this.glideRatio = ratio
    if (this.hasStartGlideRatioTarget) this.startGlideRatioTarget.value = ratio.toFixed(2)
    if (!changed || this.standby || this.ending || this.ended || !this.db) return
    const eventUuid = crypto.randomUUID()
    await writeOutbox(this.database, { id: `${this.sessionValue}:event:${eventUuid}`, session: this.sessionValue, kind: "event", url: this.eventUrlValue, method: "POST",
      body: { event_uuid: eventUuid, event_type: "note", occurred_at: new Date().toISOString(), label: `Tunnel glide ratio ${ratio.toFixed(2)}`, metadata: { source: "tunnel_glide_ratio", glide_ratio: ratio } }, queuedAt: Date.now() })
    await this.flushOutbox()
  }

  endSession() { this.requestExit() }

  /** @param {string} [destination] */
  requestExit(destination = this.homeUrlValue) {
    if (this.leaving) return
    this.exitDestination = destination
    this.exitForm = null
    if (this.ended && this.flightIdValue && !this.completionDisposition) {
      this.returnHomeAfterSync = true
      void this.flushOutbox()
      return
    }
    this.exitErrorTarget.hidden = true
    this.exitStatusTarget.hidden = !this.completionDisposition
    this.exitStatusTarget.textContent = this.completionDisposition ? "Finalizing the previous decision. Synchronization will resume automatically." : ""
    if (!this.exitDialogTarget.open) this.exitDialogTarget.showModal()
    if (this.completionDisposition) {
      this.returnHomeAfterSync = true
      this.setExitBusy(true)
      void this.flushOutbox()
    }
  }

  /** @param {Event} [event] */
  continueSession(event) {
    event?.preventDefault()
    if (this.ending || this.completionDisposition) return
    this.exitDialogTarget.close()
    this.exitDestination = ""
    this.exitForm = null
    void this.autoReconnect()
  }

  saveSession() { return this.finishSession("save") }
  discardSession() { return this.finishSession("discard") }

  /** @param {MouseEvent} event */
  interceptLink(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || this.leaving) return
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return
    const destination = new URL(link.href, window.location.href)
    if (!/^https?:$/.test(destination.protocol) || (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash)) return
    if (this.ended && !this.completionDisposition) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.requestExit(destination.href)
  }

  /** @param {Event} event */
  interceptVisit(event) {
    if (this.leaving || (this.ended && !this.completionDisposition)) return
    const visit = /** @type {CustomEvent<{url: string}>} */ (event)
    event.preventDefault()
    this.requestExit(visit.detail.url)
  }

  /** @param {SubmitEvent} event */
  interceptSubmit(event) {
    if (event.defaultPrevented || this.leaving || (this.ended && !this.completionDisposition)) return
    const form = event.target
    if (!(form instanceof HTMLFormElement) || form.method === "dialog" || (form.target && form.target !== "_self")) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.requestExit()
    this.exitForm = {form, submitter: event.submitter}
  }

  /** @param {boolean} busy */
  setExitBusy(busy) {
    if (!this.hasExitDialogTarget) return
    for (const button of this.exitActionTargets) button.disabled = busy
  }

  /** @param {"save"|"discard"} disposition */
  async finishSession(disposition) {
    if (this.ending || this.completionDisposition) return
    this.ending = true
    this.setExitBusy(true)
    if (this.hasExitDialogTarget) {
      this.exitStatusTarget.hidden = false
      this.exitStatusTarget.textContent = disposition === "save" ? "Saving the flight…" : "Discarding the recording…"
    }
    try {
      if (this.triggerValue && !this.ended) {
        localStorage.setItem(this.stopTriggerKey(), disposition)
        const q = this.imuHealth.quality
        if (!q?.trigger || Date.now() - this.imuHealth.qualityAt > 3000) throw new Error("Stop pending. Reconnect the SEAT to confirm file closure.")
        if (!this.observedGroundAfterFlight()) await this.sendFlightCommand("stop")
      }
      // The link stays open: standby takes it over once the flight is saved.
      await this.releaseCapture(true)
      const id = `${this.sessionValue}:complete`
      const endedAt = new Date().toISOString()
      const body = { ended_at: endedAt, disposition, flight_name: this.hasFlightNameTarget ? this.flightNameTarget.value.trim() : undefined }
      await transactionRequest(this.database, [OUTBOX_STORE, META_STORE], "readwrite", (_store, transaction) => {
        transaction.objectStore(META_STORE).put({ key: `${this.sessionValue}:ended-at`, value: endedAt })
        transaction.objectStore(META_STORE).put({ key: `${this.sessionValue}:recovery`, value: {active: false, disposition} })
        return putOutbox(transaction.objectStore(OUTBOX_STORE), { id, session: this.sessionValue, kind: "complete", url: this.completeUrlValue, method: "PATCH", body, queuedAt: Date.now() })
      })
      this.ended = true
      if (this.triggerValue) localStorage.removeItem(this.stopTriggerKey())
      this.completionDisposition = disposition
      this.returnHomeAfterSync = true
      this.renderRadioControl()
      await this.flushOutbox()
      this.dataStatusTarget.textContent = "Flight ended locally"
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught))
      if (this.hasExitDialogTarget) {
        this.exitErrorTarget.hidden = false
        this.exitErrorTarget.textContent = `The flight could not be finalized: ${error.message}. Retry without closing this page.`
        this.setExitBusy(false)
      } else this.showWarning(`The flight could not be saved: ${error.message}`)
    } finally {
      this.ending = false
    }
  }

  async leaveAfterSync() {
    if (this.leaving) return
    this.leaving = true
    try {
      if (this.completionDisposition === "discard" && navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory()
        try { await root.removeEntry(`${this.flightCodeValue}-${this.sessionValue}.mavcap`) }
        catch (error) { if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error }
      }
      await writeMetadata(this.database, `${this.sessionValue}:recovery`, {active: false})
      this.returnHomeAfterSync = false
      this.completionDisposition = null
      const destination = this.exitDestination || (this.flightIdValue ? `/flights/${this.flightIdValue}` : this.homeUrlValue)
      const link = this.parkedLink
      if (this.exitForm) this.exitForm.form.requestSubmit(this.exitForm.submitter || undefined)
      else if (link && window.Turbo && new URL(destination, window.location.href).href === new URL(this.homeUrlValue, window.location.href).href) {
        // Back to standby without a reload: the open link is handed to the next screen.
        this.parkedLink = null
        parkTelemetryLink(link)
        window.Turbo.visit(destination)
      } else window.location.assign(destination)
    } catch (error) {
      this.leaving = false
      this.showWarning(`Flight saved; local cleanup failed: ${error instanceof Error ? error.message : String(error)}. Keep this page open to retry.`)
    }
  }

  async flushOutbox() {
    if (this.standby) return
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
          headers: { "X-Signal-Gateway": localStorage.getItem(`signal-gateway:${this.sessionValue}`) || "", "Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || "" },
          body: JSON.stringify(record.body)
        })
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          if (body?.code === "recorder_assignment_required") {
            this.showWarning(body.error || "Recorder assignment is required.")
            await this.releaseCapture()
          }
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
    if (this.standby) return
    const oldest = this.db ? await oldestOutbox(this.db, this.sessionValue) : null
    if (this.hasExitDialogTarget && this.exitDialogTarget.open && this.completionDisposition) {
      this.exitStatusTarget.textContent = !navigator.onLine ? "Saved locally. Waiting for an Internet connection to finalize." : this.cloudError ? `Synchronization blocked: ${this.cloudError}. Retrying automatically.` : "Finalizing the flight…"
    }
    const age = oldest ? Math.max(1, Math.round((Date.now() - oldest.queuedAt) / 1000)) : 0
    if (!navigator.onLine) {
      this.setStatus(this.cloudStatusTarget, oldest ? `${age} s behind` : "Offline", "caution")
    } else if (!this.syncing && oldest && this.cloudError) {
      this.setStatus(this.cloudStatusTarget, `Sync blocked: ${this.cloudError}`, "fault")
    } else if (this.syncing || oldest) {
      this.setStatus(this.cloudStatusTarget, oldest ? `Syncing · ${age} s behind` : "Syncing", "idle")
    } else {
      this.setStatus(this.cloudStatusTarget, this.ended ? "Synced" : "Live", "nominal")
      this.cloudError = null
      if (this.ended && this.returnHomeAfterSync) {
        await this.leaveAfterSync()
      }
    }
  }

  /** Standby status: what the link hears, and why Start flight is or is not available.
   * @param {boolean} live @param {number} now */
  renderStandby(live, now) {
    const deviceId = this.imuHealth.quality?.deviceId || ""
    if (live && deviceId && !this.identityLoading && (deviceId !== this.identityKey || now - this.identityAt > 30_000)) void this.loadStandbyIdentity(deviceId)
    const identity = this.standbyIdentity?.deviceId === deviceId ? this.standbyIdentity : null
    const name = identity?.aircraftLabel || identity?.recorderLabel || deviceId
    const connected = Boolean(this.port && !this.openingPort)
    // The recording checks the same identity before it stores anything: do not start a flight it would refuse.
    const ready = !this.triggerBusy && live && identity?.canAcquire === true && !this.starting
    const [aircraft, hint] = this.starting ? [name || "Starting", "Starting the flight."]
      : !connected ? ["Waiting for the link", this.connectionKind === "ground-radio" && !navigator.serial
        ? "The radio needs Chrome or Edge on desktop." : "Not connected to the recorder. Connect with the link button in the top bar to enable Start flight."]
      : !this.lastFrameAt ? ["Listening", "Link open, no telemetry yet. Power the recorder and check that both radios share the same settings."]
      : !live ? [this.linkLost(live, now) ? "Link lost" : "Telemetry stale", "No recent telemetry. Check the aircraft and the link."]
      : !deviceId ? ["Identifying", "Telemetry received. Waiting for the recorder identity."]
      : !identity ? [name, "Aircraft heard. Checking the recorder with Sillage."]
      : !identity.canAcquire ? [name, "This recorder cannot be recorded. Check its assembly in Hangar."]
      : [name, "Ready. What you see is live and not saved: Start flight records from that moment."]
    this.setStatus(this.aircraftStatusTarget, aircraft, this.starting || !connected || !this.lastFrameAt ? "idle"
      : !live ? (this.linkLost(live, now) ? "fault" : "caution")
      : !deviceId || !identity ? "idle" : identity.canAcquire ? "nominal" : "caution")
    this.standbyAircraftTarget.textContent = live && deviceId ? name : "No aircraft heard"
    this.startHintTarget.textContent = this.modeNotice || hint
    this.startButtonTarget.disabled = !ready
    // Only an initialized module holds the key that makes a mode change acceptable.
    const modeAvailable = live && !this.imuHealth.quality?.trigger?.groundFirst && identity?.modeControl === true && !this.starting
    for (const button of this.modeButtonTargets) { button.hidden = !modeAvailable; button.disabled = this.modeChanging }
    if (this.hasModeGroupTarget) this.modeGroupTarget.hidden = !modeAvailable
    const detail = {connected, live, ready, deviceId, label: name, identified: Boolean(identity),
      registered: identity?.registered === true, assemblyId: identity?.assemblyId ?? null}
    const signature = JSON.stringify(detail)
    // Repeated every second: listeners load lazily and must not miss the state.
    if (signature === this.standbySignature && now - this.standbyAt < 1_000) return
    this.standbySignature = signature
    this.standbyAt = now
    window.dispatchEvent(new CustomEvent("sillage:signal-standby", {detail}))
  }

  /** @param {string} deviceId */
  async loadStandbyIdentity(deviceId) {
    this.identityLoading = true
    this.identityKey = deviceId
    try {
      const identity = await resolveRadioIdentity(deviceId)
      if (this.identityKey === deviceId) this.standbyIdentity = identity
    } catch { if (this.identityKey === deviceId) this.standbyIdentity = null }
    finally { this.identityAt = Date.now(); this.identityLoading = false }
  }

  stopTriggerKey() { return `signal:stop-seat:${this.sessionValue}` }

  canSendTrigger() {
    return Boolean(this.port && (this.connectionKind === "usb-c" || this.port.writable ||
      (this.imuHealth.quality?.trigger?.groundFirst && ["ble", "wifi"].includes(this.connectionKind))))
  }

  /** @param {Event} event */
  async chooseTrigger(event) {
    const mode = event.currentTarget instanceof HTMLElement && event.currentTarget.dataset.triggerMode
    if (!this.standby || this.triggerBusy || !(mode === "signal" || mode === "power")) return
    try { await this.sendFlightCommand(mode) }
    catch (error) { this.showWarning(error instanceof Error ? error.message : String(error)) }
  }

  /** @param {boolean} live @param {number} now */
  renderTrigger(live, now) {
    const q = this.imuHealth.quality
    const state = live && now - this.imuHealth.qualityAt < 3000 ? q?.trigger : undefined
    const capable = Boolean(state && this.canSendTrigger())
    const selector = this.element.querySelector("[data-trigger-selector]")
    if (selector instanceof HTMLElement) selector.style.display = q?.trigger?.groundFirst ? "none" : ""
    for (const button of this.element.querySelectorAll("button[data-trigger-mode]")) {
      if (!(button instanceof HTMLButtonElement)) continue
      const selected = state && state.signal === (button.dataset.triggerMode === "signal")
      button.setAttribute("aria-pressed", String(Boolean(selected)))
      button.disabled = !capable || !this.standbyIdentity?.modeControl || this.triggerBusy || Boolean(state?.flight)
    }
    const label = this.element.querySelector("[data-flight-trigger-status]")
    if (label) {
      let text = ""
      if (this.triggerBusy) text = "Waiting for SEAT confirmation…"
      else if (state?.flight && state.index) {
        const prefix = state.flight <= 99999999 ? "FL" : ""
        const file = `${prefix}${state.flight}-${state.index.toString(36).toUpperCase().padStart(4,"0")}.BIN`
        text = `SEAT recording · Flight ${state.flight} · ${file}`
      } else if (this.startBootValue && !this.ended && !this.standby) text = "Waiting for SEAT recording confirmation over radio or USB-C"
      else if (this.triggerValue && !this.ended) text = "Waiting for SEAT recording"
      else if (state) text = state.signal ? "SEAT waits for Start flight" : "SEAT records at power-on"
      else if (this.standby) text = "FDR trigger unavailable"
      if (label.textContent !== text) label.textContent = text
    }
    if (this.triggerValue && !this.standby) {
      const confirmed = Boolean(state && state.flight === Number(this.flightIdValue) && state.index && !this.ended)
      const header = this.element.querySelector(".signal-command-bar")
      if (header instanceof HTMLElement) header.dataset.signalState = confirmed ? "recording" : "pending"
      this.element.querySelector("[data-flight-session-label]")?.classList.toggle("signal-recording-label", confirmed)
    }
    if (!state || !this.triggerValue || this.ended || this.ending || this.standby || !this.acquisitionAuthorized ||
        !capable || this.triggerBusy || now - this.triggerAttemptAt < 5000) return
    if (this.observedGroundAfterFlight()) {
      this.triggerAttemptAt = now
      void this.finishSession(localStorage.getItem(this.stopTriggerKey()) === "discard" ? "discard" : "save")
      return
    }
    const stop = localStorage.getItem(this.stopTriggerKey())
    if (stop === "save" || stop === "discard") {
      this.triggerAttemptAt = now
      void this.finishSession(stop)
    } else if (!state.flight) {
      this.triggerAttemptAt = now
      void this.sendFlightCommand("start").catch(error => this.showWarning(String(error)))
    }
  }

  observedGroundAfterFlight() {
    const q = this.imuHealth.quality
    return Boolean(this.startBootValue && q?.trigger?.groundFirst && !q.trigger.flight &&
      q.deviceId === this.recorderDeviceIdValue && q.bootId !== this.startBootValue &&
      Date.now() - this.imuHealth.qualityAt < 3000)
  }

  /** @param {"power"|"signal"|"start"|"stop"} operation */
  async sendFlightCommand(operation) {
    const q = this.imuHealth.quality, state = q?.trigger, port = this.port
    if (this.triggerBusy || !q || !state || !port) throw new Error("Wait for current SEAT telemetry.")
    this.triggerBusy = true
    try {
      const response = await fetch("/api/v1/fdr-flight-commands", {method: "POST", credentials: "same-origin",
        headers: {"Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name=csrf-token]")?.getAttribute("content") || ""},
        signal: AbortSignal.timeout(8000), body: JSON.stringify({operation, transport: this.connectionKind, device_id: q.deviceId, boot_id: q.bootId, revision: state.revision, session_uuid: this.sessionValue})})
      if (!response.ok) throw new Error(`Sillage could not authorize the SEAT command (${response.status}).`)
      const result = await response.json()
      if (!/^[0-9a-f]{90}$/.test(result.payload)) throw new Error("Invalid SEAT command.")
      // Wi-Fi delivers the signed start in the next live telemetry response.
      // renderTrigger confirms recording from the flight ID and durable SD index.
      if (this.connectionKind === "wifi") return
      if (state.groundFirst && this.connectionKind === "usb-c") this.usbRecoveryUntil = Date.now() + 30000
      const bytes = Uint8Array.from(String(result.payload).match(/../g) || [], b => parseInt(b, 16))
      for (let attempt = 0; attempt < 4; ++attempt) {
        if (this.port !== port || this.imuHealth.quality?.bootId !== q.bootId) break
        if (this.connectionKind === "usb-c" || this.connectionKind === "ble") {
          const link = /** @type {import("../lib/signal_transport").PollingTelemetryPort} */ (/** @type {unknown} */ (port))
          if (!link.connection?.command) break
          await link.connection.command(bytes)
        } else {
          await this.radioWrite
          if (!port.writable) break
          const writer = port.writable.getWriter()
          this.radioWrite = writer.write(seatModeCommand(this.radioHeartbeatSequence++, bytes, 42004, 103)).finally(() => writer.releaseLock())
          try { await this.radioWrite } finally { this.radioWrite = null }
        }
        await new Promise(resolve => setTimeout(resolve, 1200))
        const observed = this.imuHealth.quality
        if (state.groundFirst && operation === "start") return
        if (operation === "stop" && this.observedGroundAfterFlight()) return
        if (observed?.bootId !== q.bootId || observed.deviceId !== q.deviceId) break
        const ack = observed.trigger
        if (!ack || ack.revision === state.revision) continue
        if (operation === "start" ? ack.flight === Number(this.flightIdValue) && ack.index > 0 :
          operation === "stop" ? !ack.flight : !ack.flight && ack.signal === (operation === "signal")) return
      }
      throw new Error("The SEAT has not confirmed the command. Check its link and microSD.")
    } finally { this.triggerBusy = false }
  }

  /** Asks the Seat to restart into a ground session (Wi-Fi and BLE, no recording) or back into flight mode.
   * @param {Event} event */
  async changeMode(event) {
    const button = event.currentTarget
    if (!(button instanceof HTMLButtonElement) || this.modeChanging || !this.standby) return
    const ground = button.dataset.mode === "ground"
    if (ground && !window.confirm("Restart the Seat into ground mode? It stops recording, leaves the module group and connects to Wi-Fi to synchronize with Sillage. It returns to flight mode on request, or by itself after 3 minutes without a connection.")) return
    const generation = this.connectionGeneration
    const current = () => generation === this.connectionGeneration
    this.modeChanging = true
    this.modeNotice = ""
    try {
      const bootId = await this.sendMode(ground ? "ground" : "flight")
      this.modeNotice = `${ground ? "Ground" : "Flight"} mode requested. Waiting for the Seat to restart…`
      // The restart shows as a new boot on the link; without it the request did not take effect.
      const deadline = Date.now() + 25_000
      while (current() && Date.now() < deadline && (this.imuHealth.quality?.bootId ?? bootId) === bootId) await new Promise(resolve => window.setTimeout(resolve, 500))
      if (!current()) return
      this.modeNotice = (this.imuHealth.quality?.bootId ?? bootId) === bootId
        ? "The Seat did not restart. It may be out of range, on firmware without this command, or not initialized with its Sillage key."
        : `The Seat restarted${ground ? " into ground mode" : ""}.`
    } catch (error) {
      this.modeNotice = error instanceof Error ? error.message : String(error)
    } finally {
      this.modeChanging = false
      window.setTimeout(() => { if (current()) this.modeNotice = "" }, 12_000)
    }
  }

  /** Sillage signs the request for the module's current boot; the link only carries it.
   * @param {"ground"|"flight"} mode @returns {Promise<number>} */
  async sendMode(mode) {
    const deviceId = this.imuHealth.quality?.deviceId, bootId = this.imuHealth.quality?.bootId
    if (!this.port?.writable || !deviceId || !bootId) throw new Error("Wait for the aircraft telemetry on the radio before changing its mode.")
    const response = await fetch("/api/v1/fdr-mode-commands", {method: "POST", credentials: "same-origin", cache: "no-store",
      signal: AbortSignal.timeout(10000), headers: {"Content-Type": "application/json", Accept: "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || ""},
      body: JSON.stringify({device_id: deviceId, boot_id: bootId, mode})})
    const result = await response.json().catch(() => ({}))
    if (!response.ok || typeof result.payload !== "string" || !/^[0-9a-f]{74}$/.test(result.payload)) throw new Error(result.error || "Sillage could not sign the mode change.")
    const payload = Uint8Array.from(result.payload.match(/../g) || [], byte => Number.parseInt(byte, 16))
    await this.radioWrite
    const writable = this.port?.writable
    if (!writable) throw new Error("The link closed before the mode change was sent.")
    // The link is lossy and the command is idempotent for one boot: send it three times.
    this.radioWrite = (async () => {
      const writer = this.radioWriter = writable.getWriter()
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          await writer.write(seatModeCommand(this.radioHeartbeatSequence++, payload))
          await new Promise(resolve => window.setTimeout(resolve, 150))
        }
      } finally { writer.releaseLock(); this.radioWriter = null }
    })()
    try { await this.radioWrite } finally { this.radioWrite = null }
    return bootId
  }

  /** Hangar changed what it knows about the heard recorder. */
  refreshIdentity() { this.identityKey = "" }

  /** Starts recording: by the button, or for a flight a phone remote asked for.
   * The link is kept open and handed to the recording screen.
   * @param {Event} [event] */
  async startFlight(event) {
    const deviceId = this.imuHealth.quality?.deviceId
    const live = Boolean(this.port && this.lastFrameAt && Date.now() - this.lastFrameAt < 1_500)
    if (!this.standby || this.starting || this.triggerBusy || !deviceId || !live || this.standbyIdentity?.deviceId !== deviceId || !this.standbyIdentity.canAcquire) return
    const requested = event instanceof CustomEvent ? Number(event.detail?.flightId) || 0 : 0
    if (requested) {
      if (!Array.from(this.startFlightTarget.options).some(option => option.value === String(requested))) this.startFlightTarget.add(new Option(event instanceof CustomEvent && event.detail?.code || "Remote flight", String(requested)))
      this.startFlightTarget.value = String(requested)
    }
    this.starting = true
    const q = this.imuHealth.quality
    const boot = this.startFormTarget.elements?.namedItem("start_boot_id")
    if (boot && boot instanceof HTMLInputElement) boot.value = q?.trigger?.groundFirst ? String(q.bootId) : ""
    const trigger = this.startFormTarget.elements?.namedItem("flight_trigger")
    if (trigger && trigger instanceof HTMLInputElement) {
      if (q?.trigger && (!this.canSendTrigger() || q.trigger.flight || Date.now() - this.imuHealth.qualityAt > 3000)) {
        this.showWarning("Wait for current telemetry from the idle SEAT before starting a flight.")
        this.starting = false
        return
      }
      trigger.value = q?.trigger ? (q.trigger.signal ? "signal" : "power") : ""
    }
    this.startDeviceTarget.value = deviceId
    this.startTransportTarget.value = this.connectionKind
    const generation = this.connectionGeneration
    await this.stopSerial(true)
    if (generation !== this.connectionGeneration) return
    if (this.parkedLink) { parkTelemetryLink(this.parkedLink); this.parkedLink = null }
    this.startFormTarget.requestSubmit()
    // The server did not answer: take the link back and stay in standby.
    window.setTimeout(() => {
      if (generation !== this.connectionGeneration) return
      this.starting = false
      void this.resumeLink()
    }, 10_000)
  }

  async acquireWakeLock() {
    if (!navigator.wakeLock?.request) return
    try { this.wakeLock = await navigator.wakeLock.request("screen") } catch (_) { /* Non-fatal. */ }
  }

  /** @param {BeforeUnloadEvent} event */
  warnBeforeUnload(event) {
    if (this.leaving || (this.ended && !this.completionDisposition)) return
    event.preventDefault()
    event.returnValue = ""
  }

  /** @param {string} message */
  showWarning(message) {
    this.warningTarget.hidden = false
    this.warningTarget.textContent = message
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
        // The widget marked large leads: the map in Signal Sky, the wing in the airflow in Signal Tunnel.
        this.applyPreset(this.widgetTargets.find((widget) => widget.dataset.mode === "large")?.dataset.widget || "map")
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
    if (!this.hasMapSceneTarget) return
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
/** @returns {"ground-radio"|"usb-c"|"ble"|"wifi"|null} */
function readLinkType() {
  try {
    const stored = localStorage.getItem(LINK_TYPE_KEY)
    return stored && LINK_TYPES.includes(stored) ? /** @type {"ground-radio"|"usb-c"|"ble"|"wifi"} */ (stored) : null
  } catch (_) { return null }
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

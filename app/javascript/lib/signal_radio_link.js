import { SignalTelemetry, groundStationHeartbeat } from "signal_telemetry"

/** @typedef {{deviceId: string, recorderLabel: string, aircraftLabel: string|null, registered: boolean, assemblyId: number|null, canAcquire: boolean}} RadioIdentity */

/** Resolve the received full ECU identity through Sillage's current installation chain.
 * @param {string} deviceId @returns {Promise<RadioIdentity>} */
export async function resolveRadioIdentity(deviceId) {
  const response = await fetch(`/api/v1/fdr-registration?device_id=${encodeURIComponent(deviceId)}`, {
    credentials: "same-origin", cache: "no-store", headers: {Accept: "application/json"}, signal: AbortSignal.timeout(5000)
  })
  if (!response.ok) throw new Error("Aircraft identity is unavailable")
  const payload = await response.json()
  if (payload?.registered === false) return {deviceId, recorderLabel: deviceId, aircraftLabel: null, registered: false, assemblyId: null, canAcquire: true}
  if (payload?.registered !== true || payload.recorder?.device_id !== deviceId)
    throw new Error("Recorder identity does not match the radio")
  const recorderLabel = payload.recorder.assembly?.serial_number || payload.recorder.name || deviceId
  const aircraftLabel = payload.aircraft?.display_name ?? null
  if (typeof recorderLabel !== "string" || !recorderLabel.trim() ||
      (payload.aircraft != null && (typeof aircraftLabel !== "string" || !aircraftLabel.trim())))
    throw new Error("Invalid aircraft identity")
  return {deviceId, recorderLabel, aircraftLabel, registered: true, assemblyId: Number.isInteger(payload.recorder.assembly_id) ? payload.recorder.assembly_id : null, canAcquire: payload.recorder.acquisition_allowed === true}
}

/** A USB connection or SiK report alone is not evidence of an aircraft. */
export class SignalRadioReadiness {
  measurements = new SignalTelemetry()
  /** @type {string|null} */ source = null
  /** @type {number|null} */ lastWingAt = null
  /** @type {number|null} */ lastSequence = null
  deviceId = ""
  /** @type {number|null} */ bootId = null

  /** @param {import("../types/signal").FrameMessage} frame @param {number} now */
  receive(frame, now) {
    const d = frame.decoded
    if (d.name === "unknown" || d.name === "radio" || d.name === "ping") return
    const source = `${frame.systemId}/${frame.componentId}`
    const isRecorder = d.name === "imu_quality" || (d.name === "heartbeat" &&
      d.customMode === 0x46445200 && d.type === 18 && d.autopilot === 8 && (d.baseMode & 1) !== 0)
    if (!this.source && isRecorder) this.source = source
    if (this.source !== source || (d.name === "heartbeat" && !isRecorder)) return
    if (frame.sequence === this.lastSequence) return
    this.lastSequence = frame.sequence
    if (d.name === "imu_quality") {
      if (this.bootId !== d.bootId || this.deviceId !== d.deviceId) this.measurements = new SignalTelemetry()
      this.bootId = d.bootId; this.deviceId = d.deviceId
    }
    this.lastWingAt = now
    this.measurements.apply(d, now)
  }

  /** @param {number} now @param {boolean} connected @param {RadioIdentity|null} [identity] */
  snapshot(now, connected, identity = null) {
    if (!connected) return {state: "offline", label: "No aircraft connected", detail: "Connect the ground radio to check the aircraft."}
    if (this.lastWingAt == null) return {state: "waiting", label: "Waiting for aircraft", detail: "Ground radio connected · No aircraft telemetry"}
    const resolved = identity?.deviceId === this.deviceId ? identity : null
    const name = resolved?.aircraftLabel || resolved?.recorderLabel || this.deviceId
    if (now < this.lastWingAt || now - this.lastWingAt >= 1500)
      return {state: "stale", label: name ? `${name} · Link lost` : "Aircraft link lost", detail: "No recent aircraft telemetry · Check the radio link"}
    const issues = this.measurements.moduleSnapshot(now).filter(module => module.role <= 3 && ["degraded", "stale"].includes(module.state))
    if (issues.length) return {state: "degraded", label: name ? `${name} · Needs attention` : "Recorder needs attention", detail: issues.map(module => `${module.name}: ${module.state === "stale" ? "link lost" : `${module.sensors} · ${module.storage}`}`).join("; ")}
    const detail = !this.deviceId ? "Radio ready · Waiting for recorder identity" : !resolved ? "Radio ready · Identifying aircraft…"
      : !resolved.registered ? "Radio ready · Recorder not registered" : !resolved.assemblyId ? "Radio ready · No assembly assigned" : !resolved.aircraftLabel ? "Radio ready · No aircraft assigned" : "Radio ready"
    return {state: "connected", label: name ? `${name} connected` : "Identifying aircraft…", detail}
  }
}

/** Read-only preview: no session, local capture, import or remote command. */
export class SignalRadioLink {
  readiness = new SignalRadioReadiness()
  /** @type {SerialPort|null} */ port = null
  /** @type {Worker|null} */ worker = null
  /** @type {ReadableStreamDefaultReader<Uint8Array>|null} */ reader = null
  /** @type {WritableStreamDefaultWriter<Uint8Array>|null} */ writer = null
  /** @type {Promise<void>|null} */ reading = null
  /** @type {Promise<void>|null} */ writing = null
  /** @type {Promise<void>|null} */ opening = null
  /** @type {Promise<void>|null} */ closing = null
  /** @type {Promise<void>|null} */ locking = null
  /** @type {(() => void)|null} */ releaseLock = null
  /** @type {number|undefined} */ heartbeatTimer = undefined
  connected = false
  busy = false
  error = ""
  generation = 0
  sequence = 0

  /** @param {() => void} changed */
  constructor(changed) { this.changed = changed }

  /** @param {boolean} [request] */
  async connect(request = false) {
    if (this.busy || this.port || this.closing || this.locking) return
    if (!navigator.serial) { this.error = "Use desktop Chrome or Edge to connect the radio."; this.changed(); return }
    const generation = ++this.generation
    this.busy = true; this.error = ""; this.changed()
    try {
      const ports = (await navigator.serial.getPorts()).filter(isGroundRadio)
      if (generation !== this.generation) return
      const port = ports.length === 1 ? ports[0] : request ? await navigator.serial.requestPort({filters: [{usbVendorId: 0x0403}, {usbVendorId: 0x10c4}]}) : null
      if (!port || generation !== this.generation) return
      const info = port.getInfo()
      // Share the acquisition lock: another tab's active capture is never interrupted.
      const name = `sillage-signal-ground-radio-port:${info.usbVendorId || "serial"}:${info.usbProductId || "port"}`
      const attempt = navigator.locks.request(name, {ifAvailable: true}, async lock => {
        if (generation !== this.generation) return
        if (!lock) { this.error = "Radio in use in another tab"; this.busy = false; this.changed(); return }
        const held = new Promise(resolve => { this.releaseLock = () => resolve(undefined) })
        try {
          this.port = port
          this.opening = port.open({baudRate: 57600, bufferSize: 65536})
          await this.opening
          if (generation !== this.generation) return
          this.readiness = new SignalRadioReadiness()
          this.worker = new Worker("/signal_serial_worker.js?v=module-status-42002")
          this.worker.onmessage = (/** @type {MessageEvent<import("../types/signal").CaptureMessage>} */ {data}) => {
            if (generation === this.generation && data.type === "frame") { this.readiness.receive(data, Date.now()); this.changed() }
          }
          this.worker.onerror = () => { this.error = "Radio decoding stopped. Reconnect the radio."; void this.close() }
          this.connected = true; this.busy = false; this.changed()
          this.reading = this.read(port)
          this.heartbeatTimer = window.setInterval(() => void this.heartbeat(), 1000)
          void this.heartbeat()
        } catch (error) {
          this.error = error instanceof Error ? error.message : String(error)
          void this.close()
        } finally { this.opening = null }
        await held
      })
      this.locking = attempt
      void attempt.catch(error => { this.error = String(error); this.busy = false; this.changed() }).finally(() => {
        if (this.locking === attempt) this.locking = null
      })
    } catch (error) {
      if (!(error instanceof Error && error.name === "NotFoundError")) this.error = error instanceof Error ? error.message : String(error)
    } finally {
      if (generation === this.generation && !this.port) { this.busy = false; this.changed() }
    }
  }

  /** @param {SerialPort} port */
  async read(port) {
    try {
      if (!port.readable) throw new Error("Radio input is unavailable")
      const reader = this.reader = port.readable.getReader()
      try {
        while (this.connected) {
          const {value, done} = await reader.read()
          if (done) break
          if (!value?.length) continue
          const bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
          this.worker?.postMessage({type: "bytes", bytes, receivedAtUs: String(Date.now() * 1000)}, [bytes])
        }
      } finally { reader.releaseLock(); this.reader = null }
    } catch (error) {
      if (this.connected) this.error = error instanceof Error ? error.message : String(error)
    } finally { if (this.connected) void this.close() }
  }

  async heartbeat() {
    if (!this.connected || !this.port?.writable || this.writing) return
    const writable = this.port.writable
    this.writing = (async () => {
      try {
        this.writer = writable.getWriter()
        await this.writer.write(groundStationHeartbeat(this.sequence++))
      } catch { /* SiK diagnostics are optional; received wing telemetry remains authoritative. */ }
      finally { this.writer?.releaseLock(); this.writer = null }
    })()
    try { await this.writing } finally { this.writing = null }
  }

  close() {
    if (this.closing) return this.closing
    this.generation++; this.connected = false; this.busy = true; this.changed()
    this.closing = this.release().finally(() => { this.closing = null; this.busy = false; this.changed() })
    return this.closing
  }

  async release() {
    window.clearInterval(this.heartbeatTimer)
    try { await this.writer?.abort() } catch { /* A removed radio can reject cleanup. */ }
    await this.writing
    try { await this.opening } catch { /* Failed opens must also release the page lock. */ }
    try { await this.reader?.cancel() } catch { /* A removed radio can reject cancellation. */ }
    await this.reading
    this.reading = null
    this.worker?.terminate(); this.worker = null
    try { await this.port?.close() } catch { /* The browser may already have closed it. */ }
    this.port = null
    this.releaseLock?.(); this.releaseLock = null
    await this.locking
    this.readiness = new SignalRadioReadiness()
  }
}

/** @param {SerialPort} port */
function isGroundRadio(port) { return [0x0403, 0x10c4].includes(port.getInfo().usbVendorId || 0) }

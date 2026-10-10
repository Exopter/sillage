import { Controller } from "@hotwired/stimulus"
import { ImuHealth, SixFaceCapture, ReferenceCapture, imuQualityLabel, FACE_NAMES, FACE_HOLD_RULES, referenceIssue } from "imu_health"
import { registerUsbPageRelease } from "usb_page_lifecycle"
import { recorderTechnicalLabel } from "recorder_identity"
/** @typedef {{deviceValue:string, kindValue:string, flightValue:string, sceneTarget:HTMLElement, sceneLabelTarget:HTMLElement, sceneHintTarget:HTMLElement, visualTarget:HTMLElement, stepLabelTarget:HTMLElement, holdTarget:HTMLElement, holdRingTarget:SVGCircleElement, countdownTarget:HTMLElement, confirmationTarget:HTMLElement, titleTarget:HTMLElement, instructionTarget:HTMLElement, qualityReasonTarget:HTMLElement, attitudeTarget:HTMLElement, headingTarget:HTMLElement, connectButtonTarget:HTMLButtonElement, actionButtonTarget:HTMLButtonElement, cancelButtonTarget:HTMLButtonElement, confirmedTarget:HTMLInputElement, progressTarget:HTMLProgressElement, resultTarget:HTMLElement}} Bindings */
const Base = /** @type {new (c:import('@hotwired/stimulus').Context) => Controller & Bindings} */ (/** @type {unknown} */ (Controller))
export default class extends Base {
  static targets = ["scene", "sceneLabel", "sceneHint", "visual", "stepLabel", "hold", "holdRing", "countdown", "confirmation", "title", "instruction", "qualityReason", "attitude", "heading", "connectButton", "actionButton", "cancelButton", "confirmed", "progress", "result"]
  static values = { device: String, kind: String, flight: String }
  health = new ImuHealth()
  faces = new SixFaceCapture()
  /** @type {import('../lib/imu_health').ReferenceSample[]} */ samples = []
  /** @type {SerialPort|null} */ port = null
  /** @type {ReadableStreamDefaultReader<Uint8Array>|null} */ reader = null
  /** @type {Worker|null} */ worker = null
  /** @type {import('../lib/imu_tutorial').ImuTutorial|null} */ scene = null
  /** @type {number|undefined} */ timer = undefined
  /** @type {(() => void)|null} */ unregister = null
  /** @type {(() => void)|null} */ unlock = null
  /** @type {Promise<void>|null} */ reading = null
  /** @type {string|null} */ source = null
  connectedDeviceId = ""
  generation = 0
  phase = "ready"
  active = false
  opening = false
  rotation = [0, 0, 0]
  lastRotationTime = -1
  faceIndex = 0
  faceCompletedUntil = 0
  checkPassed = false
  /** @type {number|null} */ referenceField = null
  referenceReady = false
  referenceKey = ""
  uuid = ""
  capture = new ReferenceCapture(0)
  connect() {
    this.active = true
    this.tick()
    this.unregister = registerUsbPageRelease(() => this.stop())
    this.timer = window.setInterval(() => this.tick(), 100)
    import("imu_tutorial").then(({ ImuTutorial }) => {
      if (this.active) this.scene = new ImuTutorial(this.sceneTarget)
    }).catch(() => { this.sceneLabelTarget.textContent = "3D preview unavailable. Follow the written instructions and sensor axis labels." })
  }
  disconnect() { this.active = false; clearInterval(this.timer); this.unregister?.(); this.scene?.dispose(); void this.stop() }
  async connectRadio() {
    if (this.port) { await this.stop(); return }
    if (this.opening) return
    if (!navigator.serial) { this.resultTarget.textContent = "Use Chrome or Edge on a computer with Web Serial."; return }
    this.opening = true
    try {
      const vendors = [0x0403, 0x10c4, 0x1a86]
      const known = (await navigator.serial.getPorts()).filter(port => vendors.includes(port.getInfo().usbVendorId || 0))
      const port = known.length === 1 ? known[0] : await navigator.serial.requestPort({ filters: vendors.map(usbVendorId => ({ usbVendorId })) })
      if (!this.active) return
      let acquired = false
      if (navigator.locks) {
        await new Promise((resolve, reject) => {
          navigator.locks.request(`sillage-signal-port:${port.getInfo().usbVendorId || "serial"}:${port.getInfo().usbProductId || "port"}`, { ifAvailable: true }, async lock => {
            if (!lock) { reject(new Error("Ground radio is in use. Disconnect it in Signal first.")); return }
            acquired = true
            await new Promise(done => { this.unlock = () => done(undefined); resolve(undefined) })
          }).catch(reject)
        })
      }
      try { await port.open({ baudRate: 57600 }) } catch (error) { if (acquired) this.unlock?.(); throw error }
      if (!this.active) { await port.close(); this.unlock?.(); return }
      this.resetRecorder()
      this.port = port
      this.resultTarget.textContent = ""
      const worker = new Worker("/signal_serial_worker.js?v=57-full-identity")
      this.worker = worker
      worker.onmessage = ({ data }) => {
        if (!this.active || this.port !== port || this.worker !== worker) return
        const message = /** @type {import('../types/signal').FrameMessage} */ (data)
        this.receiveFrame(message)
      }
      this.connectButtonTarget.textContent = "Disconnect ground radio"
      this.reading = this.read()
    } catch (error) {
      this.resultTarget.textContent = error instanceof DOMException && error.name === "NotFoundError"
        ? "No radio selected. Choose Ground to continue."
        : error instanceof Error ? error.message : String(error)
    }
    finally { this.opening = false }
  }
  /** @param {import('../types/signal').FrameMessage} message */
  receiveFrame(message) {
    if (!this.active || !this.port || message.type !== "frame") return
    const key = `${message.systemId}/${message.componentId}`, decoded = message.decoded
    if (decoded.name === "imu_quality") {
      if (decoded.deviceId !== this.deviceValue) {
        if (!this.source || key === this.source) {
          this.resetRecorder()
          this.connectedDeviceId = decoded.deviceId
          this.resultTarget.textContent = `Wrong recorder: ${decoded.deviceId}. Expected ${this.deviceValue}.`
          this.tick()
        }
        return
      }
      if (this.connectedDeviceId && this.connectedDeviceId !== decoded.deviceId) this.resultTarget.textContent = ""
      if (this.source && this.source !== key) this.resetRecorder()
      this.source = key
      this.connectedDeviceId = decoded.deviceId
    }
    if (this.source !== key) return
    this.health.apply(decoded, Date.now())
    // Invalidate evidence before another action can run, not only on the UI timer.
    if (this.health.generation !== this.generation) {
      this.generation = this.health.generation; this.cancel(); this.confirmedTarget.checked = false
      this.resultTarget.textContent = "Recorder or IMU restarted. Begin a new check."
    }
    if (decoded.name === "imu_quality" && this.kindValue === "preflight") void this.loadReference(decoded)
  }
  resetRecorder() {
    this.health = new ImuHealth(); this.source = null; this.connectedDeviceId = ""; this.generation = 0
    this.referenceKey = ""; this.referenceReady = false; this.referenceField = null
    this.confirmedTarget.checked = false; this.cancel()
  }
  /** @param {number} now */
  connectionIssue(now) {
    const label = recorderTechnicalLabel({deviceId:this.deviceValue})
    if (!this.port) return `Connect the ground radio to verify ${label}.`
    const deviceId = this.connectedDeviceId || this.health.quality?.deviceId
    if (deviceId && deviceId !== this.deviceValue) return `Wrong recorder: ${deviceId}. Expected ${this.deviceValue}.`
    if (!this.source || this.health.quality?.deviceId !== this.deviceValue) return `Waiting for recorder identity: ${label}.`
    if (this.health.generation !== this.generation) return "Recorder or IMU restarted. Begin a new check."
    if (!this.health.sample(now)) return `Waiting for fresh IMU measurements from ${label}.`
    return null
  }
  async read() {
    const port = this.port
    if (!port?.readable) { void this.stop(); return }
    this.reader = port.readable.getReader()
    try {
      while (this.port) {
        const { value, done } = await this.reader.read()
        if (done) break
        if (value) this.worker?.postMessage({ type: "bytes", bytes: value.buffer, receivedAtUs: String(Date.now() * 1000) }, [value.buffer])
      }
    } catch (error) { if (this.active) this.resultTarget.textContent = `Radio disconnected: ${String(error)}` }
    finally {
      this.reader?.releaseLock(); this.reader = null
      if (this.port === port) void this.stop()
    }
  }
  async stop() {
    const port = this.port; this.port = null
    this.worker?.terminate(); this.worker = null
    this.resetRecorder()
    if (this.active) this.tick()
    await this.reader?.cancel().catch(() => {})
    await this.reading; this.reading = null
    await port?.close().catch(() => {})
    this.unlock?.(); this.unlock = null
    if (this.active) this.connectButtonTarget.textContent = "Connect ground radio"
  }
  /** @param {Extract<import('../types/signal').DecodedMessage, {name:'imu_quality'}>} q */
  async loadReference(q) {
    const key = `${q.deviceId}/${q.firmware}/${q.bootId}/${q.imuEpoch}`
    if (this.referenceKey === key) return
    this.referenceKey = key; this.referenceReady = false
    try {
      const response = await fetch(`/api/v1/imu-checks?device_id=${encodeURIComponent(q.deviceId)}&firmware=${encodeURIComponent(q.firmware)}&flight_id=${encodeURIComponent(this.flightValue)}`)
      const result = await response.json()
      if (!this.active || this.referenceKey !== key) return
      this.referenceReady = response.ok && Boolean(result.reference)
      this.referenceField = result?.reference?.summary?.magnetic_mean_ut ?? null
      this.resultTarget.textContent = this.referenceReady ? "Matching calibration reference found in Forge." : result.error || "Complete the calibration reference in Forge for this firmware and configuration first."
    } catch { this.referenceKey = ""; this.resultTarget.textContent = "Calibration reference unavailable. Reconnect to Sillage before checking." }
  }
  cancel() {
    this.phase = "ready"; this.samples = []; this.faces = new SixFaceCapture(); this.rotation = [0,0,0]; this.lastRotationTime = -1
    this.capture = new ReferenceCapture(0); this.actionButtonTarget.disabled = true
    this.faceIndex = 0; this.faceCompletedUntil = 0; this.checkPassed = false
    this.uuid = ""; this.progressTarget.value = 0; this.actionButtonTarget.textContent = "Start"
    this.titleTarget.textContent = this.kindValue === "calibration" ? "IMU calibration" : "IMU preflight check"
    this.instructionTarget.textContent = this.kindValue === "calibration" ? "Orient each marked sensor axis upward in sequence. Hold each orientation for 3 seconds within the displayed tolerance." : "Place the enclosure on a level reference and keep it still for 15 seconds."
    this.scene?.resetTargets(); this.scene?.setMode("z+")
  }
  advance() {
    const issue = this.connectionIssue(Date.now())
    if (issue) { this.actionButtonTarget.disabled = true; this.resultTarget.textContent = issue; return }
    if (this.kindValue === "preflight" && !this.referenceReady) return
    if (!this.confirmedTarget.checked) { this.resultTarget.textContent = "Confirm the ground reference first."; return }
    if (this.phase === "rotate") {
      if (this.rotation.some(v => v < 0.5)) return
      this.phase = "level"; this.actionButtonTarget.textContent = "Measure reference"
      this.titleTarget.textContent = "Return to the level reference"
      this.instructionTarget.textContent = "Slow rotations complete. Place the enclosure level in both directions, then keep it still."
      this.scene?.setMode("z+"); return
    }
    if (["level", "reference_blocked"].includes(this.phase) || (this.phase === "result" && !this.checkPassed) || (this.phase === "ready" && this.kindValue === "preflight")) {
      this.capture = new ReferenceCapture(Date.now())
      this.phase = "measuring"; this.samples = []; this.uuid = crypto.randomUUID(); return
    }
    if (this.phase === "ready") {
      this.resultTarget.textContent = ""
      this.scene?.resetTargets()
      this.phase = "faces"
    } else if (this.phase === "result") this.cancel()
    else if (this.phase === "save_failed") void this.save()
  }
  tick() {
    const now = Date.now(), status = this.health.status(now, this.referenceField)
    for (const [el, value] of [[this.attitudeTarget, status.attitude], [this.headingTarget, status.heading]]) {
      const node = /** @type {HTMLElement} */ (el); node.textContent = String(value); node.dataset.state = String(value)
    }
    const q = this.health.quality
    const qualityDetails = q && now - this.health.qualityAt <= 1500
      ? q.accuracy.map((v, n) => imuQualityLabel(v, n)).join(" · ")
      : status.reason
    if (this.health.generation !== this.generation) {
      this.generation = this.health.generation; this.cancel(); this.confirmedTarget.checked = false; this.resultTarget.textContent = "Recorder or IMU restarted. Begin a new check."
    }
    const issue = this.connectionIssue(now)
    this.qualityReasonTarget.textContent = issue || `${recorderTechnicalLabel({deviceId:this.deviceValue})} · ${qualityDetails}` + (q && (status.issues.length || status.warnings?.length) ? ` · ${status.reason}` : "")
    const s = issue ? null : this.health.sample(now)
    this.actionButtonTarget.disabled = !s || !this.confirmedTarget.checked || (this.kindValue === "preflight" && !this.referenceReady) || ["faces", "measuring", "saving"].includes(this.phase)
    if (this.phase === "faces") {
      const face = FACE_NAMES[this.faceIndex]
      if (!this.faceCompletedUntil) {
        this.faces.add(s, face)
        if (this.faces.completed[face]) this.faceCompletedUntil = now + 900
      } else if (now >= this.faceCompletedUntil) {
        this.faceCompletedUntil = 0; this.faceIndex++; this.faces.add(null)
      }
      this.progressTarget.value = Object.keys(this.faces.completed).length / 6 * 100
      if (this.faceIndex === FACE_NAMES.length) {
        this.phase = "rotate"
        this.titleTarget.textContent = "Trace slow figure eights"
        this.instructionTarget.textContent = "Move the enclosure in a figure eight while rotating about X, Y and Z. Keep it clear of magnetic objects. Progress is based on measured rotation about each axis."
        this.actionButtonTarget.textContent = "Rotations complete"
      }
    } else if (this.phase === "rotate") {
      if (s) {
        const dt = (s.t - this.lastRotationTime) / 1000
        if (dt > 0 && dt <= 0.3) s.gyro.forEach((v, i) => { this.rotation[i] += Math.abs(v) * dt })
        this.lastRotationTime = s.t
      }
      this.actionButtonTarget.disabled = !s || !this.confirmedTarget.checked || this.rotation.some(v => v < 0.5)
      this.progressTarget.value = this.rotation.reduce((sum, v) => sum + Math.min(1, v / 0.5), 0) / 3 * 100
    } else if (this.phase === "measuring") {
      const issue = s ? referenceIssue(s) : "Waiting for fresh sensor and quality reports"
      this.titleTarget.textContent = "Measuring the static reference"
      this.instructionTarget.textContent = issue ? `Recording the diagnostic. ${issue}` : "Keep still. Measuring acceleration, rotation, level and magnetic stability."
      this.capture.add(s, now)
      this.samples = this.capture.samples
      const elapsed = this.capture.elapsed
      this.progressTarget.value = Math.min(100, elapsed / 150)
      this.resultTarget.textContent = `${(elapsed / 1000).toFixed(1)} / 15.0 s` + (s ? ` · ${s.roll.toFixed(2)}° roll · ${s.pitch.toFixed(2)}° pitch · ${(Math.hypot(...s.accel) / 9.80665).toFixed(3)} g` : "")
      if (this.capture.done) void this.save()
      else if (this.capture.expired(now)) {
        this.phase = "reference_blocked"
        this.titleTarget.textContent = "Reference acquisition interrupted"
        this.instructionTarget.textContent = "No continuous 15-second recording within 45 seconds. Check the radio link, then retry this step. Completed faces are kept while this recorder and IMU stay powered."
        this.actionButtonTarget.textContent = "Retry reference"
      }
    }
    this.renderGuidance(now)
  }
  /** @param {number} now */
  renderGuidance(now) {
    const attitude = this.health.attitude
    const live = attitude && now - this.health.attitudeAt <= 500 && attitude.coordinateFrame === "sensor_native"
    const face = FACE_NAMES[this.faceIndex] || "z+"
    const faceLabel = face[1] + face[0].toUpperCase()
    let state = live ? "aligning" : "waiting", ratio = 0, remaining = 3, maximum = 3
    let label = live ? "Live IMU orientation" : "IMU orientation unavailable"
    let hint = "Solid model: live orientation estimate. Outline: target tilt. Heading is unconstrained."
    let step = "PROCEDURE NOT STARTED", symbol = ""
    if (this.phase === "faces") {
      step = `POSITION ${this.faceIndex + 1} OF 6 · ${faceLabel} UP`
      const complete = this.faceCompletedUntil > 0
      ratio = complete ? 1 : Math.min(1, this.faces.dwell / 3000)
      remaining = Math.max(0, 3 - this.faces.dwell / 1000)
      state = complete ? "complete" : this.faces.aligned ? "holding" : state
      label = complete ? "Face captured" : this.faces.aligned ? "Hold still" : `Turn ${faceLabel} upward`
      hint = complete ? "3-second hold recorded. Advancing to the next orientation." : this.faces.aligned
        ? `Within tolerance. Maintain tilt within ${FACE_HOLD_RULES.exitTiltDeg}° until the hold completes.`
        : this.faces.positioned ? "Orientation within tolerance. Reduce angular speed to start the 3-second hold."
        : `Align the selected axis within ${FACE_HOLD_RULES.enterTiltDeg}° of vertical. Heading is unconstrained.`
      this.titleTarget.textContent = complete ? `${faceLabel} complete` : `Point ${faceLabel} up`
      this.instructionTarget.textContent = `Point ${faceLabel} upward, within ${FACE_HOLD_RULES.enterTiltDeg}° of vertical. Hold for 3 seconds with angular speed at most ${FACE_HOLD_RULES.maxRateRadS} rad/s. Heading is unconstrained.`
      if (complete) symbol = "✓"
    } else if (this.phase === "rotate") {
      step = "STEP 7 OF 8 · FIGURE EIGHTS"; symbol = "∞"
      ratio = this.rotation.reduce((sum, v) => sum + Math.min(1, v / .5), 0) / 3
      label = ratio >= 1 ? "Rotation recorded on all three axes" : "Trace a slow figure eight"
      hint = "Translucent model: motion example. Solid model: live IMU orientation estimate."
      state = ratio >= 1 ? "complete" : state
    } else if (["level", "measuring", "saving"].includes(this.phase)) {
      step = "FINAL STEP · LEVEL REFERENCE"; maximum = 15; remaining = 15
      const elapsed = this.samples.length > 1 ? (this.samples[this.samples.length - 1].t - this.samples[0].t) / 1000 : 0
      ratio = Math.min(1, elapsed / 15); remaining = Math.max(0, 15 - elapsed)
      label = this.phase === "saving" ? "Saving the reference" : elapsed > 0 ? "Keep the enclosure stationary" : "Place the enclosure level"
      hint = this.phase === "level" ? "Check both directions, remove the level, then start measuring." : this.instructionTarget.textContent || ""
      state = elapsed > 0 ? "holding" : state
      if (this.phase === "measuring" && this.samples.some(sample => referenceIssue(sample))) {
        state = "degraded"; label = "Recording the diagnostic"
      }
    } else if (this.phase === "result") {
      label = this.titleTarget.textContent || "Check complete"; hint = this.instructionTarget.textContent || ""
      ratio = this.checkPassed ? 1 : 0; symbol = this.checkPassed ? "✓" : "!"; state = this.checkPassed ? "complete" : "degraded"; step = "CHECK SAVED"
    } else if (this.phase === "save_failed") {
      label = "Reference not saved"; hint = "Keep this page open and retry saving."; symbol = "!"; step = "SAVE NEEDS ATTENTION"
    } else if (this.phase === "reference_blocked") {
      label = "Check the radio link"; hint = "Retry this step when fresh measurements return."; symbol = "!"; state = "degraded"; step = "REFERENCE INTERRUPTED"
    }
    if (!live && !["result", "save_failed", "saving", "rotate"].includes(this.phase)) {
      label = "Waiting for live orientation"; hint = "The solid model is hidden until fresh orientation measurements arrive."
    }
    const rotating = this.phase === "rotate"
    this.scene?.setMode(rotating ? "rotate" : this.phase === "faces" ? face : "z+")
    this.scene?.setReading(live ? attitude.quaternion : null, state === "holding", state === "complete")
    this.visualTarget.dataset.state = state
    this.visualTarget.dataset.motion = rotating ? "figure-eight" : "face"
    this.sceneLabelTarget.textContent = label; this.sceneHintTarget.textContent = hint; this.stepLabelTarget.textContent = step
    this.holdRingTarget.style.strokeDashoffset = String(100 * (1 - ratio))
    this.countdownTarget.innerHTML = symbol || `${remaining.toFixed(1)}<span>s</span>`
    this.holdTarget.setAttribute("aria-valuemax", String(maximum)); this.holdTarget.setAttribute("aria-valuenow", String(Number((ratio * maximum).toFixed(1))))
    this.holdTarget.setAttribute("aria-label", rotating ? "Measured rotation progress" : this.phase === "measuring" ? "Reference observation" : "Stable hold")
    this.holdTarget.setAttribute("aria-valuetext", rotating ? `${Math.round(ratio * 100)} percent of measured rotations captured` : `${label}. ${symbol || `${remaining.toFixed(1)} seconds remaining`}`)
    this.confirmationTarget.hidden = this.phase !== "ready"
    this.actionButtonTarget.hidden = ["faces", "measuring", "saving"].includes(this.phase)
    this.element.querySelectorAll('[data-face]').forEach((badge, index) => {
      const node = /** @type {HTMLElement} */ (badge), complete = Boolean(this.faces.completed[node.dataset.face || ""])
      node.dataset.complete = String(complete); node.dataset.active = String(this.phase === "faces" && index === this.faceIndex)
      const mark = node.querySelector('.calibration-face-mark'); if (mark) mark.textContent = complete ? "✓" : String(index + 1)
      node.setAttribute("aria-label", `${FACE_NAMES[index].toUpperCase()} ${complete ? "complete" : index === this.faceIndex && this.phase === "faces" ? "current face" : "pending"}`)
    })
  }
  async save() {
    const q = this.health.quality
    const issue = this.connectionIssue(Date.now())
    if (!q || issue) {
      this.phase = "reference_blocked"; this.samples = []
      this.actionButtonTarget.disabled = true; this.resultTarget.textContent = issue
      this.titleTarget.textContent = "Live measurements interrupted"
      this.instructionTarget.textContent = "Reconnect the radio, then retry this step. No reference has been validated."
      this.actionButtonTarget.textContent = "Retry reference"; return
    }
    this.phase = "saving"
    const generation = this.health.generation
    const operation = this.uuid
    const body = { uuid: this.uuid, expected_device_id: this.deviceValue, device_id: q.deviceId, boot_id: q.bootId, imu_epoch: q.imuEpoch, firmware: q.firmware,
      kind: this.kindValue, flight_id: this.flightValue || null, samples: this.samples, faces: this.faces.completed,
      ground_reference_confirmed: this.confirmedTarget.checked, figure_eight_confirmed: this.rotation.every(v => v >= 0.5) }
    try {
      const response = await fetch("/api/v1/imu-checks", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "" }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "The check could not be saved.")
      if (!this.active || generation !== this.health.generation || operation !== this.uuid) return
      this.checkPassed = result.outcome === "passed"
      this.phase = "result"; this.actionButtonTarget.textContent = this.checkPassed ? "Run again" : "Retry reference"
      const warnings = result.summary.warnings || []
      this.titleTarget.textContent = this.checkPassed ? warnings.length ? "Reference passed with warning" : "Reference checks passed" : "Check needs attention"
      this.instructionTarget.textContent = [result.summary.reason, ...warnings].join(" ") + (this.checkPassed ? "" : " Retry this reference after correcting the issue. Completed faces are kept while this recorder and IMU stay powered.")
      this.resultTarget.textContent = `Saved in ${this.kindValue === "calibration" ? "Forge" : "this flight"} · ${recorderTechnicalLabel(q)}\nRoll ${result.summary.roll_mean.toFixed(2)}° · Pitch ${result.summary.pitch_mean.toFixed(2)}° · ${result.summary.g_mean.toFixed(3)} g\nBoot ${q.bootId} · ${q.firmware}`
    } catch (error) {
      if (!this.active || generation !== this.health.generation || operation !== this.uuid) return
      this.phase = "save_failed"; this.actionButtonTarget.textContent = "Retry saving"
      this.resultTarget.textContent = `Not saved: ${error instanceof Error ? error.message : String(error)}. Keep this page open.`
    }
  }
}

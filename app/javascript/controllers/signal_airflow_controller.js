import { Controller } from "@hotwired/stimulus"

const GLIDE_KEY = "signal-tunnel-glide-ratio"
// The tunnel glide ratio is set in tenths from 1.49: 1.49, 1.59 ... 3.89 and its limit, 3.98.
const MIN_RATIO = 1.49, MAX_RATIO = 3.98, RATIO_STEP = 0.1
const RAD = Math.PI / 180
const STANDARD_GRAVITY = 9.80665

/** @typedef {{modelUrlValue: string, seatUrlValue: string, pilotUrlValue: string, sectionsUrlValue: string, ratioValue: number, massValue: number, areaValue: number, recordedValue: boolean, sceneTarget: HTMLElement, glideOutputTarget: HTMLElement, airflowTarget: HTMLElement, statusTarget: HTMLElement, valueTargets: HTMLElement[], viewTargets: HTMLButtonElement[]}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

// Signal Tunnel: the wing model follows the attitude measured by the recorder IMU,
// in an airflow drawn at the angle of the tunnel glide ratio set here.
export default class extends TypedController {
  static values = { modelUrl: String, seatUrl: String, pilotUrl: String, sectionsUrl: String, ratio: Number, mass: Number, area: Number, recorded: Boolean }
  static targets = ["scene", "glideOutput", "airflow", "status", "value", "view"]
  /** @type {import("airflow_scene").AirflowScene | null} */
  scene = null
  ratio = 2.99
  /** @type {{roll: number, pitch: number} | null} */
  attitude = null
  /** Pitot differential pressure in pascals, the dynamic pressure of the airflow. @type {number | null} */
  pressure = null

  async connect() {
    // A recording keeps the glide ratio it was started with; standby keeps the last one set here.
    // A flight record replays the glide ratio it was flown at and never touches the standby setting.
    const stored = this.recordedValue ? 0 : Number(read(GLIDE_KEY))
    this.ratio = this.recordedValue && this.ratioValue ? this.ratioValue : snap(this.ratioValue || stored || 2.99)
    this.renderGlide()
    if (!this.recordedValue) this.announce()
    try {
      const { AirflowScene } = await import("airflow_scene")
      if (!this.element.isConnected) return
      const scene = new AirflowScene(this.sceneTarget, { modelUrl: this.modelUrlValue, seatUrl: this.seatUrlValue, pilotUrl: this.pilotUrlValue, sectionsUrl: this.sectionsUrlValue })
      this.scene = scene
      scene.setGlideRatio(this.ratio)
      scene.setAttitude(this.attitude)
      await scene.start()
      this.render()
    } catch (error) {
      console.warn("Wing airflow scene unavailable.", error)
      this.scene?.dispose()
      this.scene = null
      this.statusTarget.hidden = false
      this.statusTarget.textContent = "3D view unavailable. Attitude values remain below."
    }
  }

  disconnect() {
    this.scene?.dispose()
    this.scene = null
  }

  /** @param {CustomEvent<{roll: number | null, pitch: number | null, pressure: number | null}>} event */
  telemetry(event) {
    const { roll, pitch, pressure } = event.detail
    this.pressure = pressure
    this.attitude = roll == null || pitch == null ? null : { roll, pitch }
    this.scene?.setAttitude(this.attitude)
    this.render()
  }

  /** @param {Event} event */
  stepGlide(event) {
    const button = event.currentTarget
    if (!(button instanceof HTMLButtonElement)) return
    this.ratio = snap(this.ratio + (button.dataset.step === "down" ? -RATIO_STEP : RATIO_STEP))
    write(GLIDE_KEY, String(this.ratio))
    this.scene?.setGlideRatio(this.ratio)
    this.renderGlide()
    this.render()
    this.announce()
  }

  announce() {
    window.dispatchEvent(new CustomEvent("sillage:signal-glide-ratio", { detail: { ratio: this.ratio } }))
  }

  /** @param {Event} event */
  view(event) {
    const button = event.currentTarget
    if (!(button instanceof HTMLButtonElement)) return
    this.viewTargets.forEach((target) => target.setAttribute("aria-pressed", String(target === button)))
    this.scene?.setView(button.dataset.view === "side" ? "side" : "quarter")
  }

  get airflowAngle() { return Math.atan(1 / this.ratio) / RAD }

  /** Lift coefficient needed to hold a steady flight on a slack tether: the part of the weight
   * across the airflow over dynamic pressure times wing area. Derived from measurements, not modelled.
   * Below 200 Pa (about 65 km/h) the wing cannot be flying and the value is withheld.
   */
  get liftNeeded() {
    if (this.pressure == null || this.pressure < 200 || !this.massValue || !this.areaValue) return null
    return this.massValue * STANDARD_GRAVITY * Math.cos(this.airflowAngle * RAD) / (this.pressure * this.areaValue)
  }

  renderGlide() {
    this.glideOutputTarget.textContent = this.ratio.toFixed(2)
    this.airflowTarget.textContent = `Airflow ${this.airflowAngle.toFixed(1)}° below the horizon`
  }

  render() {
    const attitude = this.attitude, forces = attitude ? this.scene?.forces : null
    if (this.scene) {
      this.statusTarget.hidden = Boolean(attitude)
      this.statusTarget.textContent = "No attitude received. The wing is shown aligned with the airflow."
    }
    /** @type {Record<string, string>} */
    const values = {
      toAirflow: attitude ? signed(attitude.pitch + this.airflowAngle) : "---",
      pitch: attitude ? signed(attitude.pitch) : "---",
      roll: attitude ? signed(attitude.roll) : "---",
      lift: forces ? signed(forces.cl, 2) : "---",
      liftNeeded: this.liftNeeded == null ? "---" : signed(this.liftNeeded, 2)
    }
    this.valueTargets.forEach((target) => { target.textContent = values[target.dataset.reading || ""] ?? "---" })
  }
}

/** Nearest step of the tunnel setting. @param {number} value */
function snap(value) {
  const index = Math.round((Math.min(Math.max(value, MIN_RATIO), MAX_RATIO) - MIN_RATIO) / RATIO_STEP)
  return Math.min(Math.round((MIN_RATIO + index * RATIO_STEP) * 100) / 100, MAX_RATIO)
}
/** @param {number} value @param {number} [digits] */
function signed(value, digits = 1) { return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}` }
/** @param {string} key */
function read(key) { try { return localStorage.getItem(key) } catch (_) { return null } }
/** @param {string} key @param {string} value */
function write(key, value) { try { localStorage.setItem(key, value) } catch (_) { /* The setting simply is not remembered. */ } }

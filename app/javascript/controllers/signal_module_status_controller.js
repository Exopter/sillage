import { Controller } from "@hotwired/stimulus"

/**
 * @typedef {ReturnType<import("../lib/signal_telemetry").SignalTelemetry["moduleSnapshot"]>} Modules
 * @typedef {{moduleTargets: HTMLElement[]}} StimulusBindings
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["module"]

  /** @param {CustomEvent<{modules: Modules, connected: boolean, ended: boolean}>} event */
  update({detail: {modules, connected, ended}}) {
    /** @type {Record<string,string>} */
    const labels = {unknown: "Unknown", stale: "Link lost", ready: "Ready", degraded: "Degraded"}
    for (const target of this.moduleTargets || []) {
      const module = modules.find(item => item.role === Number(target.dataset.moduleRole))
      if (!module) continue
      const state = !connected ? "unknown" : module.state
      target.dataset.state = state
      const values = {
        state: ended ? "Session ended" : !connected ? "Disconnected" : labels[state],
        identity: module.deviceId || "No module identified",
        sensors: connected ? module.sensors : "Sensor status unavailable",
        storage: connected ? module.storage : "Storage status unavailable",
        age: connected && module.ageMs != null ? `Last status ${Math.floor(module.ageMs / 1000)} s ago` : "Waiting for module status"
      }
      target.querySelector("[data-module-trigger]")?.setAttribute("aria-label", `${module.name}: ${values.state}`)
      for (const [key, value] of Object.entries(values)) {
        const element = target.querySelector(`[data-module-${key}]`)
        if (element && element.textContent !== value) element.textContent = value
      }
    }
  }

}

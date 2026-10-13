import { Controller } from "@hotwired/stimulus"

/** @typedef {{canvasTarget: HTMLElement, statusTarget: HTMLElement, pointsValue: number[][]}} Bindings */
const TypedController = /** @type {new (context: import('@hotwired/stimulus').Context) => Controller<HTMLElement> & Bindings} */ (/** @type {unknown} */ (Controller))

export default class extends TypedController {
  static targets = ["canvas", "status"]
  static values = { points: Array }
  /** @type {import('leaflet').Map | null} */
  map = null
  /** @type {ResizeObserver | null} */
  resize = null
  /** @type {IntersectionObserver | null} */
  visibility = null
  active = false

  connect() {
    this.active = true
    this.visibility = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { this.visibility?.disconnect(); void this.start() }
    })
    this.visibility.observe(this.canvasTarget)
  }

  async start() {
    try {
      const L = await import("leaflet")
      if (!this.active) return
      const points = /** @type {import('leaflet').LatLngTuple[]} */ (this.pointsValue)
      if (points.length < 2) return
      // Unwrap longitude so crossing the date line does not frame the whole globe.
      const origin = points[0][1]
      const route = points.map(([lat, lon]) => /** @type {import('leaflet').LatLngTuple} */ ([lat, origin + ((lon - origin + 540) % 360) - 180]))
      const style = getComputedStyle(this.element)
      const color = style.getPropertyValue("--ex-state-live-text").trim()
      const endpoint = style.getPropertyValue("--ex-white").trim()
      this.map = L.map(this.canvasTarget, { preferCanvas: true, scrollWheelZoom: false, zoomControl: true, attributionControl: true })
      const line = L.polyline(route, { color, weight: 3 }).addTo(this.map)
      this.map.fitBounds(line.getBounds(), { padding: [24, 24], maxZoom: 15, animate: false })
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(this.map)
      for (const point of [route[0], route[route.length - 1]]) L.circleMarker(point, { radius: 5, color: endpoint, weight: 2, fillColor: color, fillOpacity: 1 }).addTo(this.map)
      this.statusTarget.textContent = "Recorded route · drag to pan · use + / − to zoom"
      this.resize = new ResizeObserver(() => this.map?.invalidateSize({ animate: false }))
      this.resize.observe(this.canvasTarget)
    } catch {
      if (this.active) this.statusTarget.textContent = "Map unavailable. Open the flight to inspect its recorded data."
    }
  }

  disconnect() {
    this.active = false
    this.visibility?.disconnect()
    this.resize?.disconnect()
    this.map?.remove()
    this.map = null
  }
}

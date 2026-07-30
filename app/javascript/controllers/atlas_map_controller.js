import { Controller } from "@hotwired/stimulus"
import * as maplibregl from "maplibre-gl"

export default class extends Controller {
  static targets = ["canvas", "zone", "name", "elevation", "coordinates", "practical", "notes", "staticMarker"]
  static values = { styleUrl: String, imageUrl: String, preload: Boolean }

  connect() {
    this.select(this.zoneTargets.find((zone) => zone.dataset.selected === "true") || this.zoneTargets[0])
  }

  disconnect() {
    this.map?.remove()
    this.preloadMap?.remove()
    this.preloadContainer?.remove()
  }

  choose(event) {
    this.select(event.currentTarget)
  }

  select(zone) {
    if (!zone) return

    this.zoneTargets.forEach((candidate) => {
      const selected = candidate === zone
      candidate.dataset.selected = selected
      candidate.setAttribute("aria-pressed", selected)
    })

    const data = zone.dataset
    this.nameTarget.textContent = data.name
    this.elevationTarget.textContent = data.elevation
    this.coordinatesTarget.textContent = `${data.latitude}, ${data.longitude}`
    this.practicalTarget.textContent = data.practical || "No practical information recorded."
    this.notesTarget.textContent = data.notes || "No field notes recorded."
    this.renderMap(Number(data.longitude), Number(data.latitude), data.name)
  }

  renderMap(longitude, latitude, name) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return

    if (!this.hasStyleUrlValue || !this.styleUrlValue) {
      this.canvasTarget.style.backgroundImage = `linear-gradient(rgba(7, 11, 13, .2), rgba(7, 11, 13, .38)), url(${this.imageUrlValue})`
      this.staticMarkerTarget.hidden = false
      this.staticMarkerTarget.querySelector("strong").textContent = `${name} · Landing zone`
      return
    }

    if (!this.map) {
      this.map = new maplibregl.Map({
        container: this.canvasTarget,
        style: this.styleUrlValue,
        center: [longitude, latitude],
        zoom: 11.5,
        attributionControl: true
      })
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
      this.marker = new maplibregl.Marker({ color: "#8cff4d" }).setLngLat([longitude, latitude]).addTo(this.map)
      if (this.preloadValue) this.map.once("idle", () => this.preloadCoordinates(longitude, latitude, () => this.preloadCurrentPosition()))

      this.staticMarkerTarget.hidden = true
    } else {
      this.marker.setLngLat([longitude, latitude])
      this.map.easeTo({ center: [longitude, latitude], zoom: Math.max(this.map.getZoom(), 11.5) })
    }

    this.marker.setPopup(new maplibregl.Popup({ offset: 28 }).setText(`${name} · Landing zone`))
  }

  async preloadCurrentPosition() {
    if (!navigator.permissions?.query || !navigator.geolocation || this.currentPositionPreloaded) return
    this.currentPositionPreloaded = true

    try {
      const permission = await navigator.permissions.query({ name: "geolocation" })
      if (permission.state !== "granted") return
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => this.preloadCoordinates(coords.longitude, coords.latitude),
        () => {},
        { enableHighAccuracy: false, maximumAge: 300_000, timeout: 3_000 }
      )
    } catch (_) {
      // Tile warming is optional and must never interrupt Atlas.
    }
  }

  preloadCoordinates(longitude, latitude, after = () => {}) {
    if (this.preloadMap) return
    this.preloadContainer = document.createElement("div")
    Object.assign(this.preloadContainer.style, { position: "fixed", left: "-10000px", width: "256px", height: "256px" })
    this.element.append(this.preloadContainer)
    this.preloadMap = new maplibregl.Map({
      container: this.preloadContainer,
      style: this.styleUrlValue,
      center: [longitude, latitude],
      zoom: 10,
      interactive: false,
      attributionControl: false
    })
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      this.preloadMap?.remove()
      this.preloadContainer?.remove()
      this.preloadMap = null
      this.preloadContainer = null
      after()
    }
    this.preloadMap.once("idle", cleanup)
    window.setTimeout(cleanup, 10_000)
  }
}

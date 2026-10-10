import { loadCesiumLibrary, withTimeout } from "viewer_resources"

/** Live geography is independent of serial acquisition and local capture. */
export class SignalMap {
  /** @type {typeof import("cesium") | null} */
  cesium = null
  /** @type {import("cesium").Viewer | null} */
  viewer = null
  /** @type {import("cesium").Entity | null} */
  marker = null
  /** @type {import("cesium").ConstantProperty | null} */
  headingLabel = null
  /** @type {number | null} */
  heading = null
  /** @type {import("cesium").ConstantPositionProperty | null} */
  position = null
  /** @type {import("cesium").Cartesian3[]} */
  positions = []
  /** @type {import("cesium").EventHelper | null} */
  events = null
  /** @type {ResizeObserver | null} */
  observer = null
  /** @type {number[] | null} */
  lastCoordinate = null
  following = true
  disposed = false
  ready = false
  imageryReady = false
  terrainReady = false

  /** @param {{container: HTMLElement, credits: HTMLElement, status: HTMLElement, followButton: HTMLButtonElement, baseUrl: string, token: string, label: string}} options */
  constructor(options) { this.options = options }

  async start() {
    try {
      const C = await loadCesiumLibrary(this.options.baseUrl)
      if (this.disposed) return
      this.cesium = C
      const viewer = this.viewer = new C.Viewer(this.options.container, {
        animation: false, baseLayer: false, baseLayerPicker: false,
        fullscreenButton: false, geocoder: false, homeButton: false,
        infoBox: false, navigationHelpButton: false, sceneModePicker: false,
        selectionIndicator: false, timeline: false, scene3DOnly: true,
        creditContainer: this.options.credits, creditViewport: this.options.container,
        requestRenderMode: true, maximumRenderTimeChange: Infinity,
        useBrowserRecommendedResolution: false, msaaSamples: 4,
        terrainProvider: new C.EllipsoidTerrainProvider()
      })
      viewer.scene.globe.enableLighting = false
      viewer.scene.globe.depthTestAgainstTerrain = false
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20
      this.events = new C.EventHelper()
      const style = getComputedStyle(this.options.container)
      const token = (/** @type {string} */ name) => style.getPropertyValue(name).trim()
      const green = C.Color.fromCssColorString(token("--ex-hud-green"))
      const carbon = C.Color.fromCssColorString(token("--ex-carbon-950"))
      this.position = new C.ConstantPositionProperty()
      this.headingLabel = new C.ConstantProperty(`${this.options.label}\nHDG ---`)
      this.marker = viewer.entities.add({
        show: false, position: this.position,
        viewFrom: new C.Cartesian3(0, -8000, 6000),
        point: { pixelSize: 8, color: green, outlineColor: carbon, outlineWidth: 1.5, disableDepthTestDistance: Infinity },
        label: {
          text: this.headingLabel, font: `500 12px ${token("--ex-font-mono")}`,
          pixelOffset: new C.Cartesian2(14, 14),
          horizontalOrigin: C.HorizontalOrigin.LEFT, verticalOrigin: C.VerticalOrigin.TOP,
          fillColor: C.Color.fromCssColorString(token("--ex-vapor-50")),
          style: C.LabelStyle.FILL, showBackground: true,
          backgroundColor: carbon.withAlpha(0.82), backgroundPadding: new C.Cartesian2(8, 6),
          disableDepthTestDistance: Infinity
        }
      })
      viewer.entities.add({ polyline: {
        positions: new C.CallbackProperty(() => this.positions, false),
        width: 1.5, material: green.withAlpha(0.65), arcType: C.ArcType.NONE
      } })
      this.observer = new ResizeObserver(() => {
        if (this.disposed) return
        viewer.resize()
        viewer.scene.requestRender()
      })
      this.observer.observe(this.options.container)
      this.ready = true
      this.options.followButton.disabled = false
      this.options.container.dataset.mapState = "ready"
      this.options.status.textContent = "3D map · loading imagery"
      // The bundled world map remains available without an Internet connection.
      C.TileMapServiceImageryProvider.fromUrl(`${this.options.baseUrl}Assets/Textures/NaturalEarthII`)
        .then((provider) => {
          if (!this.disposed && !this.imageryReady) {
            viewer.imageryLayers.addImageryProvider(provider, 0)
            viewer.scene.requestRender()
          }
        }).catch(() => {})
      if (this.options.token) {
        C.Ion.defaultAccessToken = this.options.token
        await this.loadGeography(C, viewer)
      } else {
        this.options.status.textContent = "3D map · detailed imagery unavailable"
      }
    } catch (_) {
      if (this.disposed) return
      this.destroyViewer()
      this.ready = false
      this.options.container.dataset.mapState = "unavailable"
      this.options.followButton.disabled = true
      this.options.status.textContent = "3D unavailable · local GPS track"
    }
  }

  /** @param {typeof import("cesium")} C @param {import("cesium").Viewer} viewer */
  async loadGeography(C, viewer) {
    const current = () => !this.disposed && this.viewer === viewer
    const status = () => {
      if (!current()) return
      this.options.status.textContent = this.imageryReady
        ? (this.terrainReady ? "3D satellite · terrain" : "3D satellite · terrain unavailable")
        : "3D map · satellite imagery unavailable"
      viewer.scene.requestRender()
    }
    await Promise.allSettled([
      withTimeout(C.createWorldImageryAsync({ style: C.IonWorldImageryStyle.AERIAL }), "Satellite imagery").then((provider) => {
        if (!current()) return
        viewer.imageryLayers.removeAll()
        viewer.imageryLayers.addImageryProvider(provider)
        this.imageryReady = true
        this.events?.add(provider.errorEvent, () => { this.imageryReady = false; status() })
        status()
      }),
      withTimeout(C.createWorldTerrainAsync(), "Terrain").then((provider) => {
        if (!current()) return
        viewer.terrainProvider = provider
        this.terrainReady = true
        this.events?.add(provider.errorEvent, () => { this.terrainReady = false; status() })
        status()
      }),
      withTimeout(C.createOsmBuildingsAsync().then((tileset) => {
        if (!current()) { tileset.destroy(); return }
        viewer.scene.primitives.add(tileset)
        viewer.scene.requestRender()
      }), "Buildings")
    ])
    status()
  }

  /** @param {{gps: number[] | null, altitude: number | null, heading?: number | null}} telemetry */
  update(telemetry) {
    const C = this.cesium, viewer = this.viewer, marker = this.marker
    if (!this.ready || !C || !viewer || !marker) return
    if (!telemetry.gps) {
      if (marker.show) {
        viewer.trackedEntity = undefined
        marker.show = false
        viewer.scene.requestRender()
      }
      return
    }
    const [longitude, latitude] = telemetry.gps
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return
    const ground = viewer.scene.globe.getHeight(C.Cartographic.fromDegrees(longitude, latitude))
    // GPS_RAW_INT base altitude is AMSL. Keep the visual marker above terrain;
    // displayed numeric altitude remains the original received measurement.
    const height = Math.max(telemetry.altitude ?? ground ?? 0, (ground ?? -10000) + 3)
    const coordinate = [longitude, latitude, height]
    const changed = !this.lastCoordinate || coordinate.some((value, index) => value !== this.lastCoordinate?.[index])
    const heading = typeof telemetry.heading === "number" && Number.isFinite(telemetry.heading) ? ((telemetry.heading % 360) + 360) % 360 : null
    const headingChanged = heading !== this.heading
    this.heading = heading
    this.headingLabel?.setValue(`${this.options.label}\nHDG ${heading == null ? "---" : `${String(Math.round(heading) % 360).padStart(3, "0")}°`}`)
    if (changed) {
      const position = C.Cartesian3.fromDegrees(longitude, latitude, height)
      this.position?.setValue(position)
      this.positions.push(position)
      if (this.positions.length > 600) this.positions.shift()
      this.lastCoordinate = coordinate
    }
    const wasVisible = marker.show
    marker.show = true
    if (this.following && viewer.trackedEntity !== marker) viewer.trackedEntity = marker
    if (changed || headingChanged || !wasVisible) viewer.scene.requestRender()
  }

  toggleFollow() {
    this.following = !this.following
    this.options.followButton.setAttribute("aria-pressed", String(this.following))
    this.options.followButton.textContent = this.following ? "Following GPS" : "Follow GPS"
    if (!this.viewer) return
    this.viewer.trackedEntity = this.following && this.marker?.show ? this.marker : undefined
    this.viewer.scene.requestRender()
  }

  destroyViewer() {
    this.observer?.disconnect()
    this.events?.removeAll()
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.destroy()
    this.viewer = null
  }

  destroy() {
    this.disposed = true
    this.ready = false
    this.destroyViewer()
  }
}

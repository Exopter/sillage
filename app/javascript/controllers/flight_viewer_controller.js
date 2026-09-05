import { Controller } from "@hotwired/stimulus"
import {
  clamp,
  finiteNumber,
  lerp,
  median,
  sampleFlightPoint,
  sampleSensorValue
} from "flight_geometry"
import { pressureAltitudeFromPascals } from "pressure_altitude"

import { loadCesiumLibrary, withTimeout } from "viewer_resources"

const CESIUM_TILE_PROVIDER = "CESIUM_ION"

export default class extends Controller {
  static targets = [
    "scene",
    "credits",
    "unifiedChart",
    "phaseButton",
    "phaseName",
    "phaseRange",
    "metricToggle",
    "stat",
    "scrubber",
    "timeLabel",
    "playButton",
    "video",
    "videoExitOffsetInput",
    "videoExitOffsetLabel"
  ]

  static values = {
    points: Array,
    sensors: Array,
    bounds: Object,
    analysis: Object,
    cesiumToken: String,
    cesiumBaseUrl: String,
    labels: Object,
    videoExitOffset: Number
  }

  async connect() {
    const generation = this.connectionGeneration = Symbol("flight-viewer")
    this.points = this.pointsValue.filter((point) =>
      Number.isFinite(Number(point.lat)) &&
      Number.isFinite(Number(point.lon)) &&
      Number.isFinite(Number(point.alt))
    )
    this.analysis = this.hasAnalysisValue ? this.analysisValue : {}
    this.sensors = this.sensorsValue
      .map((sample) => this.normalizedSensorSample(sample))
      .filter((sample) => Number.isFinite(Number(sample.t)))
      .sort((a, b) => this.number(a.t) - this.number(b.t))
    this.sensors = this.enrichedSensorSamples(this.sensors)
    this.groundAltitude = this.groundAltitudeFromAnalysis()
    this.points = this.points.map((point) => ({ ...point, height: this.heightFromGround(point) }))
    this.charts = []
    this.boundSceneHandlers = []
    this.cesiumInteractionHandler = null
    this.cesiumOrbit = null
    this.cesiumOrbitHome = null
    this.cesiumDrag = null
    this.cesiumVisualPoints = null
    this.timelineStart = this.timelineStartFromData()
    this.flightDuration = this.timelineEndFromData()
    this.activePhase = "all"
    this.currentElapsed = this.timelineStart
    this.isPlaying = false
    this.playbackFrame = null
    this.playbackStartedAt = 0
    this.playbackStartElapsed = 0
    this.playbackLastRenderAt = 0
    this.playbackLastCameraAt = 0
    this.videoExitOffset = this.hasVideoExitOffsetValue ? this.videoExitOffsetValue : null
    this.videoSyncFrame = null
    this.videoSyncLastRenderAt = 0
    this.syncingVideo = false
    this.colors = this.designColors()
    const cesiumLoad = this.shouldLoadCesium()
      ? this.loadCesium().catch((error) => error)
      : null
    if (this.shouldLoadCesium()) this.setupScene(cesiumLoad, generation)

    try {
      const chartModule = await this.loadCharts()
      if (!this.isCurrentConnection(generation)) return
      this.Chart = chartModule.Chart
      this.tooltipPosition = this.installTooltipPositioner(chartModule.Tooltip) ? "osAwayFromPoint" : "average"
      this.Chart.register(...chartModule.registerables, OS_BOUNDS_PLUGIN, OS_PLAYBACK_PLUGIN)
      this.setupCharts()
    } catch (error) {
      if (!this.isCurrentConnection(generation)) return
      this.charts.forEach((chart) => chart.destroy())
      this.charts = []
      this.unifiedChart = null
      console.warn(`Flight charts unavailable: ${error.message || error}`)
    }

    this.applyPhase("all", { movePlayhead: false })
    this.updatePlayButton()
    this.updateVideoExitLabel()
    this.updateScrubbedElapsed(this.defaultElapsed())
  }

  disconnect() {
    this.connectionGeneration = null
    this.cesiumSurfaceRefinementId = null
    if (this.playbackFrame) cancelAnimationFrame(this.playbackFrame)
    if (this.videoSyncFrame) cancelAnimationFrame(this.videoSyncFrame)
    this.disposeSceneHandlers()
    this.disposeCesiumScene()
    for (const chart of this.charts || []) chart.destroy()
    this.charts = []
    this.unifiedChart = null
  }

  scrub(event) {
    this.pausePlayback()
    this.updateScrubbedElapsed(this.phaseStart() + ((Number(event.target.value) / 1000) * this.phaseSpan()))
  }

  selectPhase(event) {
    this.applyPhase(event.currentTarget.dataset.phase)
  }

  toggleMetric(event) {
    if (!this.unifiedChart) return

    const metric = event.currentTarget.dataset.metric
    const datasetIndex = this.unifiedChart.data.datasets.findIndex((dataset) => dataset.metric === metric)
    if (datasetIndex < 0) return

    this.unifiedChart.setDatasetVisibility(datasetIndex, event.currentTarget.checked)
    this.refreshUnifiedAxes()
    this.unifiedChart.update("none")
  }

  togglePlayback() {
    if (this.isPlaying) {
      this.pausePlayback()
      return
    }

    if (this.videoCanSync()) {
      this.playSyncedVideo()
      return
    }

    if (this.currentElapsed >= this.phaseEnd()) this.updateScrubbedElapsed(this.phaseStart())
    this.isPlaying = true
    this.playbackStartedAt = performance.now()
    this.playbackStartElapsed = this.currentElapsed
    this.playbackLastRenderAt = 0
    this.playbackLastCameraAt = 0
    this.updatePlayButton()
    this.playbackFrame = requestAnimationFrame((timestamp) => this.stepPlayback(timestamp))
  }

  pausePlayback(options = {}) {
    if (this.playbackFrame) cancelAnimationFrame(this.playbackFrame)
    if (this.videoSyncFrame) cancelAnimationFrame(this.videoSyncFrame)

    this.playbackFrame = null
    this.videoSyncFrame = null
    if (!options.skipVideoPause) this.pauseVideo()
    this.isPlaying = false
    this.updatePlayButton()
  }

  stepPlayback(timestamp) {
    if (!this.isPlaying) return

    const elapsed = this.playbackStartElapsed + ((timestamp - this.playbackStartedAt) / 1000)
    if (elapsed >= this.phaseEnd()) {
      this.updateScrubbedElapsed(this.phaseEnd())
      this.pausePlayback()
      return
    }

    if (timestamp - this.playbackLastRenderAt > 80) {
      this.playbackLastRenderAt = timestamp
      const followCamera = timestamp - this.playbackLastCameraAt > 360
      if (followCamera) this.playbackLastCameraAt = timestamp
      this.updateScrubbedElapsed(elapsed, { followCamera })
    }
    this.playbackFrame = requestAnimationFrame((nextTimestamp) => this.stepPlayback(nextTimestamp))
  }

  playSyncedVideo() {
    if (!this.videoCanSync()) return

    if (this.currentElapsed >= this.phaseEnd()) this.updateScrubbedElapsed(this.phaseStart())
    this.syncVideoFromFlight()
    this.isPlaying = true
    this.videoSyncLastRenderAt = 0
    this.updatePlayButton()

    const playPromise = this.videoTarget.play()
    if (playPromise?.catch) {
      playPromise.catch(() => {
        this.isPlaying = false
        this.updatePlayButton()
      })
    }
    this.startVideoSyncLoop()
  }

  pauseVideo() {
    if (!this.hasVideoTarget || this.videoTarget.paused) return

    this.syncingVideo = true
    this.videoTarget.pause()
    this.syncingVideo = false
  }

  videoPlaybackStarted() {
    if (!this.videoCanSync() || this.syncingVideo) return

    if (this.playbackFrame) cancelAnimationFrame(this.playbackFrame)
    this.playbackFrame = null
    this.isPlaying = true
    this.videoSyncLastRenderAt = 0
    this.updatePlayButton()
    this.startVideoSyncLoop()
  }

  videoPlaybackPaused() {
    if (this.syncingVideo) return

    this.pausePlayback({ skipVideoPause: true })
  }

  videoSeeked() {
    if (!this.videoCanSync()) return

    this.updateScrubbedElapsed(this.elapsedForVideoTime(this.videoTarget.currentTime), {
      followCamera: false,
      syncVideo: false
    })
  }

  videoTimeUpdated() {
    if (!this.videoCanSync() || !this.videoTarget.paused) return

    this.videoSeeked()
  }

  startVideoSyncLoop() {
    if (this.videoSyncFrame || !this.videoCanSync()) return

    this.videoSyncFrame = requestAnimationFrame((timestamp) => this.stepVideoPlayback(timestamp))
  }

  stepVideoPlayback(timestamp) {
    this.videoSyncFrame = null
    if (!this.isPlaying || !this.videoCanSync()) return

    if (this.videoTarget.paused || this.videoTarget.ended) {
      this.pausePlayback({ skipVideoPause: true })
      return
    }

    if (timestamp - this.videoSyncLastRenderAt > 80) {
      this.videoSyncLastRenderAt = timestamp
      this.updateScrubbedElapsed(this.elapsedForVideoTime(this.videoTarget.currentTime), {
        followCamera: true,
        syncVideo: false
      })
    }

    this.startVideoSyncLoop()
  }

  updatePlayButton() {
    if (!this.hasPlayButtonTarget) return

    const label = this.label(this.isPlaying ? "pause" : "play")
    this.playButtonTarget.classList.toggle("is-playing", this.isPlaying)
    this.playButtonTarget.setAttribute("aria-label", label)
    this.playButtonTarget.title = label
  }

  resetCamera() {
    if (this.cesiumViewer && window.Cesium) {
      this.cesiumOrbit = { ...this.cesiumOrbitHome }
      this.applyCesiumOrbit(window.Cesium, this.cesiumViewer)
    }
  }

  markVideoExit(event) {
    event.preventDefault()
    if (!this.hasVideoTarget || !this.hasVideoExitOffsetInputTarget) return

    this.videoExitOffset = this.clamp(
      this.videoTarget.currentTime || 0,
      0,
      this.number(this.videoTarget.duration) || Number.MAX_SAFE_INTEGER
    )
    this.videoExitOffsetInputTarget.value = this.videoExitOffset.toFixed(3)
    this.updateVideoExitLabel()
    event.currentTarget.closest("form")?.requestSubmit()
  }

  syncVideoFromFlight() {
    this.updateVideoExitLabel()
    if (!this.videoCanSync()) return

    this.syncVideoToElapsed(this.currentElapsed)
  }

  syncVideoToElapsed(elapsed) {
    if (!this.videoCanSync()) return
    if (this.videoTarget.readyState === 0) return

    const targetTime = this.videoTimeForElapsed(elapsed)
    if (!Number.isFinite(targetTime)) return
    if (Math.abs(this.videoTarget.currentTime - targetTime) < 0.12) return

    this.syncingVideo = true
    this.videoTarget.currentTime = targetTime
    this.syncingVideo = false
  }

  videoCanSync() {
    return this.hasVideoTarget &&
      Number.isFinite(this.videoExitOffset) &&
      this.videoExitOffset >= 0
  }

  videoTimeForElapsed(elapsed) {
    const elapsedSeconds = this.number(elapsed)
    if (!Number.isFinite(elapsedSeconds) || !this.videoCanSync()) return null

    const targetTime = elapsedSeconds - this.exitElapsed() + this.videoExitOffset
    const duration = this.number(this.videoTarget.duration)
    return this.clamp(targetTime, 0, Number.isFinite(duration) ? duration : Math.max(targetTime, 0))
  }

  elapsedForVideoTime(currentTime) {
    const videoTime = this.number(currentTime)
    if (!Number.isFinite(videoTime) || !this.videoCanSync()) return this.currentElapsed

    return videoTime - this.videoExitOffset + this.exitElapsed()
  }

  updateVideoExitLabel() {
    if (!this.hasVideoExitOffsetLabelTarget) return

    this.videoExitOffsetLabelTarget.textContent = this.videoCanSync()
      ? this.label("video_exit_marked").replace("%{timestamp}", this.formatSeconds(this.videoExitOffset))
      : this.label("video_exit_unmarked")
  }

  setupCharts() {
    if (!this.hasUnifiedChartTarget) return

    this.setupUnifiedChart()
  }

  setupUnifiedChart() {
    const totalSpeedRows = this.points.map((point) => ({
      ...point,
      totalSpeed: this.totalSpeedMetersPerSecond(point)
    }))
    const airspeedRows = this.sensorRows("AIRSPEED")
    const distanceRows = this.integratedDistanceRows(this.points)
    const loadRows = this.sensorRows("IMU:accelerometer").map((sample) => ({
      ...sample,
      load: this.accelerationLoadFactor(sample.readings)
    }))

    const datasets = [
      this.metricDataset("altitude", "Altitude", this.points, (point) => point.alt, this.colors.aqua, "altitude", "m", true),
      this.metricDataset("horizontal-speed", "Horizontal speed", this.points, (point) => this.kilometersPerHour(point.hspeed), this.colors.sky, "speed", "km/h", true),
      this.metricDataset("vertical-speed", "Vertical speed", this.points, (point) => this.kilometersPerHour(point.vspeed, { absolute: true }), this.colors.amber, "speed", "km/h", true),
      this.metricDataset("airspeed", "Airspeed", airspeedRows, (sample) => this.kilometersPerHour(sample.readings?.airspeed_m_s, { absolute: true }), this.colors.lime, "speed", "km/h", false),
      this.metricDataset("total-speed", "Total speed", totalSpeedRows, (point) => this.kilometersPerHour(point.totalSpeed), this.colors.violet, "speed", "km/h", false),
      this.metricDataset("glide", "Glide ratio", this.points, (point) => point.glide, this.colors.coral, "ratio", "", false),
      this.metricDataset("distance", "Distance", distanceRows, (point) => point.distance / 1000, this.colors.graphite, "distance", "km", false),
      this.metricDataset("load", "G-force", loadRows, (sample) => sample.load, this.colors.field, "load", "g", false)
    ]

    this.unifiedChart = this.createTimeChart(this.unifiedChartTarget, datasets, {
      altitude: this.axis("left", "Altitude · m"),
      speed: this.axis("right", "Speed · km/h", false),
      distance: this.axis("left", "Distance · km", false),
      ratio: this.axis("right", "Glide ratio", false),
      load: this.axis("right", "Load · g", false)
    })
    this.refreshUnifiedAxes()
    this.syncMetricControls()
  }

  applyPhase(requestedPhase, options = {}) {
    const ranges = this.phaseRanges()
    const phase = ranges[requestedPhase] ? requestedPhase : "all"
    this.activePhase = phase

    this.phaseButtonTargets.forEach((button) => {
      const active = button.dataset.phase === phase
      button.classList.toggle("is-active", active)
      button.setAttribute("aria-pressed", active ? "true" : "false")
    })

    if (this.unifiedChart) {
      const [ start, end ] = ranges[phase]
      this.unifiedChart.options.scales.x.min = start
      this.unifiedChart.options.scales.x.max = end
      this.unifiedChart.update("none")
    }

    this.updatePhaseLabels()
    this.updatePhaseStatistics()
    if (options.movePlayhead !== false) this.updateScrubbedElapsed(this.phaseStart(), { followCamera: false })
  }

  phaseRanges() {
    const start = this.timelineStart
    const end = this.flightDuration
    const exit = this.boundaryWithinTimeline(this.boundsValue?.exit, start)
    const opening = this.boundaryWithinTimeline(this.boundsValue?.opening, exit)
    const landing = this.boundaryWithinTimeline(this.boundsValue?.landing, opening, end)

    return {
      all: [ start, end ],
      plane: this.validPhaseRange(start, exit, start, end),
      jump: this.validPhaseRange(exit, opening, start, end),
      canopy: this.validPhaseRange(opening, landing, start, end)
    }
  }

  boundaryWithinTimeline(value, fallback, maximum = this.flightDuration) {
    const boundary = this.number(value)
    if (!Number.isFinite(boundary)) return fallback

    return this.clamp(boundary, this.timelineStart, maximum)
  }

  validPhaseRange(start, end, fallbackStart, fallbackEnd) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [ fallbackStart, fallbackEnd ]

    return [ start, end ]
  }

  phaseStart() {
    return this.phaseRanges()[this.activePhase || "all"][0]
  }

  phaseEnd() {
    return this.phaseRanges()[this.activePhase || "all"][1]
  }

  phaseSpan() {
    return Math.max(this.phaseEnd() - this.phaseStart(), 0.001)
  }

  updatePhaseLabels() {
    const name = this.phaseDisplayName()
    if (this.hasPhaseNameTarget) this.phaseNameTarget.textContent = name
    if (this.hasPhaseRangeTarget) {
      this.phaseRangeTarget.textContent = `${this.formatTimer(this.phaseStart())} — ${this.formatTimer(this.phaseEnd())} · ${this.formatDuration(this.phaseSpan())}`
    }
  }

  phaseDisplayName() {
    return {
      all: "All",
      plane: "Plane",
      jump: "Jump",
      canopy: "Canopy"
    }[this.activePhase] || "All"
  }

  updatePhaseStatistics() {
    const start = this.phaseStart()
    const end = this.phaseEnd()
    const points = this.points.filter((point) => this.timeInsideRange(point.t, start, end))
    const airspeedRows = this.sensorRows("AIRSPEED").filter((sample) => this.timeInsideRange(sample.t, start, end))
    const loadRows = this.sensorRows("IMU:accelerometer").filter((sample) => this.timeInsideRange(sample.t, start, end))
    const distance = this.integratedDistance(points)
    const horizontalSpeeds = this.finiteValues(points, (point) => this.kilometersPerHour(point.hspeed))
    const verticalSpeeds = this.finiteValues(points, (point) => this.kilometersPerHour(point.vspeed, { absolute: true }))
    const totalSpeeds = this.finiteValues(points, (point) => this.kilometersPerHour(this.totalSpeedMetersPerSecond(point)))
    const airspeeds = this.finiteValues(airspeedRows, (sample) => this.kilometersPerHour(sample.readings?.airspeed_m_s, { absolute: true }))
      .filter((value) => value <= 600)
    const glideRatios = this.finiteValues(points, (point) => this.number(point.glide))
      .filter((value) => value > 0 && value <= 100)
    const loads = this.finiteValues(loadRows, (sample) => this.accelerationLoadFactor(sample.readings))
      .filter((value) => value <= 20)

    this.setStat("duration", this.formatDuration(end - start))
    this.setStat("distance", this.formatDistance(distance))
    this.setAverageMaximumStat("horizontal-speed", horizontalSpeeds, 0)
    this.setAverageMaximumStat("vertical-speed", verticalSpeeds, 0)
    this.setAverageMaximumStat("airspeed", airspeeds, 0)
    this.setStat("glide", this.formatAverage(glideRatios, 1))
    this.setAverageMaximumStat("total-speed", totalSpeeds, 0)
    this.setStat("peak-load", loads.length > 0 ? this.formatUnit(Math.max(...loads), "g", 1) : "—")
  }

  timeInsideRange(value, start, end) {
    const time = this.number(value)
    return Number.isFinite(time) && time >= start && time <= end
  }

  finiteValues(rows, mapper) {
    return rows.map(mapper).filter((value) => Number.isFinite(value))
  }

  setStat(key, value) {
    this.statTargets.filter((target) => target.dataset.stat === key).forEach((target) => {
      target.textContent = value
    })
  }

  setAverageMaximumStat(key, values, digits) {
    if (values.length === 0) {
      this.setStat(`${key}-average`, "—")
      this.setStat(`${key}-maximum`, "—")
      return
    }

    const average = values.reduce((sum, value) => sum + value, 0) / values.length
    this.setStat(`${key}-average`, average.toFixed(digits))
    this.setStat(`${key}-maximum`, Math.max(...values).toFixed(digits))
  }

  formatDuration(value) {
    const seconds = Math.max(0, Math.round(this.number(value) || 0))
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainder = seconds % 60
    if (hours > 0) return `${hours} h ${minutes} min ${remainder} s`
    if (minutes > 0) return `${minutes} min ${remainder} s`

    return `${remainder} s`
  }

  formatDistance(value) {
    const meters = this.number(value)
    if (!Number.isFinite(meters)) return "—"
    if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`

    return `${Math.round(meters)} m`
  }

  formatUnit(value, unit, digits) {
    const number = this.number(value)
    return Number.isFinite(number) ? `${number.toFixed(digits)} ${unit}` : "—"
  }

  formatAverage(values, digits) {
    if (values.length === 0) return "—"

    const average = values.reduce((sum, value) => sum + value, 0) / values.length
    return `Avg ${average.toFixed(digits)}`
  }

  accelerationLoadFactor(readings) {
    const x = this.number(readings?.x ?? readings?.ax)
    const y = this.number(readings?.y ?? readings?.ay)
    const z = this.number(readings?.z ?? readings?.az)
    if (![ x, y, z ].every(Number.isFinite)) return null

    const magnitude = Math.sqrt((x ** 2) + (y ** 2) + (z ** 2))
    return magnitude > 4 ? magnitude / 9.80665 : magnitude
  }

  totalSpeedMetersPerSecond(point) {
    const horizontal = this.number(point?.hspeed)
    const vertical = this.number(point?.vspeed)
    if (!Number.isFinite(horizontal) && !Number.isFinite(vertical)) return null

    return Math.sqrt((horizontal || 0) ** 2 + (vertical || 0) ** 2)
  }

  integratedDistanceRows(points) {
    let distance = 0

    return points.map((point, index) => {
      if (index > 0) distance += this.distanceIncrement(points[index - 1], point)
      return { ...point, distance }
    })
  }

  integratedDistance(points) {
    return points.slice(1).reduce((distance, point, index) => (
      distance + this.distanceIncrement(points[index], point)
    ), 0)
  }

  distanceIncrement(start, finish) {
    const startTime = this.number(start?.t)
    const finishTime = this.number(finish?.t)
    const startSpeed = this.number(start?.hspeed)
    const finishSpeed = this.number(finish?.hspeed)
    const elapsed = finishTime - startTime
    if (![ startTime, finishTime, startSpeed, finishSpeed ].every(Number.isFinite)) return 0
    if (elapsed <= 0 || elapsed > 15) return 0

    return ((Math.abs(startSpeed) + Math.abs(finishSpeed)) / 2) * elapsed
  }

  kilometersPerHour(value, options = {}) {
    const number = this.number(value)
    if (!Number.isFinite(number)) return null

    return (options.absolute ? Math.abs(number) : number) * 3.6
  }

  syncMetricControls() {
    this.metricToggleTargets.forEach((toggle) => {
      const datasetIndex = this.unifiedChart?.data.datasets.findIndex((dataset) => dataset.metric === toggle.dataset.metric) ?? -1
      toggle.disabled = datasetIndex < 0
      toggle.closest("label")?.classList.toggle("is-unavailable", datasetIndex < 0)
    })
  }

  refreshUnifiedAxes() {
    if (!this.unifiedChart) return

    const visibleAxes = new Set(this.unifiedChart.data.datasets.filter((_dataset, index) =>
      this.unifiedChart.isDatasetVisible(index)
    ).map((dataset) => dataset.yAxisID))

    Object.entries(this.unifiedChart.options.scales).forEach(([ key, scale ]) => {
      if (key === "x") return
      scale.display = visibleAxes.has(key)
    })
  }

  shouldLoadCesium() {
    return this.hasSceneTarget && this.points.length >= 2
  }

  isCurrentConnection(generation) {
    return generation != null && this.connectionGeneration === generation
  }

  loadCharts() {
    return withTimeout(import("https://cdn.jsdelivr.net/npm/chart.js@4.4.9/+esm"), "Flight charts")
  }

  async setupScene(cesiumLoad = null, generation = this.connectionGeneration) {
    if (!this.isCurrentConnection(generation)) return
    try {
      await this.setupCesiumScene(cesiumLoad, generation)
    } catch (error) {
      if (!this.isCurrentConnection(generation)) return
      console.warn(`Cesium unavailable, showing 2D profile: ${error.message || error}`)
      this.setupSceneFallback(this.label("cesium_unavailable"))
    }
    if (!this.isCurrentConnection(generation)) return
    this.updateScrubbedElapsed(this.currentElapsed, { followCamera: false })
  }

  disposeSceneHandlers() {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    for (const [eventName, handler, target, options] of this.boundSceneHandlers || []) target?.removeEventListener(eventName, handler, options)
    this.boundSceneHandlers = []
  }

  disposeCesiumScene() {
    this.cesiumEventHelper?.removeAll()
    this.cesiumEventHelper = null
    this.sceneNotice?.remove()
    this.sceneNotice = null
    if (this.cesiumInteractionHandler && !this.cesiumInteractionHandler.isDestroyed()) this.cesiumInteractionHandler.destroy()
    this.cesiumInteractionHandler = null
    if (this.cesiumViewer && !this.cesiumViewer.isDestroyed()) this.cesiumViewer.destroy()
    this.cesiumViewer = null
    this.cesiumMarker = null
    this.sceneCanvas = null
    if (this.cesiumTileset && !this.cesiumTileset.isDestroyed()) this.cesiumTileset.destroy()
    this.cesiumTileset = null
    this.cesiumSurfaceRefinementId = null
  }

  async setupCesiumScene(cesiumLoad = null, generation = this.connectionGeneration) {
    const cesiumStartedAt = performance.now()
    const Cesium = await (cesiumLoad || this.loadCesium())
    if (!this.isCurrentConnection(generation)) return
    if (Cesium instanceof Error) throw Cesium
    this.startCesiumDiagnostics(Cesium, cesiumStartedAt)
    this.recordCesiumDiagnostic("script_loaded")

    const viewer = new Cesium.Viewer(this.sceneTarget, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      creditContainer: this.creditsTarget,
      creditViewport: this.sceneTarget,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
      scene3DOnly: true,
      terrainProvider: new Cesium.EllipsoidTerrainProvider()
    })

    this.cesiumViewer = viewer
    this.cesiumEventHelper = new Cesium.EventHelper()
    this.sceneCanvas = viewer.scene.canvas
    viewer.scene.debugShowFramesPerSecond = false
    this.configureCesiumDaylight(Cesium, viewer)
    this.configureCesiumCameraController(viewer)
    this.cesiumVisualPoints = this.points.map((point) => ({ ...point, visualAlt: point.alt }))
    this.addCesiumTrajectory(Cesium, viewer)
    this.setupCesiumMouseControls(Cesium, viewer)
    this.flyCesiumCamera(Cesium, viewer)
    viewer.scene.requestRender()
    this.recordCesiumDiagnostic("viewer_ready")

    if (this.cesiumTokenValue) {
      Cesium.Ion.defaultAccessToken = this.cesiumTokenValue
      this.loadCesiumGeography(Cesium, viewer, generation)
    } else {
      this.showSceneFallbackMessage(this.label("cesium_geography_unavailable"))
    }
  }

  async loadCesiumGeography(Cesium, viewer, generation) {
    const current = () => this.isCurrentConnection(generation) && this.cesiumViewer === viewer && !viewer.isDestroyed()
    const unavailable = (name, error) => {
      if (!current()) return
      this.recordCesiumDiagnostic(`${name}_unavailable`, { message: error.message || String(error) })
      this.showSceneFallbackMessage(this.label("cesium_geography_unavailable"))
      console.warn(`Cesium ${name} unavailable: ${error.message || error}`)
      viewer.scene.requestRender()
    }
    const terrain = withTimeout(Promise.resolve().then(() => Cesium.createWorldTerrainAsync({ requestVertexNormals: true })), "Cesium terrain")
      .then((provider) => {
        if (!current()) return
        viewer.terrainProvider = provider
        this.cesiumEventHelper.add(provider.errorEvent, (error) => {
          if (!current()) return
          viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
          unavailable("terrain", error)
        })
        viewer.scene.requestRender()
      }).catch((error) => unavailable("terrain", error))
    const imagery = withTimeout(Promise.resolve().then(() => Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL })), "Cesium imagery")
      .then((provider) => {
        if (!current()) return
        const layer = viewer.imageryLayers.addImageryProvider(provider)
        this.cesiumEventHelper.add(provider.errorEvent, (error) => {
          if (!current()) return
          viewer.imageryLayers.remove(layer, true)
          unavailable("imagery", error)
        })
        viewer.scene.requestRender()
      }).catch((error) => unavailable("imagery", error))
    const buildings = this.addCesiumBuildings(Cesium, viewer, current)
      .catch((error) => unavailable("buildings", error))
    await Promise.all([terrain, imagery, buildings])
  }

  async addCesiumBuildings(Cesium, viewer, current) {
    let acceptingTileset = true
    const tilesetRequest = Promise.resolve().then(() => this.createCesiumIonTileset(Cesium))
    tilesetRequest.then((tileset) => {
      if ((!acceptingTileset || !current()) && !tileset.isDestroyed()) tileset.destroy()
    }, () => {})
    try {
      const tileset = await withTimeout(tilesetRequest, "Cesium tiles")
      if (!current()) return
      this.cesiumTileset = tileset
      viewer.scene.primitives.add(tileset)
      this.instrumentCesiumTileset(viewer, tileset)
      viewer.scene.requestRender()
      this.recordCesiumDiagnostic("tileset_added", this.cesiumTilesetSnapshot(tileset))
      await this.refineCesiumSurface(Cesium, viewer, tileset)
    } finally {
      acceptingTileset = false
    }
  }

  loadCesium() {
    return loadCesiumLibrary(this.cesiumBaseUrlValue)
  }

  startCesiumDiagnostics(Cesium, startedAt) {
    this.cesiumDiagnostics = {
      startedAt,
      tileProvider: CESIUM_TILE_PROVIDER,
      milestones: [],
      loadProgress: [],
      tileLoads: 0,
      tileFailures: [],
      requestScheduler: {
        maximumRequests: Cesium.RequestScheduler?.maximumRequests,
        maximumRequestsPerServer: Cesium.RequestScheduler?.maximumRequestsPerServer
      },
      tilesetOptions: this.cesiumTilesetOptions()
    }
    window.sillageCesiumDiagnostics = this.cesiumDiagnostics
    this.publishCesiumDiagnostics()
  }

  recordCesiumDiagnostic(name, details = {}) {
    if (!this.cesiumDiagnostics) return

    this.cesiumDiagnostics.milestones.push({
      name,
      elapsedMs: Math.round(performance.now() - this.cesiumDiagnostics.startedAt),
      ...details
    })
    this.publishCesiumDiagnostics()
  }

  publishCesiumDiagnostics() {
    if (!this.cesiumDiagnostics || !this.hasSceneTarget) return

    const progress = this.cesiumDiagnostics.loadProgress
    this.sceneTarget.dataset.cesiumDiagnostics = JSON.stringify({
      tileProvider: this.cesiumDiagnostics.tileProvider,
      requestScheduler: this.cesiumDiagnostics.requestScheduler,
      tilesetOptions: this.cesiumDiagnostics.tilesetOptions,
      milestones: this.cesiumDiagnostics.milestones,
      latestProgress: progress[progress.length - 1] || null,
      progressSamples: progress.length,
      tileLoads: this.cesiumDiagnostics.tileLoads,
      tileFailures: this.cesiumDiagnostics.tileFailures.length,
      lastFailure: this.cesiumDiagnostics.tileFailures[this.cesiumDiagnostics.tileFailures.length - 1] || null
    })
  }

  createCesiumIonTileset(Cesium) {
    return Cesium.createOsmBuildingsAsync(this.cesiumTilesetOptions())
  }

  cesiumTilesetOptions() {
    return {
      maximumScreenSpaceError: 48,
      skipLevelOfDetail: true,
      foveatedConeSize: 0.35,
      foveatedTimeDelay: 0.4,
      progressiveResolutionHeightFraction: 0.35
    }
  }

  instrumentCesiumTileset(viewer, tileset) {
    if (!this.cesiumDiagnostics) return

    tileset.initialTilesLoaded?.addEventListener(() => {
      this.recordCesiumDiagnostic("initial_tiles_loaded", this.cesiumTilesetSnapshot(tileset))
      this.refineCesiumTilesetQuality(viewer, tileset, 24)
    })

    tileset.allTilesLoaded?.addEventListener(() => {
      this.recordCesiumDiagnostic("all_tiles_loaded", this.cesiumTilesetSnapshot(tileset))
      window.setTimeout(() => this.refineCesiumTilesetQuality(viewer, tileset, 18), 750)
    })

    tileset.loadProgress?.addEventListener((numberOfPendingRequests, numberOfTilesProcessing) => {
      this.cesiumDiagnostics.loadProgress.push({
        elapsedMs: Math.round(performance.now() - this.cesiumDiagnostics.startedAt),
        pendingRequests: numberOfPendingRequests,
        tilesProcessing: numberOfTilesProcessing,
        tileLoads: this.cesiumDiagnostics.tileLoads
      })
      if (this.cesiumDiagnostics.loadProgress.length > 120) this.cesiumDiagnostics.loadProgress.shift()
      this.publishCesiumDiagnostics()
    })

    tileset.tileLoad?.addEventListener(() => {
      this.cesiumDiagnostics.tileLoads += 1
      if ((this.cesiumDiagnostics.tileLoads % 10) === 0) this.publishCesiumDiagnostics()
    })

    tileset.tileFailed?.addEventListener((error) => {
      this.cesiumDiagnostics.tileFailures.push({
        elapsedMs: Math.round(performance.now() - this.cesiumDiagnostics.startedAt),
        url: error?.url,
        message: error?.message
      })
      this.publishCesiumDiagnostics()
    })
  }

  refineCesiumTilesetQuality(viewer, tileset, maximumScreenSpaceError) {
    if (this.cesiumTileset !== tileset || viewer.isDestroyed()) return
    if (tileset.maximumScreenSpaceError <= maximumScreenSpaceError) return

    tileset.maximumScreenSpaceError = maximumScreenSpaceError
    this.recordCesiumDiagnostic("quality_refined", this.cesiumTilesetSnapshot(tileset))
    viewer.scene.requestRender()
  }

  cesiumTilesetSnapshot(tileset) {
    return {
      maximumScreenSpaceError: tileset.maximumScreenSpaceError,
      totalMemoryMb: Math.round((tileset.totalMemoryUsageInBytes || 0) / 1024 / 1024),
      tilesLoaded: tileset.tilesLoaded
    }
  }

  addCesiumTrajectory(Cesium, viewer) {
    const points = this.cesiumPoints()
    const positions = points.flatMap((point) => [point.lon, point.lat, this.cesiumAltitude(point)])
    const markerElapsed = this.currentElapsed
    const markerPoint = this.samplePointAtElapsed(markerElapsed, points) || points[0]
    const markerLabelPoint = this.samplePointAtElapsed(markerElapsed, this.points) || this.points[0]

    this.cesiumPath = viewer.entities.add({
      name: this.label("trajectory"),
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(positions),
        width: 5,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.22,
          color: Cesium.Color.fromCssColorString(this.colors.aqua)
        })
      }
    })

    this.cesiumMarker = viewer.entities.add({
      name: this.label("current_position"),
      position: Cesium.Cartesian3.fromDegrees(markerPoint.lon, markerPoint.lat, this.cesiumAltitude(markerPoint)),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString(this.colors.amber),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: this.markerLabel(markerLabelPoint),
        font: "12px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("rgba(7, 24, 23, 0.82)"),
        backgroundPadding: new Cesium.Cartesian2(8, 6),
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(18, -18),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })

    this.addCesiumEventMarker(Cesium, viewer, "exit", this.boundsValue.exit)
    this.addCesiumEventMarker(Cesium, viewer, "opening", this.boundsValue.opening)
    this.addCesiumEventMarker(Cesium, viewer, "landing", this.boundsValue.landing)
  }

  addCesiumEventMarker(Cesium, viewer, key, elapsed) {
    const point = this.coordinatePointAtElapsed(elapsed, this.cesiumPoints())
    if (!point) return

    viewer.entities.add({
      name: this.label(key),
      position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, this.cesiumAltitude(point)),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString(this.colors.coral),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: this.label(key),
        font: "13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })
  }

  configureCesiumDaylight(Cesium, viewer) {
    const scene = viewer.scene
    scene.backgroundColor = Cesium.Color.fromCssColorString(this.colors.daySky)
    scene.globe.baseColor = Cesium.Color.fromCssColorString(this.colors.field)
    if (scene.skyBox) scene.skyBox.show = false
    if (scene.moon) scene.moon.show = false
    if (scene.sun) scene.sun.show = true
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = false
  }

  async refineCesiumSurface(Cesium, viewer, tileset) {
    const refinementId = Symbol("cesium-surface-refinement")
    this.cesiumSurfaceRefinementId = refinementId

    const visualPoints = await this.pointsLiftedAboveCesiumSurface(Cesium, viewer, tileset)
    if (this.cesiumSurfaceRefinementId !== refinementId || this.cesiumViewer !== viewer || viewer.isDestroyed()) return

    this.cesiumVisualPoints = visualPoints
    this.refreshCesiumTrajectory(Cesium, viewer)
    this.refreshCesiumOrbitTargets()
    this.updateScrubbedElapsed(this.currentElapsed, { followCamera: false })
    viewer.scene.requestRender()
  }

  refreshCesiumTrajectory(Cesium, viewer) {
    viewer.entities.removeAll()
    this.cesiumPath = null
    this.cesiumMarker = null
    this.addCesiumTrajectory(Cesium, viewer)
  }

  refreshCesiumOrbitTargets() {
    if (this.cesiumOrbit?.targetPoint) {
      const elapsed = this.number(this.cesiumOrbit.targetPoint.t) ?? this.currentElapsed
      this.cesiumOrbit.targetPoint = this.samplePointAtElapsed(elapsed, this.cesiumPoints()) || this.cesiumOrbit.targetPoint
    }

    if (this.cesiumOrbitHome?.targetPoint) {
      const elapsed = this.number(this.cesiumOrbitHome.targetPoint.t) ?? this.currentElapsed
      this.cesiumOrbitHome.targetPoint = this.samplePointAtElapsed(elapsed, this.cesiumPoints()) || this.cesiumOrbitHome.targetPoint
    }
  }

  async pointsLiftedAboveCesiumSurface(Cesium, viewer, tileset) {
    const fallback = this.points.map((point) => ({ ...point, visualAlt: point.alt }))

    if (!viewer.scene.sampleHeightSupported || typeof viewer.scene.sampleHeightMostDetailed !== "function") {
      return fallback
    }

    try {
      if (tileset.readyPromise) await withTimeout(tileset.readyPromise, "Cesium surface")
      if (this.cesiumViewer !== viewer || viewer.isDestroyed()) return fallback

      const samplePairs = this.cesiumSurfaceSamplePairs()
      const cartographics = samplePairs.map(({ point }) =>
        Cesium.Cartographic.fromDegrees(point.lon, point.lat, point.alt)
      )
      const sampled = await withTimeout(viewer.scene.sampleHeightMostDetailed(cartographics, [], 2.0), "Cesium surface samples")
      if (this.cesiumViewer !== viewer || viewer.isDestroyed()) return fallback
      const sampledHeightsByIndex = new Map()
      sampled.forEach((position, sampleIndex) => {
        sampledHeightsByIndex.set(samplePairs[sampleIndex].index, this.number(position?.height))
      })
      const sampledIndexes = Array.from(sampledHeightsByIndex.keys())
        .filter((index) => Number.isFinite(sampledHeightsByIndex.get(index)))
        .sort((a, b) => a - b)
      const datumOffset = this.cesiumDatumOffsetFromSurface(sampledHeightsByIndex)

      const liftedPoints = this.points.map((point, index) => {
        const sampledHeight = sampledHeightsByIndex.get(index) ??
          this.interpolateCesiumSampledHeight(index, sampledHeightsByIndex, sampledIndexes)
        const datumAltitude = point.alt + datumOffset
        const visualAlt = this.shouldClampCesiumPointToSurface(index, point, sampledHeight)
          ? Math.max(datumAltitude, sampledHeight + this.cesiumSurfaceClearance(index))
          : datumAltitude

        return { ...point, groundAlt: sampledHeight, visualAlt, datumOffset }
      })

      return this.preserveCesiumDescentProfile(liftedPoints)
    } catch (error) {
      console.warn(`Cesium surface sampling unavailable: ${error.message || error}`)
      return fallback
    }
  }

  shouldClampCesiumPointToSurface(index, point, sampledHeight) {
    if (!Number.isFinite(sampledHeight)) return false
    if (index === 0 || index === this.points.length - 1) return true

    const elapsed = this.number(point?.t)
    const landing = this.number(this.boundsValue.landing)
    if (Number.isFinite(elapsed) && Number.isFinite(landing) && Math.abs(elapsed - landing) < 2) return true

    const height = this.heightFromGround(point)
    return Number.isFinite(height) && height <= 60
  }

  preserveCesiumDescentProfile(points) {
    return points.reduce((ordered, point, index) => {
      const previous = ordered[index - 1]
      if (!previous) {
        ordered.push(point)
        return ordered
      }

      const altitude = this.number(point.alt)
      const previousAltitude = this.number(points[index - 1]?.alt)
      const visualAltitude = this.number(point.visualAlt)
      const previousVisualAltitude = this.number(previous.visualAlt)

      if (
        Number.isFinite(altitude) &&
        Number.isFinite(previousAltitude) &&
        Number.isFinite(visualAltitude) &&
        Number.isFinite(previousVisualAltitude) &&
        altitude < previousAltitude &&
        visualAltitude > previousVisualAltitude
      ) {
        const altitudeLoss = previousAltitude - altitude
        const cappedVisualAltitude = previousVisualAltitude - Math.min(altitudeLoss, 0.5)
        ordered.push({ ...point, visualAlt: Math.max(cappedVisualAltitude, altitude + (this.number(point.datumOffset) || 0)) })
        return ordered
      }

      ordered.push(point)
      return ordered
    }, [])
  }

  interpolateCesiumSampledHeight(index, sampledHeightsByIndex, sampledIndexes) {
    if (!sampledIndexes.length) return null

    let previousIndex = null
    let nextIndex = null

    for (const sampledIndex of sampledIndexes) {
      if (sampledIndex <= index) previousIndex = sampledIndex
      if (sampledIndex >= index) {
        nextIndex = sampledIndex
        break
      }
    }

    previousIndex ??= sampledIndexes[0]
    nextIndex ??= sampledIndexes[sampledIndexes.length - 1]

    const previousHeight = sampledHeightsByIndex.get(previousIndex)
    const nextHeight = sampledHeightsByIndex.get(nextIndex)
    if (!Number.isFinite(previousHeight)) return nextHeight
    if (!Number.isFinite(nextHeight)) return previousHeight
    if (previousIndex === nextIndex) return previousHeight

    return this.lerp(previousHeight, nextHeight, (index - previousIndex) / (nextIndex - previousIndex))
  }

  cesiumSurfaceSamplePairs(limit = 180) {
    const requiredIndexes = new Set([
      0,
      this.points.length - 1,
      this.indexAtElapsed(this.boundsValue.exit),
      this.indexAtElapsed(this.boundsValue.opening),
      this.indexAtElapsed(this.boundsValue.landing)
    ].filter((index) => Number.isInteger(index) && index >= 0 && index < this.points.length))

    const step = Math.max(Math.ceil(this.points.length / limit), 1)
    this.points.forEach((_point, index) => {
      if ((index % step) === 0) requiredIndexes.add(index)
    })

    return Array.from(requiredIndexes).sort((a, b) => a - b).map((index) => ({
      index,
      point: this.points[index]
    }))
  }

  indexAtElapsed(elapsed) {
    if (!Number.isFinite(Number(elapsed))) return null

    return this.points.reduce((closestIndex, point, index) => {
      if (closestIndex === null) return index

      const closestDistance = Math.abs(this.number(this.points[closestIndex]?.t) - Number(elapsed))
      const pointDistance = Math.abs(this.number(point.t) - Number(elapsed))
      return pointDistance < closestDistance ? index : closestIndex
    }, null)
  }

  cesiumDatumOffsetFromSurface(sampledHeightsByIndex) {
    const landingIndex = this.points.length - 1
    const landingGroundHeight = sampledHeightsByIndex.get(landingIndex)
    if (!Number.isFinite(landingGroundHeight)) return 0

    const landingAltitude = this.number(this.points[landingIndex]?.alt)
    if (!Number.isFinite(landingAltitude)) return 0

    return this.clamp(landingGroundHeight + this.cesiumSurfaceClearance(landingIndex) - landingAltitude, 0, 120)
  }

  cesiumSurfaceClearance(index) {
    if (index === 0 || index === this.points.length - 1) return 10

    const elapsed = this.number(this.points[index]?.t)
    const opening = this.number(this.boundsValue.opening)
    const landing = this.number(this.boundsValue.landing)
    if (elapsed && opening && elapsed >= opening) return 8
    if (elapsed && landing && Math.abs(elapsed - landing) < 2) return 10

    return 18
  }

  configureCesiumCameraController(viewer) {
    const controller = viewer.scene.screenSpaceCameraController
    controller.enableCollisionDetection = false
    controller.enableInputs = false
    controller.enableLook = false
    controller.enableRotate = false
    controller.enableTilt = false
    controller.enableTranslate = false
    controller.enableZoom = false
  }

  setupCesiumMouseControls(Cesium, viewer) {
    if (this.cesiumInteractionHandler && !this.cesiumInteractionHandler.isDestroyed()) {
      this.cesiumInteractionHandler.destroy()
    }

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    this.cesiumInteractionHandler = handler
    this.addSceneHandler("wheel", (event) => event.preventDefault(), viewer.scene.canvas, { passive: false })

    handler.setInputAction((movement) => {
      this.cesiumDrag = {
        active: true,
        x: movement.position.x,
        y: movement.position.y
      }
      this.sceneTarget.classList.add("is-dragging")
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN)

    handler.setInputAction((movement) => {
      if (!this.cesiumDrag?.active || !this.cesiumOrbit) return

      const position = movement.endPosition
      const dx = position.x - this.cesiumDrag.x
      const dy = position.y - this.cesiumDrag.y
      this.cesiumDrag = { active: true, x: position.x, y: position.y }
      this.cesiumOrbit.heading -= dx * 0.006
      this.cesiumOrbit.pitch = this.clamp(
        this.cesiumOrbit.pitch + dy * 0.004,
        Cesium.Math.toRadians(-82),
        Cesium.Math.toRadians(-8)
      )
      this.applyCesiumOrbit(Cesium, viewer)
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

    handler.setInputAction(() => this.endCesiumDrag(), Cesium.ScreenSpaceEventType.LEFT_UP)
    handler.setInputAction(() => this.resetCamera(), Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    handler.setInputAction((delta) => {
      if (!this.cesiumOrbit) return

      const wheel = typeof delta === "number" ? delta : delta?.deltaY || 0
      const factor = wheel > 0 ? 1.12 : 0.88
      this.cesiumOrbit.range = this.clamp(
        this.cesiumOrbit.range * factor,
        this.cesiumOrbit.minRange,
        this.cesiumOrbit.maxRange
      )
      this.applyCesiumOrbit(Cesium, viewer)
    }, Cesium.ScreenSpaceEventType.WHEEL)
  }

  endCesiumDrag() {
    this.cesiumDrag = { active: false, x: 0, y: 0 }
    this.sceneTarget.classList.remove("is-dragging")
  }

  flyCesiumCamera(Cesium, viewer) {
    const visualPoints = this.cesiumPoints()
    const start = visualPoints[0]
    const end = visualPoints[visualPoints.length - 1]
    const heading = this.flightHeadingRadians(start, end) + Math.PI
    const range = this.cesiumOverviewRange(visualPoints)
    const focus = this.coordinatePointAtElapsed(this.boundsValue.exit, visualPoints) || start

    this.cesiumOrbitHome = {
      targetPoint: focus,
      heading,
      pitch: Cesium.Math.toRadians(-22),
      range,
      minRange: 40,
      maxRange: Math.max(range * 5, 1_600)
    }
    this.cesiumOrbit = { ...this.cesiumOrbitHome }
    this.applyCesiumOrbit(Cesium, viewer)
  }

  cesiumOverviewRange(points) {
    const altitudes = points
      .map((point) => this.cesiumAltitude(point))
      .filter((altitude) => Number.isFinite(altitude))
    const altitudeSpan = altitudes.length ? Math.max(...altitudes) - Math.min(...altitudes) : 0
    const routeDistance = this.routeDistanceMeters()

    return this.clamp(Math.max(routeDistance * 1.45, altitudeSpan * 3.2), 900, 14_000)
  }

  applyCesiumOrbit(Cesium, viewer) {
    if (!this.cesiumOrbit?.targetPoint) return

    const target = this.cesiumOrbit.targetPoint
    const targetPosition = Cesium.Cartesian3.fromDegrees(target.lon, target.lat, this.cesiumAltitude(target) + 18)
    viewer.camera.lookAt(
      targetPosition,
      new Cesium.HeadingPitchRange(
        this.cesiumOrbit.heading,
        this.cesiumOrbit.pitch,
        this.cesiumOrbit.range
      )
    )
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    viewer.scene.requestRender()
  }

  createTimeChart(target, datasets, scales) {
    const usableDatasets = datasets.filter((dataset) => dataset.data.length > 0)
    if (usableDatasets.length === 0) return null

    return this.createChart(target, {
      type: "line",
      data: { datasets: usableDatasets },
      options: this.chartOptions({ x: this.timeAxis(), ...scales }, true)
    })
  }

  createChart(target, config) {
    const chart = new this.Chart(target, config)
    this.charts.push(chart)
    this.installChartSync(chart)
    return chart
  }

  chartOptions(scales, showBounds) {
    return {
      animation: false,
      maintainAspectRatio: false,
      normalized: true,
      parsing: false,
      events: [],
      elements: {
        line: { borderWidth: 1.6 },
        point: { radius: 0, hoverRadius: 3 }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          position: this.tooltipPosition,
          padding: 7,
          boxWidth: 9,
          boxHeight: 9,
          boxPadding: 2,
          caretSize: 4,
          cornerRadius: 3,
          titleFont: { size: 11, weight: "600" },
          bodyFont: { size: 11 },
          filter: (item) => this.unifiedChart?.isDatasetVisible(item.datasetIndex) ?? true,
          callbacks: {
            title: (items) => this.formatTimer(this.chartItemElapsed(items[0])),
            label: (item) => {
              const value = this.number(item.raw?.y)
              const unit = item.dataset.unit || ""
              return `${item.dataset.label}: ${Number.isFinite(value) ? value.toFixed(value >= 100 ? 0 : 1) : "—"}${unit ? ` ${unit}` : ""}`
            }
          }
        },
        osBounds: showBounds ? { bounds: this.boundsValue, labels: this.labelsValue } : false,
        osPlayback: {
          elapsed: this.currentElapsed,
          color: this.colors.night,
          pointColor: this.colors.night
        }
      },
      scales
    }
  }

  installChartSync(chart) {
    const canvas = chart.canvas
    this.addSceneHandler("pointermove", (event) => {
      if (this.isPlaying && event.buttons === 0) return
      if (event.buttons > 0) this.pausePlayback()

      this.updateFromChartEvent(chart, event)
    }, canvas)
    this.addSceneHandler("pointerdown", (event) => {
      this.pausePlayback()
      canvas.setPointerCapture?.(event.pointerId)
      this.updateFromChartEvent(chart, event)
    }, canvas)
    this.addSceneHandler("pointerup", (event) => {
      canvas.releasePointerCapture?.(event.pointerId)
    }, canvas)
    this.addSceneHandler("pointercancel", (event) => {
      canvas.releasePointerCapture?.(event.pointerId)
    }, canvas)
  }

  updateFromChartEvent(chart, event) {
    const elapsed = this.elapsedFromChartEvent(chart, event)
    if (!Number.isFinite(elapsed)) return

    this.updateScrubbedElapsed(elapsed, { followCamera: false })
  }

  elapsedFromChartEvent(chart, event) {
    const position = this.chartEventPosition(chart, event)
    if (!position || !this.positionInsideChartArea(chart, position)) return null

    const elapsed = chart.scales?.x?.getValueForPixel(position.x)
    return Number.isFinite(Number(elapsed)) ? this.clamp(Number(elapsed), this.timelineStart, this.flightDuration || 0) : null
  }

  chartEventPosition(chart, event) {
    const rect = chart.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null

    return {
      x: (event.clientX - rect.left) * (chart.width / rect.width),
      y: (event.clientY - rect.top) * (chart.height / rect.height)
    }
  }

  positionInsideChartArea(chart, position) {
    const area = chart.chartArea
    if (!area) return false

    return position.x >= area.left && position.x <= area.right && position.y >= area.top && position.y <= area.bottom
  }

  chartItemElapsed(item) {
    return this.dataElapsed(item?.raw) ?? this.number(item?.parsed?.x)
  }

  dataElapsed(point) {
    const elapsed = this.number(point?.t)
    if (Number.isFinite(elapsed)) return elapsed

    return this.number(point?.x)
  }

  metricDataset(metric, label, rows, valueForRow, color, axis, unit, visible) {
    return {
      metric,
      label,
      unit,
      data: rows.map((row) => ({ x: this.number(row.t), y: this.number(valueForRow(row)) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
      borderColor: color,
      backgroundColor: color,
      yAxisID: axis,
      hidden: !visible,
      spanGaps: true,
      tension: 0.16
    }
  }

  sensorRows(type) {
    return this.sensors.filter((sample) => sample.type === type)
  }

  pressureAltitudeRows() {
    return this.sensorRows("BARO").filter((sample) => Number.isFinite(this.number(sample.readings?.pressure_altitude_m)))
  }

  enrichedSensorSamples(samples) {
    const pressureSpeeds = this.pressureSpeedsBySample(samples)

    return samples.map((sample) => {
      const readings = { ...(sample.readings || {}) }

      if (sample.type === "BARO") {
        readings.pressure_vertical_speed_mps = pressureSpeeds.get(sample)
      }

      return { ...sample, readings }
    })
  }

  pressureSpeedsBySample(samples) {
    const baroSamples = samples.filter((sample) =>
      sample.type === "BARO" &&
      Number.isFinite(this.number(sample.t)) &&
      Number.isFinite(this.number(sample.readings?.pressure_altitude_m))
    )
    const speeds = new Map()

    baroSamples.forEach((sample, index) => {
      const speed = this.robustPressureVerticalSpeed(baroSamples, index)
      if (Number.isFinite(speed)) speeds.set(sample, speed)
    })

    return speeds
  }

  robustPressureVerticalSpeed(samples, index) {
    const centerTime = this.number(samples[index]?.t)
    if (!Number.isFinite(centerTime)) return null

    const windowRows = samples.filter((sample) => Math.abs(this.number(sample.t) - centerTime) <= 2.0)
    const slopes = []

    windowRows.forEach((start, startIndex) => {
      windowRows.slice(startIndex + 1).forEach((finish) => {
        const startTime = this.number(start.t)
        const finishTime = this.number(finish.t)
        const duration = finishTime - startTime
        if (duration < 0.25) return

        const startAltitude = this.number(start.readings?.pressure_altitude_m)
        const finishAltitude = this.number(finish.readings?.pressure_altitude_m)
        if (!Number.isFinite(startAltitude) || !Number.isFinite(finishAltitude)) return

        slopes.push((startAltitude - finishAltitude) / duration)
      })
    })

    const speed = this.median(slopes)
    return this.cleanTrajectorySpeed(speed)
  }

  cleanTrajectorySpeed(speed) {
    const value = this.number(speed)
    if (!Number.isFinite(value)) return null
    if (Math.abs(value) > 140) return null

    return value
  }

  median(values) {
    return median(values)
  }

  normalizedSensorSample(sample) {
    const readings = { ...(sample.readings || {}) }
    if (sample.type === "BARO" && !Number.isFinite(this.number(readings.pressure_altitude_m))) {
      readings.pressure_altitude_m = pressureAltitudeFromPascals(readings.pressure)
    }

    return { ...sample, readings }
  }

  timeAxis() {
    return {
      type: "linear",
      position: "bottom",
      min: this.timelineStart,
      max: this.flightDuration,
      border: { color: this.colors.carbon },
      grid: { color: this.colors.grid },
      title: { display: false, text: this.label("time"), color: this.colors.graphite },
      ticks: {
        color: this.colors.graphite,
        font: { family: this.colors.monoFont, size: 11 },
        maxTicksLimit: 8,
        callback: (value) => this.formatTimer(value)
      }
    }
  }

  axis(position, title, drawGrid = true) {
    return {
      type: "linear",
      position,
      border: { color: this.colors.carbon },
      title: { display: true, text: title, color: this.colors.graphite },
      grid: { drawOnChartArea: drawGrid, color: this.colors.grid },
      ticks: {
        color: this.colors.graphite,
        font: { family: this.colors.monoFont, size: 11 },
        maxTicksLimit: 6
      }
    }
  }

  addSceneHandler(eventName, handler, target = this.sceneCanvas, options = undefined) {
    target.addEventListener(eventName, handler, options)
    this.boundSceneHandlers.push([eventName, handler, target, options])
  }

  setupSceneFallback(message) {
    this.disposeSceneHandlers()
    this.disposeCesiumScene()
    this.sceneTarget.replaceChildren()
    const canvas = document.createElement("canvas")
    canvas.className = "trajectory-canvas"
    this.sceneTarget.appendChild(canvas)
    this.sceneCanvas = canvas
    this.showSceneFallbackMessage(message)
    this.showSceneFallback(canvas)
    this.resizeObserver = new ResizeObserver(() => this.showSceneFallback(canvas))
    this.resizeObserver.observe(this.sceneTarget)
  }

  showSceneFallback(canvas) {
    const context = canvas.getContext("2d")
    const width = canvas.clientWidth || 640
    const height = canvas.clientHeight || 360
    canvas.width = width
    canvas.height = height
    if (!context) return

    context.fillStyle = this.colors.daySky
    context.fillRect(0, 0, width, height)
    context.strokeStyle = this.colors.aqua
    context.lineWidth = 2
    context.beginPath()
    const heightSpan = this.points.reduce((maximum, point) => Math.max(maximum, this.heightFromGround(point) ?? 0), 1)
    this.points.forEach((point, index) => {
      const x = (index / Math.max(this.points.length - 1, 1)) * width
      const y = height - ((this.heightFromGround(point) ?? 0) / heightSpan) * height * 0.78 - 24
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  }

  showSceneFallbackMessage(message) {
    const note = this.sceneNotice ||= document.createElement("div")
    note.className = "trajectory-notice"
    note.textContent = message
    this.sceneTarget.appendChild(note)
  }

  updateScrubbedElapsed(elapsed, options = {}) {
    const followCamera = options.followCamera !== false
    const syncVideo = options.syncVideo !== false
    const clampedElapsed = this.clamp(elapsed || 0, this.phaseStart(), this.phaseEnd())
    const point = this.telemetryPointAtElapsed(clampedElapsed)
    const visualPoint = this.coordinatePointAtElapsed(clampedElapsed, this.cesiumPoints())
    this.currentElapsed = clampedElapsed

    if (this.hasScrubberTarget && this.phaseSpan() > 0) {
      this.scrubberTarget.value = Math.round(((clampedElapsed - this.phaseStart()) / this.phaseSpan()) * 1000)
    }

    if (visualPoint && this.cesiumMarker && window.Cesium) {
      this.cesiumMarker.position = window.Cesium.Cartesian3.fromDegrees(
        visualPoint.lon,
        visualPoint.lat,
        this.cesiumAltitude(visualPoint)
      )
      this.cesiumMarker.label.text = this.markerLabel(point)
      if (followCamera && this.cesiumOrbit) {
        this.cesiumOrbit.targetPoint = visualPoint
        this.applyCesiumOrbit(window.Cesium, this.cesiumViewer)
      }
      this.cesiumViewer?.scene.requestRender()
    }

    if (this.hasTimeLabelTarget) this.timeLabelTarget.textContent = this.playbackTimeLabel(clampedElapsed)
    this.updateChartsPlaybackCursor(clampedElapsed)
    if (syncVideo) this.syncVideoToElapsed(clampedElapsed)
  }

  updateChartsPlaybackCursor(elapsed) {
    this.charts.forEach((chart) => {
      const playback = chart.options?.plugins?.osPlayback
      if (!playback) return

      playback.elapsed = elapsed
      const activeElements = this.chartActiveElementsAtElapsed(chart, elapsed)
      chart.setActiveElements(activeElements)
      chart.tooltip?.setActiveElements(activeElements, this.chartTooltipPosition(chart, activeElements, elapsed))
      chart.update("none")
    })
  }

  chartActiveElementsAtElapsed(chart, elapsed) {
    return chart.data.datasets.filter((dataset) => dataset.data.length > 0).map((dataset) => {
      const datasetIndex = chart.data.datasets.indexOf(dataset)
      const index = this.nearestDataIndexAtElapsed(dataset.data, elapsed)
      if (index === null) return null

      return { datasetIndex, index }
    }).filter(Boolean)
  }

  nearestDataIndexAtElapsed(data, elapsed) {
    if (!data?.length || !Number.isFinite(Number(elapsed))) return null

    let low = 0
    let high = data.length - 1

    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      const middleElapsed = this.dataElapsed(data[middle])
      if (!Number.isFinite(middleElapsed)) return this.nearestDataIndexAtElapsedLinear(data, elapsed)
      if (middleElapsed < elapsed) low = middle + 1
      else high = middle
    }

    const candidates = [ low, low - 1, low + 1 ].filter((index) => index >= 0 && index < data.length)
    return candidates.reduce((closestIndex, index) => {
      if (closestIndex === null) return index

      const closestDistance = Math.abs(this.dataElapsed(data[closestIndex]) - elapsed)
      const distance = Math.abs(this.dataElapsed(data[index]) - elapsed)
      return distance < closestDistance ? index : closestIndex
    }, null)
  }

  nearestDataIndexAtElapsedLinear(data, elapsed) {
    return data.reduce((closestIndex, point, index) => {
      const pointElapsed = this.dataElapsed(point)
      if (!Number.isFinite(pointElapsed)) return closestIndex
      if (closestIndex === null) return index

      const closestDistance = Math.abs(this.dataElapsed(data[closestIndex]) - elapsed)
      const distance = Math.abs(pointElapsed - elapsed)
      return distance < closestDistance ? index : closestIndex
    }, null)
  }

  chartTooltipPosition(chart, activeElements, elapsed) {
    const firstElement = activeElements[0]
    if (firstElement) {
      const point = chart.getDatasetMeta(firstElement.datasetIndex)?.data?.[firstElement.index]
      if (point) return { x: point.x, y: point.y }
    }

    const area = chart.chartArea
    const x = chart.scales?.x?.getPixelForValue(elapsed)
    return {
      x: Number.isFinite(x) ? x : area?.left || 0,
      y: area ? area.top : 0
    }
  }

  installTooltipPositioner(Tooltip) {
    if (!Tooltip?.positioners) return false
    if (Tooltip.positioners.osAwayFromPoint) return true

    Tooltip.positioners.osAwayFromPoint = function(elements, eventPosition) {
      const element = elements.find((item) => item?.element)?.element
      const point = element?.tooltipPosition ? element.tooltipPosition() : eventPosition
      const area = this.chart?.chartArea
      if (!point || !area) return eventPosition

      const width = this.width || 260
      const height = this.height || 110
      const gap = 14
      const inset = 8
      const room = {
        left: point.x - area.left,
        right: area.right - point.x,
        top: point.y - area.top,
        bottom: area.bottom - point.y
      }

      if (room.right >= width + gap || room.left >= width + gap) {
        const placeRight = room.right >= width + gap || room.right >= room.left

        return {
          x: placeRight ? Math.min(point.x + gap, area.right - inset) : Math.max(point.x - gap, area.left + inset),
          y: clampTooltipAnchor(point.y, area.top + inset, area.bottom - inset),
          xAlign: placeRight ? "left" : "right",
          yAlign: tooltipVerticalAlign(point.y, height, room)
        }
      }

      if (room.bottom >= height + gap || room.bottom >= room.top) {
        return {
          x: clampTooltipAnchor(point.x, area.left + inset, area.right - inset),
          y: Math.min(point.y + gap, area.bottom - inset),
          xAlign: "center",
          yAlign: "top"
        }
      }

      return {
        x: clampTooltipAnchor(point.x, area.left + inset, area.right - inset),
        y: Math.max(point.y - gap, area.top + inset),
        xAlign: "center",
        yAlign: "bottom"
      }
    }

    return true
  }

  telemetryPointAtElapsed(elapsed) {
    const pressurePoint = this.pressureAltitudePointAtElapsed(elapsed)
    const gpsPoint = this.coordinatePointAtElapsed(elapsed, this.points)
    const point = gpsPoint || pressurePoint
    if (!point) return null
    if (!pressurePoint) return point

    return {
      ...point,
      alt: pressurePoint.alt,
      height: this.heightFromGround(pressurePoint),
      vspeed: pressurePoint.vspeed ?? point.vspeed
    }
  }

  coordinatePointAtElapsed(elapsed, points = this.points) {
    if (!points?.length || !Number.isFinite(Number(elapsed))) return null

    const firstTime = this.number(points[0].t) ?? 0
    if (elapsed < firstTime) return null

    return this.samplePointAtElapsed(elapsed, points)
  }

  pressureAltitudePointAtElapsed(elapsed) {
    const rows = this.pressureAltitudeRows()
    if (!rows.length || !Number.isFinite(Number(elapsed))) return null

    const sampled = this.sampleSensorRowsAtElapsed(elapsed, rows, "pressure_altitude_m")
    if (!sampled) return null

    return {
      t: elapsed,
      alt: sampled.value,
      height: this.heightFromGround({ alt: sampled.value }),
      vspeed: sampled.row?.readings?.pressure_vertical_speed_mps
    }
  }

  sampleSensorRowsAtElapsed(elapsed, rows, key) {
    return sampleSensorValue(elapsed, rows, key)
  }

  samplePointAtElapsed(elapsed, points = this.points) {
    return sampleFlightPoint(elapsed, points)
  }

  lerp(a, b, ratio) {
    return lerp(a, b, ratio)
  }

  designColors() {
    const styles = getComputedStyle(document.documentElement)
    return {
      night: styles.getPropertyValue("--ds-night").trim() || "#071817",
      daySky: "#b9dcf2",
      aqua: styles.getPropertyValue("--ds-aqua").trim() || "#28bfb8",
      sky: styles.getPropertyValue("--ex-sky-500").trim() || "#2ea8ff",
      field: styles.getPropertyValue("--ex-field-500").trim() || "#4f7b4e",
      amber: styles.getPropertyValue("--ds-amber").trim() || "#d89122",
      violet: styles.getPropertyValue("--ds-violet").trim() || "#6658c7",
      coral: styles.getPropertyValue("--ds-coral").trim() || "#e85d4f",
      lime: styles.getPropertyValue("--ds-lime").trim() || "#a7c83f",
      graphite: styles.getPropertyValue("--ex-graphite-600").trim() || "#5f6c6b",
      carbon: styles.getPropertyValue("--ex-line-200").trim() || "#d4dfdc",
      grid: "rgba(95, 108, 107, 0.14)",
      monoFont: styles.getPropertyValue("--font-mono").trim() || "monospace"
    }
  }

  cesiumPoints() {
    return this.cesiumVisualPoints || this.points
  }

  cesiumAltitude(point) {
    return this.number(point?.visualAlt) ?? this.number(point?.alt) ?? 0
  }

  routeDistanceMeters() {
    const integratedDistance = this.integratedDistance(this.points)
    if (integratedDistance > 0) return integratedDistance

    const first = this.points[0]
    const last = this.points[this.points.length - 1]
    if (!first || !last) return 1_000

    const lat = ((first.lat + last.lat) / 2) * Math.PI / 180
    const dx = (last.lon - first.lon) * Math.cos(lat) * 111_320
    const dy = (last.lat - first.lat) * 111_320
    return Math.sqrt(dx ** 2 + dy ** 2)
  }

  flightHeadingRadians(start, end) {
    const lat1 = start.lat * Math.PI / 180
    const lat2 = end.lat * Math.PI / 180
    const dLon = (end.lon - start.lon) * Math.PI / 180
    const y = Math.sin(dLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    return Math.atan2(y, x)
  }

  clamp(value, min, max) {
    return clamp(value, min, max)
  }

  number(value) {
    if (value === null || value === undefined || value === "") return null

    return finiteNumber(value)
  }

  groundAltitudeFromPoints() {
    const altitudes = this.points.map((point) => this.number(point.alt)).filter((value) => Number.isFinite(value))
    if (!altitudes.length) return null

    return Math.min(...altitudes)
  }

  groundAltitudeFromAnalysis() {
    const altitude = this.number(this.analysis?.altitude_min)
    if (Number.isFinite(altitude)) return altitude

    const pressureAltitudes = this.pressureAltitudeRows()
      .map((sample) => this.number(sample.readings?.pressure_altitude_m))
      .filter((value) => Number.isFinite(value))
    if (pressureAltitudes.length > 0) return Math.min(...pressureAltitudes)

    return this.groundAltitudeFromPoints()
  }

  heightFromGround(point) {
    const height = this.number(point?.height)
    if (Number.isFinite(height)) return height

    const altitude = this.number(point?.alt)
    if (!Number.isFinite(altitude) || !Number.isFinite(this.groundAltitude)) return null

    return Math.max(altitude - this.groundAltitude, 0)
  }

  label(key) {
    return this.labelsValue[key] || key
  }

  markerLabel(point) {
    if (!point) return ""

    return [
      this.formatTimer(point.t),
      `${this.label("marker_height")} ${this.formatMetric(this.heightFromGround(point), this.label("meters"), 0)}  ` +
        `${this.label("marker_altitude")} ${this.formatMetric(point.alt, this.label("meters"), 0)}`,
      `${this.label("marker_hspeed")} ${this.formatMetric(point.hspeed, this.label("meters_per_second"), 1)}  ` +
        `${this.label("marker_vspeed")} ${this.formatMetric(point.vspeed, this.label("meters_per_second"), 1)}`,
      `${this.label("glide")} ${this.formatNumber(point.glide, 2)}`
    ].join("\n")
  }

  formatMetric(value, unit, digits) {
    const number = this.number(value)
    if (!Number.isFinite(number)) return `- ${unit}`

    return `${number.toFixed(digits)} ${unit}`
  }

  formatNumber(value, digits) {
    const number = this.number(value)
    return Number.isFinite(number) ? number.toFixed(digits) : "-"
  }

  playbackTimeLabel(elapsed) {
    return `${this.formatTimer(elapsed)} / ${this.formatSeconds(this.phaseSpan())}`
  }

  formatTimer(elapsed) {
    const relativeElapsed = this.elapsedFromExit(elapsed)
    if (!Number.isFinite(relativeElapsed)) return "T --:--"

    const prefix = relativeElapsed < 0 ? "T-" : "T+"
    return `${prefix}${this.formatSeconds(Math.abs(relativeElapsed))}`
  }

  formatSeconds(value) {
    const seconds = Math.max(0, Math.round(value || 0))
    const minutes = Math.floor(seconds / 60)
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  }

  elapsedFromExit(elapsed) {
    const elapsedSeconds = this.number(elapsed)
    if (!Number.isFinite(elapsedSeconds)) return null

    return elapsedSeconds - this.exitElapsed()
  }

  exitElapsed() {
    const exit = this.number(this.boundsValue?.exit)
    return Number.isFinite(exit) ? exit : 0
  }

  timelineStartFromData() {
    const analyzedStart = this.number(this.analysis?.timeline_start)
    if (Number.isFinite(analyzedStart)) return analyzedStart

    const values = [
      ...this.points.map((point) => this.number(point.t)),
      ...this.sensors.map((sample) => this.number(sample.t))
    ].filter((value) => Number.isFinite(value))

    return values.length > 0 ? Math.min(...values) : 0
  }

  timelineEndFromData() {
    const analyzedEnd = this.number(this.analysis?.timeline_end)
    const values = [
      ...this.points.map((point) => this.number(point.t)),
      ...this.sensors.map((sample) => this.number(sample.t))
    ].filter((value) => Number.isFinite(value))
    const fallbackEnd = values.length > 0 ? Math.max(...values) : 0
    const end = Number.isFinite(analyzedEnd) ? analyzedEnd : fallbackEnd

    return Math.max(end, this.timelineStart)
  }

  defaultElapsed() {
    return this.clamp(this.exitElapsed(), this.timelineStart, this.flightDuration || 0)
  }
}

function clampTooltipAnchor(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function tooltipVerticalAlign(pointY, height, room) {
  const halfHeight = height / 2
  if (room.top < halfHeight) return "top"
  if (room.bottom < halfHeight) return "bottom"

  return "center"
}

const OS_BOUNDS_PLUGIN = {
  id: "osBounds",
  beforeDatasetsDraw(chart, _args, options) {
    if (!options?.bounds) return

    const area = chart.chartArea
    const xScale = chart.scales?.x
    if (!xScale || !area) return

    const phases = [
      ["Plane", xScale.min, Number(options.bounds.exit), "rgba(46, 168, 255, 0.045)"],
      ["Jump", Number(options.bounds.exit), Number(options.bounds.opening), "rgba(47, 214, 198, 0.055)"],
      ["Canopy", Number(options.bounds.opening), Number(options.bounds.landing), "rgba(79, 123, 78, 0.09)"]
    ].filter(([, start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    const ctx = chart.ctx

    ctx.save()
    ctx.textBaseline = "top"
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace"
    phases.forEach(([ label, start, end, color ]) => {
      const visibleStart = Math.max(start, xScale.min)
      const visibleEnd = Math.min(end, xScale.max)
      if (visibleEnd <= visibleStart) return

      const x = xScale.getPixelForValue(visibleStart)
      const width = xScale.getPixelForValue(visibleEnd) - x
      ctx.fillStyle = color
      ctx.fillRect(x, area.top, width, area.bottom - area.top)
      if (width > 54) {
        ctx.fillStyle = "rgba(36, 49, 51, 0.56)"
        ctx.fillText(label.toUpperCase(), x + 8, area.top + 8)
      }
    })
    ctx.restore()
  },
  afterDatasetsDraw(chart, _args, options) {
    if (!options?.bounds) return

    const area = chart.chartArea
    const xScale = chart.scales?.x
    if (!xScale || !area) return

    const ctx = chart.ctx
    const labels = options.labels || {}
    const bounds = [
      ["exit", options.bounds.exit],
      ["opening", options.bounds.opening],
      ["landing", options.bounds.landing]
    ].filter(([, value]) => Number.isFinite(Number(value)))

    ctx.save()
    ctx.textBaseline = "top"
    ctx.font = "11px sans-serif"
    bounds.forEach(([key, value]) => {
      const x = xScale.getPixelForValue(Number(value))
      if (x < area.left || x > area.right) return

      ctx.strokeStyle = "rgba(232, 93, 79, 0.48)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, area.top)
      ctx.lineTo(x, area.bottom)
      ctx.stroke()

      const placeAfterLine = key === "landing"
      ctx.fillStyle = "rgba(36, 49, 51, 0.56)"
      ctx.textAlign = placeAfterLine ? "left" : "right"
      ctx.fillText(labels[key] || key, x + (placeAfterLine ? 5 : -5), area.top + 4)
    })
    ctx.restore()
  }
}

const OS_PLAYBACK_PLUGIN = {
  id: "osPlayback",
  afterDatasetsDraw(chart, _args, options) {
    const elapsed = Number(options?.elapsed)
    if (!Number.isFinite(elapsed)) return

    const area = chart.chartArea
    const xScale = chart.scales?.x
    if (!xScale || !area) return

    const ctx = chart.ctx
    ctx.save()
    ctx.strokeStyle = options.color || "rgba(216, 145, 34, 0.9)"
    ctx.lineWidth = 2
    const x = xScale.getPixelForValue(elapsed)
    if (x >= area.left && x <= area.right) {
      ctx.beginPath()
      ctx.moveTo(x, area.top)
      ctx.lineTo(x, area.bottom)
      ctx.stroke()
    }

    ctx.fillStyle = options.pointColor || options.color || "rgba(216, 145, 34, 0.9)"
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)"
    chart.getActiveElements().forEach(({ datasetIndex, index }) => {
      const point = chart.getDatasetMeta(datasetIndex)?.data?.[index]
      if (!point) return
      if (point.x < area.left || point.x > area.right || point.y < area.top || point.y > area.bottom) return

      ctx.beginPath()
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.stroke()
    })
    ctx.restore()
  }
}

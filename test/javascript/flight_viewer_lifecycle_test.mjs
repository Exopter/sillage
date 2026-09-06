import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import * as resources from "../../app/javascript/lib/viewer_resources.js"

const scripts = []
const doc = {
  querySelector: () => scripts.at(-1),
  createElement: () => Object.assign(new EventTarget(), { dataset: {}, remove() { scripts.splice(scripts.indexOf(this), 1) } }),
  head: { appendChild(script) { scripts.push(script) } }
}
const global = {}
const options = { document: doc, global, timeoutMs: 20 }
const first = resources.loadCesiumLibrary("/vendor/cesium/test/", options)
assert.equal(global.CESIUM_BASE_URL, "/vendor/cesium/test/")
assert.equal(scripts[0].src, "/vendor/cesium/test/Cesium.js")
assert.equal(first, resources.loadCesiumLibrary("/vendor/cesium/test/", options), "visits share one pending script load")
scripts[0].dispatchEvent(new Event("error"))
await assert.rejects(first, /could not be loaded/)
assert.equal(scripts.length, 0)
await assert.rejects(resources.loadCesiumLibrary("/vendor/cesium/test/", options), /timed out/)
assert.equal(scripts.length, 0)
const stale = doc.createElement(); scripts.push(stale)
const retry = resources.loadCesiumLibrary("/vendor/cesium/test/", options)
assert.equal(scripts.length, 1)
assert.notEqual(scripts[0], stale)
global.Cesium = { Viewer: "ready" }
scripts[0].dispatchEvent(new Event("load"))
assert.equal(await retry, global.Cesium)
assert.equal(await resources.loadCesiumLibrary("/vendor/cesium/test/", options), global.Cesium)
assert.equal(scripts.length, 1)

const controllerSource = (await readFile(new URL("../../app/javascript/controllers/flight_viewer_controller.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from "[^"]+"\n/gm, "")
  .replace("extends Controller", "extends class {}")
  .replace(/const TypedController = .*$/m, "const TypedController = class {}")
globalThis.viewerResources = {
  ...resources,
  withTimeout: (promise, label) => resources.withTimeout(promise, label, label === "Cesium tiles" ? 30 : 15000)
}
const geometryURL = new URL("../../app/javascript/lib/flight_geometry.js", import.meta.url).href
const pluginsURL = new URL("../../app/javascript/lib/flight_chart_plugins.js", import.meta.url).href
const { default: Viewer } = await import(`data:text/javascript;base64,${Buffer.from(`import { isFiniteNumber, normalizeFlightPoints, normalizeSensorSamples } from "${geometryURL}";
import { OS_BOUNDS_PLUGIN, OS_PLAYBACK_PLUGIN, tooltipVerticalAlign } from "${pluginsURL}";\nconst { withTimeout, loadCesiumLibrary } = globalThis.viewerResources;\n${controllerSource}`).toString("base64")}`)
const tick = () => new Promise((resolve) => setImmediate(resolve))
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function viewer() {
  return Object.assign(new Viewer(), {
    pointsValue: [], sensorsValue: [], hasSceneTarget: false,
    colors: { daySky: "#b9dcf2", aqua: "#28bfb8" },
    heightFromGround: (point) => point.alt, label: (key) => key,
    groundAltitudeFromAnalysis: () => 0, timelineStartFromData: () => 0, timelineEndFromData: () => 1,
    designColors: () => ({}), installTooltipPositioner: () => false,
    applyPhase() {}, updatePlayButton() {}, updateVideoExitLabel() {}, updateScrubbedElapsed() {}, defaultElapsed: () => 0
  })
}
const screen = viewer()
const chartLoads = [deferred(), deferred()]
let charts = 0
screen.setupCharts = () => { charts += 1 }
screen.loadCharts = () => chartLoads.shift().promise
const oldChart = chartLoads[0], currentChart = chartLoads[1]
const oldConnect = screen.connect()
screen.disconnect()
const newConnect = screen.connect()
const module = { Chart: { register() {} }, registerables: [] }
oldChart.resolve(module)
await oldConnect
assert.equal(charts, 0, "a detached generation must not create charts")
currentChart.resolve(module)
await newConnect
assert.equal(charts, 1)
let observerDisconnected = false, handlerRemoved = false
screen.resizeObserver = { disconnect() { observerDisconnected = true } }
screen.boundSceneHandlers = [() => { handlerRemoved = true }]
screen.disconnect()
assert.ok(observerDisconnected && handlerRemoved, "disconnect releases the observer and native handlers")

const offline = viewer()
offline.connectionGeneration = Symbol()
offline.points = [{ t: 0, alt: 100 }, { t: 1, alt: 0 }]
offline.loadCesium = async () => { throw new Error("WebGL unavailable") }
function sceneTarget() {
  return { children: [], replaceChildren() { this.children = [] }, appendChild(child) { this.children.push(child) } }
}
offline.sceneTarget = sceneTarget()
globalThis.document = {
  createElement(tag) {
    assert.ok(["canvas", "div"].includes(tag), "the fallback uses only native elements")
    const strokes = []
    return {
      tag, clientWidth: 640, clientHeight: 360, strokes, remove() {},
      getContext(type) {
        assert.equal(type, "2d")
        return {
          fillRect() {}, beginPath() {}, moveTo() {}, stroke() {},
          lineTo(x, y) { strokes.push([x, y]) }
        }
      }
    }
  }
}
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback }
  observe(target) { this.target = target }
  disconnect() { this.disconnected = true }
}
await offline.setupScene()
const canvas = offline.sceneCanvas, observer = offline.resizeObserver
assert.deepEqual(canvas.strokes, [[640, 336]], "engine failure draws the altitude profile")
assert.equal(offline.sceneTarget.children[1].textContent, "cesium_unavailable")
canvas.clientWidth = 1280
observer.callback()
assert.deepEqual(canvas.strokes.at(-1), [1280, 336], "the local profile adapts to resizing")
await offline.setupScene()
assert.equal(observer.disconnected, true)
assert.equal(offline.sceneTarget.children.length, 2, "reinitializing replaces the old canvas and notice")
const finalObserver = offline.resizeObserver
offline.disconnect()
assert.equal(finalObserver.disconnected, true)

const unavailable = viewer()
Object.assign(unavailable, {
  connectionGeneration: Symbol(), cesiumTokenValue: "test", points: offline.points, sceneTarget: sceneTarget(),
  loadCesium: async () => { throw new Error("offline") }
})
await unavailable.setupScene()
assert.equal(unavailable.sceneCanvas.tag, "canvas", "a failed Cesium script still draws the local profile")
assert.equal(unavailable.sceneTarget.children[1].textContent, "cesium_unavailable")
unavailable.disconnect()

function cesiumScreen() {
  const screen = viewer(), tiles = deferred(), terrain = deferred(), imagery = deferred()
  const state = { destroyed: false, handlerRemoved: false, tileDestroyed: false, addedTiles: [], imageryLayers: [], removers: [], requests: 0 }
  const event = () => new EventTarget()
  const instance = {
    scene: { canvas: {}, requestRender() {}, primitives: { add(tiles) { state.addedTiles.push(tiles) } } },
    imageryLayers: {
      addImageryProvider(provider) { state.imageryLayers.push(provider); return provider },
      remove(provider) { state.imageryLayers = state.imageryLayers.filter((entry) => entry !== provider) }
    },
    destroy() { state.destroyed = true }, isDestroyed: () => state.destroyed
  }
  const Cesium = {
    Viewer: function(_target, options) { assert.equal(options.baseLayer, false); instance.terrainProvider = options.terrainProvider; return instance },
    Ion: {}, IonWorldImageryStyle: { AERIAL: 0 }, EllipsoidTerrainProvider: class {},
    EventHelper: class {
      add(event, callback) {
        const handler = () => callback(new Error("network interrupted"))
        event.addEventListener("error", handler)
        state.removers.push(() => event.removeEventListener("error", handler))
      }
      removeAll() { for (const remove of state.removers) remove(); state.removers = [] }
    },
    createWorldTerrainAsync() { state.requests++; return terrain.promise },
    createWorldImageryAsync() { state.requests++; return imagery.promise }
  }
  Object.assign(screen, {
    connectionGeneration: Symbol(), cesiumTokenValue: "test", points: offline.points, sceneTarget: sceneTarget(),
    createCesiumIonTileset() { state.requests++; return tiles.promise }, refineCesiumSurface: async () => {},
    boundSceneHandlers: [() => { state.handlerRemoved = true }]
  })
  for (const name of ["startCesiumDiagnostics", "recordCesiumDiagnostic", "configureCesiumDaylight", "configureCesiumCameraController", "addCesiumTrajectory", "setupCesiumMouseControls", "flyCesiumCamera", "instrumentCesiumTileset", "cesiumTilesetSnapshot"]) screen[name] = () => {}
  let geography
  const loadGeography = screen.loadCesiumGeography.bind(screen)
  screen.loadCesiumGeography = (...args) => (geography = loadGeography(...args))
  return { screen, state, tiles, terrain, imagery, Cesium, event, instance, settled: () => geography }
}
const noToken = cesiumScreen()
noToken.screen.cesiumTokenValue = ""
await noToken.screen.setupScene(Promise.resolve(noToken.Cesium))
assert.equal(noToken.screen.cesiumViewer, noToken.instance, "Cesium works without an ion token")
assert.equal(noToken.state.requests, 0, "the basic globe makes no external geography requests")
assert.equal(noToken.instance.terrainProvider instanceof noToken.Cesium.EllipsoidTerrainProvider, true)
noToken.screen.disconnect()

const healthy = cesiumScreen()
await healthy.screen.setupScene(Promise.resolve(healthy.Cesium))
assert.equal(healthy.screen.cesiumViewer, healthy.instance, "3D is ready before external data resolves")
const healthyTiles = { isDestroyed: () => healthy.state.tileDestroyed, destroy() { healthy.state.tileDestroyed = true } }
const terrainProvider = { errorEvent: healthy.event() }, imageryProvider = { errorEvent: healthy.event() }
healthy.tiles.resolve(healthyTiles)
healthy.terrain.resolve(terrainProvider)
healthy.imagery.resolve(imageryProvider)
await healthy.settled()
assert.deepEqual(healthy.state.addedTiles, [healthyTiles])
assert.equal(healthy.instance.terrainProvider, terrainProvider)
assert.deepEqual(healthy.state.imageryLayers, [imageryProvider])
terrainProvider.errorEvent.dispatchEvent(new Event("error"))
imageryProvider.errorEvent.dispatchEvent(new Event("error"))
assert.equal(healthy.screen.cesiumViewer, healthy.instance, "later tile failures preserve the 3D viewer")
assert.equal(healthy.instance.terrainProvider instanceof healthy.Cesium.EllipsoidTerrainProvider, true)
assert.equal(healthy.state.imageryLayers.length, 0)
healthy.screen.disconnect()
assert.ok(healthy.state.destroyed && healthy.state.tileDestroyed && healthy.state.handlerRemoved)
assert.equal(healthy.state.removers.length, 0)

const timedOut = cesiumScreen()
await timedOut.screen.setupScene(Promise.resolve(timedOut.Cesium))
timedOut.terrain.resolve({ errorEvent: timedOut.event() })
timedOut.imagery.resolve({ errorEvent: timedOut.event() })
await timedOut.settled()
assert.equal(timedOut.screen.cesiumViewer, timedOut.instance, "a building timeout preserves 3D and the other layers")
assert.equal(timedOut.state.imageryLayers.length, 1)
timedOut.tiles.resolve({ isDestroyed: () => timedOut.state.tileDestroyed, destroy() { timedOut.state.tileDestroyed = true } })
await tick()
assert.equal(timedOut.state.tileDestroyed, true, "a tileset arriving after its deadline is released")
assert.equal(timedOut.state.addedTiles.length, 0)
timedOut.screen.disconnect()

const detached = cesiumScreen()
await detached.screen.setupScene(Promise.resolve(detached.Cesium))
detached.screen.disconnect()
detached.screen.connectionGeneration = Symbol("replacement screen")
detached.tiles.resolve({ isDestroyed: () => false, destroy() { detached.state.tileDestroyed = true } })
detached.terrain.resolve({ errorEvent: detached.event() })
detached.imagery.resolve({ errorEvent: detached.event() })
await detached.settled()
assert.equal(detached.state.tileDestroyed, true)
assert.equal(detached.state.addedTiles.length, 0)
assert.equal(detached.state.imageryLayers.length, 0)
assert.equal(detached.screen.sceneTarget.children.length, 0)

const broken = cesiumScreen()
await broken.screen.setupScene(Promise.resolve(broken.Cesium))
broken.tiles.reject(new Error("buildings unavailable"))
broken.terrain.reject(new Error("terrain unavailable"))
broken.imagery.reject(new Error("imagery unavailable"))
await broken.settled()
assert.equal(broken.state.destroyed, false, "external failures must never destroy the base 3D scene")
assert.equal(broken.screen.cesiumViewer, broken.instance)
assert.equal(broken.screen.resizeObserver, null, "2D is reserved for engine failures")
broken.screen.disconnect()
console.log("Viewer local assets, independent layers, reconnect and resource cleanup tests passed")

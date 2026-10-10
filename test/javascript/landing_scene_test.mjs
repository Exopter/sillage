import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { pathToFileURL } from "node:url"
const sceneSource = readFileSync(new URL("../../app/javascript/lib/landing_scene.js", import.meta.url), "utf8")
  .replace(/from "([^"]+)"/g, (_, specifier) => `from "${specifier === "landing_flow" ? pathToFileURL(resolve(import.meta.dirname, "../../app/javascript/lib/landing_flow.js")).href : import.meta.resolve(specifier)}"`)
const { LandingScene } = await import(`data:text/javascript;base64,${Buffer.from(sceneSource).toString("base64")}`)

// Resolve the complete local vendor graph, including transitive loader utilities.
const root = resolve(import.meta.dirname, "../..")
const version = JSON.parse(readFileSync(`${root}/package.json`, "utf8")).dependencies.three
const vendor = `${root}/public/vendor/three/${version}`
const visited = new Set()
function verifyModule(file) {
  if (visited.has(file)) return
  visited.add(file)
  assert.ok(existsSync(file), `Missing runtime dependency: ${file}`)
  const source = readFileSync(file, "utf8")
  for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    if (specifier === "three") verifyModule(`${vendor}/build/three.module.js`)
    else if (specifier.startsWith(".")) verifyModule(resolve(dirname(file), specifier))
  }
}
verifyModule(`${vendor}/examples/jsm/loaders/GLTFLoader.js`)
verifyModule(`${vendor}/examples/jsm/environments/RoomEnvironment.js`)
assert.ok(visited.has(`${vendor}/build/three.core.js`))
assert.match(readFileSync(`${root}/config/landing_importmap.rb`, "utf8"), new RegExp(`/vendor/three/${version.replaceAll(".", "\\.")}/`))

const bytes = readFileSync(`${root}/app/assets/images/blueprints/exowing-scene.glb`)
const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")
const meshes = []
model.scene.traverse((object) => { if (object.isMesh) meshes.push(object) })
assert.equal(meshes.length, 5, "All five visible assembly parts must survive export")
const bounds = new THREE.Box3().setFromObject(model.scene)
assert.ok(Math.abs(bounds.max.x - bounds.min.x - 6) < 0.03, "Normalized wing span must remain intact")
assert.ok(bytes.length < 1_500_000, "Presentation model exceeds its initial download budget")

let nextFrame = 0
const pending = new Map()
globalThis.requestAnimationFrame = (callback) => { pending.set(++nextFrame, callback); return nextFrame }
globalThis.cancelAnimationFrame = (id) => pending.delete(id)
globalThis.document = { hidden: false }
globalThis.HTMLElement = class {}
const scene = Object.assign(Object.create(LandingScene.prototype), {
  ready: true, disposed: false, paused: false, visible: true, previous: 0, elapsed: 0,
  frame: 0, tick() {}, scene: model.scene, element: { dataset: {} },
  lifetime: new AbortController(), controls: new HTMLElement()
})
scene.schedule()
assert.equal(pending.size, 1)
scene.schedule()
assert.equal(pending.size, 1, "Repeated visibility events must not multiply render loops")
for (const [object, key, value] of [[scene, "paused", true], [scene, "visible", false], [document, "hidden", true]]) {
  const old = object[key]
  object[key] = value
  scene.schedule()
  assert.equal(pending.size, 0, "Paused, offscreen and hidden scenes must stop scheduling frames")
  object[key] = old
  scene.schedule()
  assert.equal(pending.size, 1)
}
let released = 0
meshes[0].geometry.addEventListener("dispose", () => released++)
scene.dispose()
scene.dispose()
assert.equal(released, 1, "Cleanup must release GPU resources exactly once")
assert.equal(scene.lifetime.signal.aborted, true)
assert.equal(scene.controls.hidden, true)
assert.equal(scene.element.dataset.sceneState, "static")
assert.equal(pending.size, 0)
scene.schedule()
assert.equal(pending.size, 0, "A detached scene must not restart")
console.log("Landing asset graph, original assembly, animation scheduling and disposal verified.")

// Reduced motion initializes the same scene with no automatic animation.
globalThis.matchMedia = () => ({ matches: true })
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "#2fd6c6" })
const pauseButton = { textContent: "", attributes: {}, setAttribute(key, value) { this.attributes[key] = value } }
const still = new LandingScene({ querySelector: (selector) => selector === "[data-scene-pause]" ? pauseButton : null })
assert.equal(still.paused, true)
still.updatePauseLabel()
assert.equal(pauseButton.textContent, "Play motion")
still.ready = true
still.schedule()
assert.equal(pending.size, 0, "Reduced-motion startup must not animate")

// A browser without WebGL keeps its static illustration and hides dead controls.
const fallback = new LandingScene({ querySelector: () => null, dataset: {} })
const warn = console.warn
console.warn = () => {}
try { await fallback.start() } finally { console.warn = warn }
assert.equal(fallback.element.dataset.sceneState, "static")
assert.equal(fallback.disposed, true)
console.log("Reduced-motion startup and unavailable-WebGL fallback verified.")

// Camera banking must preserve the world's up direction after looking forward.
const camera = new THREE.PerspectiveCamera(36, 1.4, 0.1, 60)
const view = Object.assign(Object.create(LandingScene.prototype), {
  camera, elapsed: 8, reduced: { matches: false }, pose: new THREE.Vector2(), scroll: 0,
  renderer: { render() {} }, scene: new THREE.Scene(), disposed: false
})
view.render()
camera.updateMatrixWorld()
assert.ok(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).y > 0.5,
  "Banking must not turn a prone pilot upside down")

const pilotBytes = readFileSync(`${root}/app/assets/images/blueprints/exowing-pilot.glb`)
const pilot = await new GLTFLoader().parseAsync(pilotBytes.buffer.slice(pilotBytes.byteOffset, pilotBytes.byteOffset + pilotBytes.byteLength), "")
const helmet = pilot.scene.getObjectByName("pilot-helmet-carbon")
const pack = pilot.scene.getObjectByName("pilot-parachute-container")
const torso = pilot.scene.getObjectByName("pilot-suit-torso")
assert.ok(helmet && pack && torso, "The complete pilot and closed pack must be exported")
const helmetBounds = new THREE.Box3().setFromObject(helmet)
const visor = pilot.scene.getObjectByName("pilot-helmet-visor-upper")
assert.ok(visor, "The source visor must survive the mannequin export")
const visorCenter = new THREE.Box3().setFromObject(visor).getCenter(new THREE.Vector3())
const helmetCenter = helmetBounds.getCenter(new THREE.Vector3())
assert.ok(visorCenter.y < helmetCenter.y - 0.12,
  "The pilot must look down, with the visor below the helmet shell and the back toward the wing")
const packBounds = new THREE.Box3().setFromObject(pack)
const torsoBounds = new THREE.Box3().setFromObject(torso)
assert.ok(helmetBounds.min.z < torsoBounds.min.z, "The helmet must face the inlet")
assert.ok(packBounds.max.y > torsoBounds.max.y, "The parachute must sit on the pilot's back")
const centerBounds = new THREE.Box3().setFromObject(model.scene.getObjectByName("wing-center"))
assert.ok(torsoBounds.max.y < centerBounds.min.y, "The torso must remain below the center wing skin")
assert.ok(packBounds.min.z < centerBounds.min.z, "The dorsal pack must occupy the forward recess")

const seatBytes = readFileSync(`${root}/app/assets/images/blueprints/exowing-seat.glb`)
const seat = await new GLTFLoader().parseAsync(seatBytes.buffer.slice(seatBytes.byteOffset, seatBytes.byteOffset + seatBytes.byteLength), "")
for (const name of ["seat-shell", "seat-plate", "seat-hardware"]) {
  assert.ok(seat.scene.getObjectByName(name), `The CAD assembly must retain ${name}`)
}
const seatBounds = new THREE.Box3().setFromObject(seat.scene.getObjectByName("seat-shell"))
assert.ok(seatBounds.intersectsBox(torsoBounds), "The seat must surround the pilot's lower torso")
assert.ok(seatBounds.min.y < centerBounds.min.y && seatBounds.max.y < centerBounds.max.y,
  "The original CAD seat must sit below the wing")
view.underwing = true
view.render()
assert.ok(camera.position.y < torsoBounds.min.y, "Underwing view must reveal the seat and suspended pilot")
camera.updateMatrixWorld()
assert.ok(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).y > 0.5)

const { createFlow } = await import("../../app/javascript/lib/landing_flow.js")
const field = JSON.parse(readFileSync(`${root}/app/assets/images/blueprints/exowing-flow.json`, "utf8"))
for (const [name, asset] of [["wing", bytes], ["seat", seatBytes], ["pilot", pilotBytes]]) {
  assert.equal(field.sources[name], createHash("sha256").update(asset).digest("hex"),
    `Airflow must be regenerated after changing the ${name} geometry`)
}
assert.ok(field.paths.length > 100)
for (const path of field.paths) {
  assert.equal(path.points.length, path.times.length)
  assert.ok(path.points.every((p) => p.length === 3 && p.every(Number.isFinite)))
  assert.ok(path.times.every((time, i) => Number.isFinite(time) && (!i || time > path.times[i - 1])))
  assert.ok(path.points.at(-1)[2] > 4, "Tracers must clear the complete assembly")
}
const flow = createFlow(field, { violet: new THREE.Color(), magenta: new THREE.Color(), amber: new THREE.Color() })
assert.ok(flow.group.children.every((mesh) => mesh.material.uniforms.time === flow.time), "All tracers must share one travel clock")
assert.throws(() => createFlow({ ...field, frame: "camera" }, {}), /reference frame/)
let flowReleased = 0
flow.group.children[0].geometry.addEventListener("dispose", () => flowReleased++)
view.disposeObject(flow.group)
assert.equal(flowReleased, 1, "Shared ribbon geometry must only be disposed once")
console.log("Pilot fit, camera orientation and time-parametrized flow verified.")

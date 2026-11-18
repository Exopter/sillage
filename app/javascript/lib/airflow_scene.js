import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { WingAero, stationSample } from "wing_aero"

/** @typedef {{modelUrl: string, seatUrl: string, pilotUrl: string, sectionsUrl: string}} AirflowAssets */
/** @typedef {{roll: number, pitch: number, yaw?: number}} WingAttitude Degrees: roll positive right wing down, pitch positive nose up, yaw positive nose right of the airflow. */

const RAD = Math.PI / 180
const CENTRE = [0, 0.3, 0]                       // wing-frame point kept at the scene origin
const ROWS = [-1.0, -0.55, -0.18, 0.08, 0.42]    // smoke rake heights across the wind
const COLUMNS = 9, NODES = 110
const FILAMENTS = ROWS.length * COLUMNS, COUNT = FILAMENTS * NODES
const UPSTREAM = 5.2, LIFE_LENGTH = 13.5, FLOW_SPEED = 2.7
// Seen from the right of the wing: the nose points right and the airflow comes from the right of the picture.
const VIEWS = /** @type {const} */ ({ quarter: [11.2, 2.2, -6.4], side: [14.5, 0.4, 0.6] })

const SHADER_HEAD = `
  attribute float age; attribute float speed; attribute float seed;
  varying float vAlpha; varying vec3 vColor; varying float vSeed;
  uniform vec3 calm; uniform vec3 slow; uniform vec3 fast;
  vec3 smokeColor(float s) {
    vec3 c = mix(calm, slow, smoothstep(0.96, 0.62, s));
    return mix(c, fast, smoothstep(1.04, 1.38, s));
  }
  float fade(float a) { return smoothstep(0.0, 0.05, a) * (1.0 - smoothstep(0.72, 1.0, a)); }`

/** The wing in the tunnel airflow: the wing model follows the measured attitude and
 * smoke is advected through the flow computed around it. Never a measurement of the flow. */
export class AirflowScene {
  /** @param {HTMLElement} element @param {AirflowAssets} assets */
  constructor(element, assets) {
    this.element = element
    this.assets = assets
    this.lifetime = new AbortController()
    this.disposed = false
    this.ready = false
    this.visible = true
    this.frame = 0
    this.previous = 0
    this.time = 0
    this.emitClock = 0
    this.head = 0
    this.glideRatio = 3
    /** @type {WingAttitude | null} */
    this.attitude = null
    /** @type {import("wing_aero").WingForces | null} */
    this.forces = null
    /** @type {WingAero | null} */
    this.aero = null
    this.styles = getComputedStyle(element)
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80)
    this.rig = new THREE.Group()
    this.model = new THREE.Group()
    this.model.position.set(-CENTRE[0], -CENTRE[1], -CENTRE[2])
    this.rig.add(this.model)
    this.scene.add(this.rig)
    this.rotation = new THREE.Matrix3()
    this.windWorld = new THREE.Vector3(0, 0, 1)
    this.up = new THREE.Vector3(0, 1, 0)
    this.positions = new Float32Array(COUNT * 3)
    this.ages = new Float32Array(COUNT)
    this.speeds = new Float32Array(COUNT)
    this.born = new Float32Array(COUNT)
    this.velocity = [0, 0, 0]
    this.sample = stationSample()
    this.tick = this.tick.bind(this)
  }

  /** @param {string} token */
  color(token) { return new THREE.Color(this.styles.getPropertyValue(token).trim()) }

  async start() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.domElement.setAttribute("aria-hidden", "true")
    this.element.prepend(this.renderer.domElement)
    this.renderer.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); this.dispose() }, { signal: this.lifetime.signal })
    this.scene.fog = new THREE.FogExp2(this.color("--ex-carbon-950"), 0.028)
    const studio = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.environmentTarget = pmrem.fromScene(studio, 0.04)
    this.scene.environment = this.environmentTarget.texture
    this.scene.environmentIntensity = 0.35
    studio.dispose(); pmrem.dispose()
    this.scene.add(new THREE.HemisphereLight(this.color("--ex-vapor-150"), this.color("--ex-carbon-900"), 0.7))
    const key = new THREE.DirectionalLight(this.color("--ex-white"), 2.6)
    key.position.set(4, 7, -5)
    const rim = new THREE.DirectionalLight(this.color("--ex-khaki-300"), 1.6)
    rim.position.set(-5, 2, 6)
    this.scene.add(key, rim)
    this.setView("quarter")

    const signal = this.lifetime.signal
    const [sections, wing, seat, pilot] = await Promise.all([
      fetch(this.assets.sectionsUrl, { signal }).then((response) => { if (!response.ok) throw new Error("Wing sections unavailable"); return response.json() }),
      this.loadModel(this.assets.modelUrl), this.loadModel(this.assets.seatUrl), this.loadModel(this.assets.pilotUrl)
    ])
    if (this.disposed) return
    this.model.add(wing, seat, pilot)
    this.aero = new WingAero(/** @type {import("wing_aero").WingSections} */ (sections))
    this.buildSmoke()
    this.updateWind()
    this.applyAttitude()
    this.seedSmoke()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.element)
    this.intersection = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.schedule() })
    this.intersection.observe(this.element)
    document.addEventListener("visibilitychange", () => this.schedule(), { signal })
    this.ready = true
    this.resize()
    this.schedule()
  }

  /** @param {string} url */
  async loadModel(url) {
    const response = await fetch(url, { signal: this.lifetime.signal })
    if (!response.ok) throw new Error("Wing model unavailable")
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "")
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const originals = Array.isArray(object.material) ? object.material : [object.material]
      originals.forEach((/** @type {THREE.Material} */ original) => original.dispose())
      object.geometry.computeVertexNormals()
      object.material = this.material(object.name)
    })
    return gltf.scene
  }

  /** @param {string} name */
  material(name) {
    const base = { roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }
    if (name.startsWith("wing") || name.startsWith("fin")) return new THREE.MeshPhysicalMaterial({ ...base, color: this.color("--ex-vapor-150"), clearcoat: 0.25, clearcoatRoughness: 0.5 })
    if (name === "seat-hardware" || name.includes("buckle")) return new THREE.MeshPhysicalMaterial({ ...base, color: this.color("--ex-graphite-500"), metalness: 0.8, roughness: 0.3 })
    if (name.includes("visor")) return new THREE.MeshPhysicalMaterial({ ...base, color: this.color("--ex-carbon-950"), roughness: 0.15, clearcoat: 0.7 })
    if (name.includes("helmet")) return new THREE.MeshPhysicalMaterial({ ...base, color: this.color("--ex-vapor-150"), roughness: 0.35, clearcoat: 0.5 })
    if (name.includes("parachute") || name.includes("harness")) return new THREE.MeshPhysicalMaterial({ ...base, color: this.color("--ex-khaki-600"), roughness: 0.9 })
    return new THREE.MeshPhysicalMaterial({ ...base, color: this.color("--ex-carbon-700"), roughness: 0.85 })
  }

  buildSmoke() {
    const seeds = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) seeds[i] = Math.random()
    this.smoke = new THREE.BufferGeometry()
    this.smoke.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    this.smoke.setAttribute("age", new THREE.BufferAttribute(this.ages, 1).setUsage(THREE.DynamicDrawUsage))
    this.smoke.setAttribute("speed", new THREE.BufferAttribute(this.speeds, 1).setUsage(THREE.DynamicDrawUsage))
    this.smoke.setAttribute("seed", new THREE.BufferAttribute(seeds, 1))
    this.smoke.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60)
    this.uniforms = {
      scale: { value: 600 }, calm: { value: this.color("--ex-vapor-50") },
      slow: { value: this.color("--ex-amber-500") }, fast: { value: this.color("--ex-sky-500") }
    }
    const blend = { uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }
    this.puffs = new THREE.Points(this.smoke, new THREE.ShaderMaterial({
      ...blend,
      vertexShader: SHADER_HEAD + `
        uniform float scale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.2 + 0.5 * age + 0.08 * seed) * scale / -mv.z;
          vAlpha = fade(age) * (0.07 + 0.045 * seed) / (1.0 + 1.6 * age);
          vColor = smokeColor(speed); vSeed = seed;
        }`,
      fragmentShader: `
        varying float vAlpha; varying vec3 vColor; varying float vSeed;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float a = vSeed * 6.2832;
          p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
          float soft = smoothstep(0.5, 0.0, length(p * vec2(1.0, 1.0 + 0.45 * sin(a * 3.0))));
          float alpha = soft * soft * vAlpha;
          gl_FragColor = vec4(vColor * alpha, alpha);
        }`
    }))
    // A thin core through each filament keeps the streams readable where the puffs thin out.
    /** @type {number[]} */
    const index = []
    for (let f = 0; f < FILAMENTS; f++) for (let k = 0; k < NODES; k++) index.push(f * NODES + k, f * NODES + (k + 1) % NODES)
    this.coreGeometry = new THREE.BufferGeometry()
    for (const name of ["position", "age", "speed", "seed"]) this.coreGeometry.setAttribute(name, this.smoke.getAttribute(name))
    this.coreGeometry.setIndex(index)
    this.coreGeometry.boundingSphere = this.smoke.boundingSphere
    this.cores = new THREE.LineSegments(this.coreGeometry, new THREE.ShaderMaterial({
      ...blend,
      vertexShader: SHADER_HEAD + `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vAlpha = fade(age) * 0.3 / (1.0 + 4.0 * age); vColor = smokeColor(speed); vSeed = seed;
        }`,
      fragmentShader: "varying float vAlpha; varying vec3 vColor; void main() { gl_FragColor = vec4(vColor * vAlpha, vAlpha); }"
    }))
    this.puffs.frustumCulled = false; this.cores.frustumCulled = false
    this.scene.add(this.puffs, this.cores)
  }

  /** @param {keyof typeof VIEWS} name */
  setView(name) {
    const [x, y, z] = VIEWS[name]
    this.camera.position.set(x, y, z)
    this.camera.lookAt(0, 0, 0.4)
    this.render()
  }

  /** @param {number} ratio Tunnel glide ratio: the airflow rises at atan(1 / ratio) from the horizon. */
  setGlideRatio(ratio) {
    this.glideRatio = ratio
    this.updateWind()
  }

  /** @param {WingAttitude | null} attitude Null when no fresh attitude is received: the smoke stops. */
  setAttitude(attitude) {
    const resumed = !this.attitude && attitude
    this.attitude = attitude
    if (this.puffs && this.cores) this.puffs.visible = this.cores.visible = Boolean(attitude)
    if (resumed && this.ready) { this.applyAttitude(); this.seedSmoke() }
    this.schedule()
  }

  get airflowAngle() { return Math.atan(1 / this.glideRatio) }

  updateWind() {
    const g = this.airflowAngle
    this.windWorld.set(0, Math.sin(g), Math.cos(g))   // rising toward the back: the wing glides forward and down
    this.up.set(0, Math.cos(g), -Math.sin(g))
  }

  applyAttitude() {
    if (!this.aero) return
    const pitch = (this.attitude?.pitch ?? -this.airflowAngle / RAD) * RAD, roll = (this.attitude?.roll ?? 0) * RAD
    // Aircraft order yaw, pitch then roll, with -z forward, +x right, +y up. Yaw is measured from the airflow axis.
    this.rig.rotation.set(pitch, -(this.attitude?.yaw ?? 0) * RAD, -roll, "YXZ")
    this.rig.updateMatrixWorld(true)
    this.rotation.setFromMatrix4(this.rig.matrixWorld)
    const e = this.rotation.elements, w = this.windWorld
    this.forces = this.aero.solve(e[0] * w.x + e[1] * w.y + e[2] * w.z, e[3] * w.x + e[4] * w.y + e[5] * w.z, e[6] * w.x + e[7] * w.y + e[8] * w.z)
  }

  /** @param {number} index @param {number} filament @param {number} when */
  emit(index, filament, when) {
    const row = ROWS[Math.floor(filament / COLUMNS)], column = filament % COLUMNS
    this.positions[index * 3] = (column / (COLUMNS - 1) - 0.5) * 6.7 + (Math.random() - 0.5) * 0.05
    this.positions[index * 3 + 1] = -this.windWorld.y * UPSTREAM + this.up.y * row + (Math.random() - 0.5) * 0.05
    this.positions[index * 3 + 2] = -this.windWorld.z * UPSTREAM + this.up.z * row
    this.born[index] = when; this.speeds[index] = 1
  }

  /** Straight streams already filling the tunnel; the flow bends them within seconds. */
  seedSmoke() {
    const life = LIFE_LENGTH / FLOW_SPEED
    for (let f = 0; f < FILAMENTS; f++) for (let k = 0; k < NODES; k++) {
      const i = f * NODES + k, age = ((k + NODES - this.head) % NODES) / NODES
      this.emit(i, f, this.time - (1 - age) * life)
      const travelled = (1 - age) * LIFE_LENGTH
      this.positions[i * 3 + 1] += this.windWorld.y * travelled; this.positions[i * 3 + 2] += this.windWorld.z * travelled
    }
  }

  /** @param {number} dt */
  stepSmoke(dt) {
    const aero = this.aero, forces = this.forces
    if (!aero || !forces || !this.smoke) return
    const e = this.rotation.elements, positions = this.positions, v = this.velocity, surface = this.sample
    const life = LIFE_LENGTH / FLOW_SPEED, interval = life / NODES
    this.emitClock += dt
    while (this.emitClock >= interval) {
      this.emitClock -= interval
      for (let f = 0; f < FILAMENTS; f++) this.emit(f * NODES + this.head, f, this.time - this.emitClock)
      this.head = (this.head + 1) % NODES
    }
    const jitter = Math.sqrt(dt), lift = Math.min(Math.abs(forces.cl), 1)
    for (let i = 0, o = 0; i < COUNT; i++, o += 3) {
      const px = positions[o], py = positions[o + 1], pz = positions[o + 2]
      // Scene to wing frame: transpose of the rotation, then the model offset.
      const qx = e[0] * px + e[1] * py + e[2] * pz + CENTRE[0]
      const qy = e[3] * px + e[4] * py + e[5] * pz + CENTRE[1]
      const qz = e[6] * px + e[7] * py + e[8] * pz + CENTRE[2]
      aero.velocity(qx, qy, qz, v)
      this.speeds[i] += (Math.min(Math.hypot(v[0], v[1], v[2]), 2) - this.speeds[i]) * 0.2
      // Smoke diffuses a little everywhere and more in the wake of the wing and of the body.
      const wake = qz > 0.5 && Math.abs(qx) < 3.2 && Math.abs(qy - 0.3) < 0.45 ? 0.05 + lift * 0.1 : 0
      const bodyWake = qz > 1.6 && qx * qx + (qy + 0.33) * (qy + 0.33) < 0.4 ? 0.16 : 0
      const spread = (0.012 + wake + bodyWake) * jitter * FLOW_SPEED
      let nx = qx + v[0] * FLOW_SPEED * dt + (Math.random() - 0.5) * spread
      let ny = qy + v[1] * FLOW_SPEED * dt + (Math.random() - 0.5) * spread
      let nz = qz + v[2] * FLOW_SPEED * dt + (Math.random() - 0.5) * spread
      // Keep smoke out of the wing volume: it slides along the surface it came from.
      if (aero.surface(nx, nz, surface) && ny < surface.upper + 0.02 && ny > surface.lower - 0.02) {
        ny = qy >= (surface.upper + surface.lower) / 2 ? surface.upper + 0.02 : surface.lower - 0.02
      }
      nx -= CENTRE[0]; ny -= CENTRE[1]; nz -= CENTRE[2]
      positions[o] = e[0] * nx + e[3] * ny + e[6] * nz
      positions[o + 1] = e[1] * nx + e[4] * ny + e[7] * nz
      positions[o + 2] = e[2] * nx + e[5] * ny + e[8] * nz
      this.ages[i] = Math.min((this.time - this.born[i]) / life, 1)
    }
    for (const name of ["position", "age", "speed"]) this.smoke.getAttribute(name).needsUpdate = true
  }

  resize() {
    if (!this.renderer || this.disposed) return
    const { width, height } = this.element.getBoundingClientRect()
    if (!width || !height) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    if (this.uniforms) this.uniforms.scale.value = height * this.renderer.getPixelRatio() / (2 * Math.tan(this.camera.fov * RAD / 2))
    this.render()
  }

  schedule() {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.previous = 0
    if (!this.ready || this.disposed) return
    // Without attitude nothing moves: one still frame of the wing, no smoke.
    if (!this.attitude || !this.visible || document.hidden) { this.render(); return }
    this.frame = requestAnimationFrame(this.tick)
  }

  /** @param {number} now */
  tick(now) {
    if (this.disposed) return
    const dt = this.previous ? Math.min((now - this.previous) / 1000, 1 / 30) : 1 / 60
    this.previous = now
    this.time += dt
    this.applyAttitude()
    this.stepSmoke(dt)
    this.render()
    this.frame = requestAnimationFrame(this.tick)
  }

  render() {
    if (this.renderer && !this.disposed) this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.lifetime.abort()
    this.resizeObserver?.disconnect()
    this.intersection?.disconnect()
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((/** @type {THREE.Material} */ material) => material.dispose())
    })
    this.environmentTarget?.dispose()
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
  }
}

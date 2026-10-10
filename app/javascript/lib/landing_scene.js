import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { createFlow } from "landing_flow"

/** A presentation scene derived from the supplied wing, never flight telemetry. */
export class LandingScene {
  /** @param {HTMLElement} element */
  constructor(element) {
    this.element = element
    this.lifetime = new AbortController()
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)")
    this.paused = this.reduced.matches
    this.visible = true
    this.disposed = false
    this.ready = false
    this.frame = 0
    this.elapsed = 0
    this.previous = 0
    this.scroll = 0
    this.underwing = false
    this.pointer = new THREE.Vector2()
    this.pose = new THREE.Vector2()
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60)
    this.wing = new THREE.Group()
    this.scene.add(this.wing)
    /** @type {THREE.MeshStandardMaterial[]} */
    this.surfaces = []
    /** @type {THREE.LineBasicMaterial[]} */
    this.edges = []
    this.controls = element.querySelector("[data-scene-controls]")
    this.pauseButton = element.querySelector("[data-scene-pause]")
    this.modeButton = element.querySelector("[data-scene-mode]")
    this.viewButton = element.querySelector("[data-scene-view]")
    this.styles = getComputedStyle(element)
    this.color = (/** @type {string} */ token) => new THREE.Color(this.styles.getPropertyValue(token).trim())
    this.tick = this.tick.bind(this)
  }

  async start() {
    try {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" })
      this.renderer.setPixelRatio(window.devicePixelRatio || 1)
      this.renderer.setClearColor(0x000000, 0)
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFShadowMap
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      this.renderer.toneMappingExposure = 1.1
      this.renderer.domElement.setAttribute("aria-hidden", "true")
      this.element.prepend(this.renderer.domElement)
      this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
        event.preventDefault()
        this.dispose()
      }, { signal: this.lifetime.signal })
      this.scene.fog = new THREE.FogExp2(this.color("--ex-flight-shadow"), 0.027)
      const studio = new RoomEnvironment()
      const pmrem = new THREE.PMREMGenerator(this.renderer)
      this.environmentTarget = pmrem.fromScene(studio, 0.04)
      this.scene.environment = this.environmentTarget.texture
      this.scene.environmentIntensity = 0.32
      studio.dispose()
      pmrem.dispose()
      this.scene.add(new THREE.HemisphereLight(this.color("--ex-scene-light"), this.color("--ex-flight-shadow"), 0.65))
      const key = new THREE.DirectionalLight(this.color("--ex-white"), 3)
      key.position.set(-3, 6, -4)
      key.castShadow = true
      key.shadow.mapSize.set(2048, 2048)
      Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 18 })
      key.shadow.normalBias = 0.025
      key.shadow.bias = -0.0001
      const rim = new THREE.DirectionalLight(this.color("--ex-flight-violet"), 5)
      rim.position.set(4, 3, 2)
      const warm = new THREE.DirectionalLight(this.color("--ex-flight-amber"), 2)
      warm.position.set(-4, 1, 4)
      const fill = new THREE.DirectionalLight(this.color("--ex-flight-orchid"), 2.4)
      fill.position.set(-2, -5, -3)
      this.scene.add(key, rim, warm, fill)
      const [wingData, seatData, pilotData, flowData] = await Promise.all([
        this.fetchAsset(this.element.dataset.modelUrl, false),
        this.fetchAsset(this.element.dataset.seatUrl, false),
        this.fetchAsset(this.element.dataset.pilotUrl, false),
        this.fetchAsset(this.element.dataset.flowUrl, true)
      ])
      if (this.disposed) return
      const loader = new GLTFLoader()
      const [model, seat, pilot] = await Promise.all([
        loader.parseAsync(/** @type {ArrayBuffer} */ (wingData), ""),
        loader.parseAsync(/** @type {ArrayBuffer} */ (seatData), ""),
        loader.parseAsync(/** @type {ArrayBuffer} */ (pilotData), "")
      ])
      if (this.disposed) {
        this.disposeObject(model.scene)
        this.disposeObject(seat.scene)
        this.disposeObject(pilot.scene)
        return
      }
      this.applyWingMaterials(model.scene)
      this.applySeatMaterials(seat.scene)
      this.applyPilotMaterials(pilot.scene)
      this.wing.add(model.scene, seat.scene, pilot.scene)
      this.flow = createFlow(/** @type {import("landing_flow").FlowData} */ (flowData), {
        violet: this.color("--ex-flight-orchid"), magenta: this.color("--ex-flight-magenta"), amber: this.color("--ex-flight-amber")
      })
      this.wing.add(this.flow.group)
      this.attach()
      this.ready = true
      this.resize()
      this.element.dataset.sceneState = "ready"
      if (this.controls instanceof HTMLElement) this.controls.hidden = false
      this.updatePauseLabel()
      this.schedule()
    } catch (error) {
      if (!this.disposed) {
        console.warn("Exowing scene unavailable; retaining the static illustration.", error)
        this.dispose()
      }
    }
  }

  /** @param {string | undefined} url @param {boolean} json */
  async fetchAsset(url, json) {
    if (!url) throw new Error("Missing flight presentation asset")
    const response = await fetch(url, { signal: this.lifetime.signal })
    if (!response.ok) throw new Error("Flight presentation asset unavailable")
    return json ? response.json() : response.arrayBuffer()
  }

  /** @param {THREE.Mesh} mesh @param {THREE.Material} material */
  replaceMaterial(mesh, material) {
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    originals.forEach((original) => original.dispose())
    mesh.material = material
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.geometry.computeVertexNormals()
  }

  /** @param {THREE.MeshPhysicalMaterial} material */
  carbonWeave(material) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = "varying vec3 carbonPosition;\n" + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ncarbonPosition = position;")
      shader.fragmentShader = "varying vec3 carbonPosition;\n" + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        vec2 carbonUV = carbonPosition.xz * 65.0;
        float cell = mod(floor(carbonUV.x) + floor(carbonUV.y), 2.0);
        float thread = mix(fract(carbonUV.x), fract(carbonUV.y), cell);
        float strand = smoothstep(0.05, 0.25, thread) * (1.0 - smoothstep(0.75, 0.95, thread));
        float detail = 1.0 - smoothstep(0.45, 1.3, max(fwidth(carbonUV.x), fwidth(carbonUV.y)));
        float weave = mix(0.8, 0.48 + 0.50 * strand, detail);
        diffuseColor.rgb *= weave;
        roughnessFactor = clamp(roughnessFactor + (1.0 - weave) * 0.18, 0.0, 1.0);`)
    }
  }

  /** @param {THREE.Object3D} root */
  applyWingMaterials(root) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const material = new THREE.MeshPhysicalMaterial({
        color: this.color("--ex-scene-surface"), metalness: 0.15, roughness: 0.43,
        clearcoat: 0.18, clearcoatRoughness: 0.45, specularIntensity: 0.3, envMapIntensity: 0.4, side: THREE.DoubleSide,
        transparent: true, opacity: 1
      })
      this.carbonWeave(material)
      this.replaceMaterial(object, material)
      this.surfaces.push(material)
      const edgeMaterial = new THREE.LineBasicMaterial({ color: this.color("--ex-flight-orchid"), transparent: true, opacity: 0.10 })
      object.add(new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry, 30), edgeMaterial))
      this.edges.push(edgeMaterial)
    })
  }

  /** @param {THREE.Object3D} root */
  applySeatMaterials(root) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const hardware = object.name === "seat-hardware"
      const material = new THREE.MeshPhysicalMaterial({
        color: this.color(hardware ? "--ex-line-300" : "--ex-scene-surface"),
        metalness: hardware ? 0.8 : 0.15,
        roughness: hardware ? 0.36 : 0.45,
        clearcoat: hardware ? 0 : 0.2,
        side: THREE.DoubleSide
      })
      if (!hardware) this.carbonWeave(material)
      this.replaceMaterial(object, material)
    })
  }

  /** @param {THREE.Object3D} root */
  applyPilotMaterials(root) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const name = object.name
      let material = new THREE.MeshPhysicalMaterial({ color: this.color("--ex-carbon-900"), roughness: 0.85, metalness: 0.05 })
      if (name.includes("helmet")) {
        material.dispose()
        material = new THREE.MeshPhysicalMaterial({ color: this.color("--ex-scene-surface"), roughness: 0.35, metalness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.25 })
        this.carbonWeave(material)
      }
      if (name.includes("visor")) {
        material.dispose()
        material = new THREE.MeshPhysicalMaterial({ color: this.color("--ex-carbon-950"), roughness: 0.16, metalness: 0.05, clearcoat: 0.65, clearcoatRoughness: 0.15, side: THREE.DoubleSide })
      } else if (name.includes("accent") || name.includes("handle")) {
        material.dispose()
        material = new THREE.MeshPhysicalMaterial({ color: this.color("--ex-flight-violet"), roughness: 0.4, metalness: 0.35, emissive: this.color("--ex-flight-magenta"), emissiveIntensity: 0.12 })
      } else if (name.includes("buckle")) {
        material.dispose()
        material = new THREE.MeshPhysicalMaterial({ color: this.color("--ex-line-300"), roughness: 0.25, metalness: 0.85 })
      } else if (name.includes("parachute")) {
        material.color.copy(this.color("--ex-scene-surface"))
        material.roughness = 0.94
      }
      this.replaceMaterial(object, material)
    })
  }

  attach() {
    const signal = this.lifetime.signal
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.element)
    this.intersection = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting
      this.schedule()
    })
    this.intersection.observe(this.element)
    document.addEventListener("visibilitychange", () => this.schedule(), { signal })
    this.reduced.addEventListener("change", () => {
      this.paused = this.reduced.matches
      this.updatePauseLabel()
      this.schedule()
    }, { signal })
    this.element.addEventListener("pointermove", (event) => {
      if (this.reduced.matches || event.pointerType !== "mouse" || this.paused) return
      const rect = this.element.getBoundingClientRect()
      this.pointer.set((event.clientX - rect.left) / rect.width - 0.5, (event.clientY - rect.top) / rect.height - 0.5)
    }, { signal, passive: true })
    this.element.addEventListener("pointerleave", () => this.pointer.set(0, 0), { signal })
    window.addEventListener("scroll", () => {
      if (this.reduced.matches || this.paused) return
      const hero = this.element.closest("section")
      if (hero) this.scroll = THREE.MathUtils.clamp(-hero.getBoundingClientRect().top / hero.clientHeight, 0, 1)
    }, { signal, passive: true })
    this.pauseButton?.addEventListener("click", () => {
      this.paused = !this.paused
      this.updatePauseLabel()
      this.schedule()
    }, { signal })
    this.viewButton?.addEventListener("click", () => {
      this.underwing = !this.underwing
      this.viewButton?.setAttribute("aria-pressed", String(this.underwing))
      this.render()
    }, { signal })
    this.modeButton?.addEventListener("click", () => {
      const outline = this.modeButton?.getAttribute("aria-pressed") !== "true"
      this.modeButton?.setAttribute("aria-pressed", String(outline))
      this.surfaces.forEach((material) => { material.opacity = outline ? 0.10 : 1 })
      this.edges.forEach((material) => { material.opacity = outline ? 0.85 : 0.22 })
      this.render()
    }, { signal })
  }

  updatePauseLabel() {
    if (this.pauseButton) {
      this.pauseButton.textContent = this.paused ? "Play motion" : "Pause motion"
      this.pauseButton.setAttribute("aria-pressed", String(this.paused))
    }
  }

  resize() {
    if (!this.renderer || this.disposed) return
    const { width, height } = this.element.getBoundingClientRect()
    if (!width || !height) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.render()
  }

  schedule() {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.previous = 0
    if (!this.ready || this.disposed || this.paused || !this.visible || document.hidden) return
    this.frame = requestAnimationFrame(this.tick)
  }

  /** @param {number} timestamp */
  tick(timestamp) {
    if (this.disposed) return
    const delta = this.previous ? Math.min((timestamp - this.previous) / 1000, 0.05) : 0
    this.previous = timestamp
    this.elapsed += delta
    this.pose.lerp(this.pointer, 1 - Math.exp(-delta * 4))
    this.render()
    this.frame = requestAnimationFrame(this.tick)
  }

  render() {
    if (!this.renderer || this.disposed) return
    const t = this.elapsed
    const aspect = this.camera.aspect
    const distance = aspect < 1 ? 1.14 : 1.04
    const entrance = this.reduced.matches ? 1 : 1 - Math.pow(1 - Math.min(t / 3.2, 1), 3)
    const yaw = -0.75 + this.pose.x * 0.6 + this.scroll * 0.55 + Math.sin(t * 0.12) * 0.025
    const radius = (10.0 + (1 - entrance) * 2.6) * distance
    const elevation = this.underwing ? -4 : 4.5
    this.camera.position.set(Math.sin(yaw) * radius, (elevation + this.pose.y * 2 - this.scroll * 2) * distance, -Math.cos(yaw) * radius)
    this.camera.lookAt(0, 0, -0.3)
    // Geometry and flow share a fixed frame. Camera banking never changes the solution.
    this.camera.rotateZ(-0.12 + this.pose.x * 0.08)
    if (this.flow) this.flow.time.value = t
    this.renderer.render(this.scene, this.camera)
  }

  /** @param {THREE.Object3D} root */
  disposeObject(root) {
    const geometries = new Set()
    const materials = new Set()
    root.traverse((object) => {
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose()
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        geometries.add(object.geometry)
        const attached = Array.isArray(object.material) ? object.material : [object.material]
        attached.forEach((material) => materials.add(material))
      }
    })
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.lifetime.abort()
    this.resizeObserver?.disconnect()
    this.intersection?.disconnect()
    this.disposeObject(this.scene)
    this.environmentTarget?.dispose()
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
    this.element.dataset.sceneState = "static"
    if (this.controls instanceof HTMLElement) this.controls.hidden = true
  }
}

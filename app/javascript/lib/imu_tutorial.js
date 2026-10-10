import * as THREE from "three"
const UP = new THREE.Vector3(0, 0, 1)
const BASIS = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
export const FIGURE_EIGHT_SECONDS = 10
/** A closed, two-lobed hand path in the camera plane.
 * @param {number} phase @param {THREE.Vector3} [point] */
export function figureEightPoint(phase, point = new THREE.Vector3()) {
  return point.set(2.25 * Math.sin(phase), .72 * Math.sin(2 * phase), 0)
}
/** Wrist rotation accompanies translation; the IMU only measures orientation.
 * @param {number} phase */
export function figureEightOrientation(phase) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(.8 * Math.sin(phase), .9 * Math.sin(2 * phase), .6 * Math.cos(phase)))
}
/** @param {string} face */
export function faceAxis(face) {
  const axis = new THREE.Vector3()
  axis.setComponent("xyz".indexOf(face[0]), face[1] === "+" ? 1 : -1)
  return axis
}
/** Nearest target tilt, with heading unconstrained, in the sensor's native frame.
 * @param {THREE.Quaternion} measured @param {string} face */
export function targetForFace(measured, face) {
  const correction = new THREE.Quaternion().setFromUnitVectors(faceAxis(face).applyQuaternion(measured), UP)
  return correction.multiply(measured).normalize()
}
/** All six targets share one level reference for the entire tutorial run. */
export class FaceTarget {
  /** @type {THREE.Quaternion|null} */ reference = null
  /** @type {Record<string, THREE.Quaternion>} */ targets = {}
  /** @param {string} face @param {THREE.Quaternion|null} measured */
  update(face, measured) {
    if (!this.reference && measured) {
      this.reference = targetForFace(measured, "z+")
      this.targets = {}
    }
    if (!this.targets[face]) {
      const axis = face[0] === "x" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      const angle = face[0] === "z" ? (face[1] === "+" ? 0 : Math.PI)
        : (face[1] === "+" ? 1 : -1) * (face[0] === "x" ? -1 : 1) * Math.PI / 2
      this.targets[face] = (this.reference || new THREE.Quaternion()).clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle))
    }
    return this.targets[face]
  }
  reset() { this.reference = null; this.targets = {} }
}
/** BNO reports w,x,y,z; Three.js uses x,y,z,w and a Y-up scene.
 * @param {number[]} q */
export function sensorOrientation(q) {
  return new THREE.Quaternion(q[1], q[2], q[3], q[0]).normalize()
}
/** @param {THREE.Quaternion} q */
export function sceneOrientation(q) { return BASIS.clone().multiply(q) }

export class ImuTutorial {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container; this.disposed = false; this.mode = "z+"
    this.live = false; this.initialized = false; this.holding = false; this.completed = false
    this.measured = new THREE.Quaternion(); this.target = new THREE.Quaternion()
    this.faceTarget = new FaceTarget()
    this.motionTime = 0
    this.motionScale = 1
    const style = getComputedStyle(container)
    const color = (/** @type {string} */ token, /** @type {string} */ fallback) => new THREE.Color(style.getPropertyValue(token).trim() || fallback)
    this.accent = color("--ex-aqua-500", "#2fd6c6")
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0, 0)
    container.append(this.renderer.domElement)
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(34, 1, .1, 50)
    this.camera.position.set(3.1, 2.7, 5); this.camera.lookAt(0, 0, 0)
    this.scene.add(new THREE.HemisphereLight(color("--ex-vapor-50", "#f5f8f6"), color("--ex-carbon-700", "#243133"), 3))
    const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(2, 5, 4); this.scene.add(light)
    const rim = new THREE.DirectionalLight(this.accent, 2); rim.position.set(-4, 1, -2); this.scene.add(rim)
    this.body = new THREE.Group(); this.ghost = new THREE.Group()
    const board = new THREE.BoxGeometry(2.4, 1.6, .24)
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: color("--ex-line-300", "#aebfba"), roughness: .35, metalness: .55 })
    this.body.add(new THREE.Mesh(board, this.bodyMaterial))
    const edges = new THREE.EdgesGeometry(board)
    this.body.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: color("--ex-vapor-50", "#f5f8f6"), transparent: true, opacity: .5 })))
    const chip = new THREE.Mesh(new THREE.BoxGeometry(.85, .85, .13), new THREE.MeshStandardMaterial({ color: color("--ex-carbon-800", "#182426"), roughness: .38, metalness: .4 }))
    chip.position.z = .185; this.body.add(chip)
    for (const x of [-1.02, 1.02]) for (const y of [-.62, .62]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, .02, 16), new THREE.MeshStandardMaterial({color:color("--ex-graphite-600", "#5f6c6b"),metalness:.7,roughness:.3}))
      screw.rotation.x = Math.PI / 2; screw.position.set(x,y,.135); this.body.add(screw)
    }
    this.ghostMaterial = new THREE.MeshBasicMaterial({ color: this.accent, transparent: true, opacity: .075, depthWrite: false, side: THREE.DoubleSide })
    this.ghost.add(new THREE.Mesh(board.clone(), this.ghostMaterial))
    this.ghostOutline = new THREE.LineDashedMaterial({ color:this.accent, dashSize:.1, gapSize:.07, transparent:true, opacity:.8, depthTest:false })
    const outline = new THREE.LineSegments(edges.clone(), this.ghostOutline); outline.computeLineDistances(); outline.renderOrder=3; this.ghost.add(outline)
    this.ghost.scale.setScalar(1.045)
    for (const [label, position] of [["+X",[1.38,0,.2]],["+Y",[0,1,.2]],["+Z",[0,0,.72]]]) {
      const canvas=document.createElement("canvas");canvas.width=256;canvas.height=128
      const ctx=canvas.getContext("2d");if(!ctx)continue
      ctx.font="500 42px monospace";ctx.textAlign="center";ctx.fillStyle="#f5f8f6";ctx.fillText(String(label),128,82)
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}))
      sprite.scale.set(.8,.4,1);sprite.position.fromArray(/** @type {number[]} */(position));this.body.add(sprite)
    }
    this.body.visible = false; this.scene.add(this.body, this.ghost)
    this.motionGuide = new THREE.Group()
    this.motionGuide.quaternion.copy(this.camera.quaternion)
    this.motionGuide.position.copy(new THREE.Vector3(0, .4, 0).applyQuaternion(this.camera.quaternion))
    const path = new THREE.CatmullRomCurve3(Array.from({length: 240}, (_, i) => figureEightPoint(i / 240 * Math.PI * 2)), true)
    this.motionGuide.add(new THREE.Mesh(new THREE.TubeGeometry(path,240,.012,5,true), new THREE.MeshBasicMaterial({color: this.accent, transparent: true, opacity: .5})))
    this.trailPoints = new THREE.BufferAttribute(new Float32Array(64 * 3), 3)
    const trail = new THREE.BufferGeometry().setAttribute("position", this.trailPoints)
    const colors = new Float32Array(64 * 3)
    for (let i = 0; i < 64; i++) this.accent.clone().multiplyScalar(.1 + .9 * i / 63).toArray(colors, i * 3)
    trail.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    const trailLine = new THREE.Line(trail, new THREE.LineBasicMaterial({vertexColors: true, transparent: true, opacity: 1, depthTest: false}))
    trailLine.frustumCulled = false; trailLine.renderOrder = 2; this.motionGuide.add(trailLine)
    this.motionCursor = new THREE.Mesh(new THREE.SphereGeometry(.06, 16, 8), new THREE.MeshBasicMaterial({color: this.accent, depthTest: false}))
    this.motionCursor.renderOrder = 4; this.motionGuide.add(this.motionCursor)
    // Small fixed chevrons keep the direction readable with reduced motion too.
    for (const phase of [Math.PI / 4, Math.PI * 5 / 4]) {
      const center = figureEightPoint(phase)
      const tangent = new THREE.Vector3(2.25 * Math.cos(phase), 1.44 * Math.cos(2 * phase), 0).normalize()
      const normal = new THREE.Vector3(-tangent.y, tangent.x, 0)
      const wing = center.clone().addScaledVector(tangent, -.18)
      const chevron = new THREE.BufferGeometry().setFromPoints([wing.clone().addScaledVector(normal,.09),center,wing.clone().addScaledVector(normal,-.09)])
      this.motionGuide.add(new THREE.Line(chevron, new THREE.LineBasicMaterial({color:this.accent,transparent:true,opacity:.65})))
    }
    this.motionGuide.visible = false; this.scene.add(this.motionGuide)
    this.motionPoint = new THREE.Vector3(); this.restPosition = new THREE.Vector3()
    this.liveMotionPosition = new THREE.Vector3(0,-1.15,0).applyQuaternion(this.camera.quaternion)
    const ground = new THREE.GridHelper(7, 20, color("--ex-carbon-700", "#243133"), color("--ex-carbon-800", "#182426")); ground.position.y=-1.8
    ground.material.transparent=true;ground.material.opacity=.5;this.scene.add(ground)
    this.reduced=matchMedia("(prefers-reduced-motion: reduce)")
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize()
    this.lastDraw=0;this.frame=requestAnimationFrame(t=>this.draw(t))
  }
  resize() {
    const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight)
    this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix()
    const visibleWidth = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.length() * this.camera.aspect
    this.motionScale = Math.min(1,visibleWidth / 6.2)
    this.motionGuide.scale.setScalar(this.motionScale)
  }
  /** @param {string} mode */
  setMode(mode) {
    if (mode !== this.mode) this.motionTime = 0
    this.mode = mode
  }
  resetTargets() { this.faceTarget.reset() }
  /** Only actual fresh sensor orientation drives the solid object.
   * @param {number[]|null} q @param {boolean} holding @param {boolean} completed */
  setReading(q, holding=false, completed=false) {
    this.live=Boolean(q && q.length===4 && q.every(Number.isFinite) && Math.hypot(...q)>.5)
    this.body.visible=this.live;this.holding=holding;this.completed=completed
    if(this.live && q) {
      this.measured.copy(sensorOrientation(q))
      if(!this.initialized){this.body.quaternion.copy(sceneOrientation(this.measured));this.initialized=true}
    } else this.initialized=false
  }
  /** @param {number} time */
  draw(time) {
    if(this.disposed)return
    const dt=Math.min(.1,(time-this.lastDraw)/1000);this.lastDraw=time
    const rotating = this.mode === "rotate"
    this.motionGuide.visible = rotating
    const transition = this.reduced.matches ? 1 : 1-Math.exp(-dt*6)
    if (rotating) {
      if (!this.reduced.matches && !document.hidden) this.motionTime += dt
      const phase = this.motionTime / FIGURE_EIGHT_SECONDS * Math.PI * 2
      this.target.copy(this.faceTarget.update("z+", this.live ? this.measured : null)).multiply(figureEightOrientation(phase))
      figureEightPoint(phase, this.motionPoint)
      this.motionCursor.position.copy(this.motionPoint)
      this.ghost.position.lerp(this.motionPoint.multiplyScalar(this.motionScale).applyQuaternion(this.camera.quaternion).add(this.motionGuide.position), transition)
      for (let i = 0; i < 64; i++) {
        figureEightPoint(phase - (1 - i/63) * 1.1, this.motionPoint)
        this.trailPoints.setXYZ(i,this.motionPoint.x,this.motionPoint.y,this.motionPoint.z)
      }
      this.trailPoints.needsUpdate = true
    } else {
      this.target.copy(this.faceTarget.update(this.mode, this.live ? this.measured : null))
      this.ghost.position.lerp(this.restPosition, transition)
    }
    this.ghost.scale.setScalar(THREE.MathUtils.lerp(this.ghost.scale.x,rotating ? .52 * this.motionScale : 1.045,transition))
    this.body.scale.setScalar(THREE.MathUtils.lerp(this.body.scale.x,rotating ? .48 : 1,transition))
    this.body.position.lerp(rotating ? this.liveMotionPosition : this.restPosition,transition)
    const blend=this.reduced.matches?1:1-Math.exp(-dt*12)
    this.ghost.quaternion.slerp(sceneOrientation(this.target),this.reduced.matches?1:1-Math.exp(-dt*6))
    if(this.live)this.body.quaternion.slerp(sceneOrientation(this.measured),blend)
    this.ghostOutline.opacity = this.holding ? 1 : .9
    this.ghostMaterial.opacity = this.completed ? .22 : this.holding ? .18 : .13
    this.bodyMaterial.emissive.copy(this.accent)
    this.bodyMaterial.emissiveIntensity = this.completed ? .18 : this.holding ? .06 : 0
    if(!document.hidden)this.renderer.render(this.scene,this.camera)
    this.frame=requestAnimationFrame(t=>this.draw(t))
  }
  dispose() {
    this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect()
    this.scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh||object instanceof THREE.Line||object instanceof THREE.Sprite))return
      if("geometry" in object)object.geometry.dispose()
      const materials=Array.isArray(object.material)?object.material:[object.material]
      for(const material of materials){if("map" in material&&material.map instanceof THREE.Texture)material.map.dispose();material.dispose()}
    })
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove()
  }
}

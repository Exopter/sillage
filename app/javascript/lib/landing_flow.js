import * as THREE from "three"

/** @typedef {{points: number[][], times: number[], wake: boolean}} FlowPath */
/** @typedef {{schema: number, frame: string, paths: FlowPath[]}} FlowData */

/** Time-parametrized ribbons from the offline incompressible velocity field.
 * @param {FlowData} data
 * @param {{violet: THREE.Color, magenta: THREE.Color, amber: THREE.Color}} colors
 */
export function createFlow(data, colors) {
  if (data.schema !== 1 || data.frame !== "wing") throw new Error("Unsupported flow reference frame")
  const group = new THREE.Group()
  group.name = "wing-frame-airflow"
  /** @type {number[]} */
  const position = []
  /** @type {number[]} */
  const tangent = []
  /** @type {number[]} */
  const side = []
  /** @type {number[]} */
  const travel = []
  /** @type {number[]} */
  const lane = []
  /** @type {number[]} */
  const wake = []
  /** @type {number[]} */
  const indices = []
  let base = 0
  const paths = data.paths.filter((path, i) => path.wake || i % 2 === 0)
  paths.forEach((path, id) => {
    if (path.points.length !== path.times.length || path.points.length < 2) throw new Error("Invalid streamline samples")
    for (let i = 0; i < path.points.length; i++) {
      const point = path.points[i]
      const previous = path.points[Math.max(i - 1, 0)]
      const next = path.points[Math.min(i + 1, path.points.length - 1)]
      if (i && path.times[i] <= path.times[i - 1]) throw new Error("Nonmonotonic streamline travel time")
      for (const sign of [-1, 1]) {
        position.push(...point)
        tangent.push(next[0] - previous[0], next[1] - previous[1], next[2] - previous[2])
        side.push(sign); travel.push(path.times[i]); lane.push(id); wake.push(path.wake ? 1 : 0)
      }
      if (i < path.points.length - 1) {
        const at = base + i * 2
        indices.push(at, at + 1, at + 2, at + 1, at + 3, at + 2)
      }
    }
    base += path.points.length * 2
  })
  const geometry = new THREE.BufferGeometry()
  for (const [name, values, size] of /** @type {[string, number[], number][]} */ ([
    ["position", position, 3], ["tangent", tangent, 3], ["side", side, 1],
    ["travel", travel, 1], ["lane", lane, 1], ["wake", wake, 1]
  ])) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size))
  geometry.setIndex(indices)
  const time = { value: 0 }
  for (const [width, opacity] of [[0.038, 0.17], [0.008, 0.9]]) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time, width: { value: width }, opacity: { value: opacity },
        violet: { value: colors.violet }, magenta: { value: colors.magenta }, amber: { value: colors.amber }
      },
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute vec3 tangent; attribute float side; attribute float travel;
        attribute float lane; attribute float wake;
        uniform float width;
        varying float vTravel; varying float vLane; varying float vSide; varying float vWake; varying float vZ;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vec3 direction = normalize(mat3(modelMatrix) * tangent);
          vec3 across = normalize(cross(direction, normalize(cameraPosition - world.xyz)));
          world.xyz += across * side * width;
          vTravel = travel; vLane = lane; vSide = side; vWake = wake; vZ = position.z;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `uniform float time; uniform float opacity;
        uniform vec3 violet; uniform vec3 magenta; uniform vec3 amber;
        varying float vTravel; varying float vLane; varying float vSide; varying float vWake; varying float vZ;
        void main() {
          float phase = mod(vTravel - time * 1.25 + vLane * 0.31, 3.2);
          float pulse = exp(-phase * 8.0);
          float fade = smoothstep(-4.6, -3.3, vZ) * (1.0 - smoothstep(5.5, 8.8, vZ));
          float edge = exp(-vSide * vSide * 3.5);
          vec3 color = mix(violet, magenta, 0.25 + 0.65 * smoothstep(-0.5, 5.0, vZ));
          color = mix(color, amber, vWake * pulse * 0.55);
          float alpha = (0.085 + pulse * 0.95 + vWake * 0.065) * fade * edge * opacity;
          gl_FragColor = vec4(color * 1.5, alpha);
        }`
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    group.add(mesh)
  }
  return { group, time, pathCount: paths.length }
}

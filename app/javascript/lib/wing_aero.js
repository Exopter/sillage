// Vortex lattice model of the wing, built from sections cut out of the wing mesh.
// Frame: the wing model frame, +x right, +y up, -z forward, in model units.
//
// Steady, inviscid, incompressible. The wing is its camber surface carrying horseshoe
// vortices (bound leg at the panel quarter chord, flow tangency at three quarters). The wake
// leaves the trailing edge along the free stream. The pilot and seat are one Rankine body.
// No boundary layer, no separation, no fins: an indication, not a measurement.

/** @typedef {{x: number, le: number, te: number, yu: (number|null)[], yl: (number|null)[]}} WingStation */
/** @typedef {{samples: number, stations: WingStation[]}} WingSections */
/** @typedef {{radius: number, y: number, nose: number, tail: number}} RankineBody */
/** @typedef {{le: number, te: number, i: number, t: number, upper: number, lower: number}} StationSample */
/** @typedef {{cl: number, cdi: number, loading: Float64Array, centreFraction: number, alpha: number, beta: number}} WingForces */
/** @typedef {{x: number, bound: number[][], te: number[], corners: number[][]}} LatticeEdge */

const FOUR_PI = 4 * Math.PI

/** @returns {StationSample} */
export function stationSample() { return { le: 0, te: 0, i: 0, t: 0, upper: 0, lower: 0 } }

/** @param {number[]} values */
function median3(values) {
  return values.map((value, i) => [values[Math.max(i - 1, 0)], value, values[Math.min(i + 1, values.length - 1)]].sort((a, b) => a - b)[1])
}

/** @param {(number|null)[]} values @returns {number[]} */
function fill(values) {
  /** @type {number[]} */
  const out = []
  for (let i = 0; i < values.length; i++) {
    let value = values[i]
    for (let step = 1; value == null && step < values.length; step++) value = values[i - step] ?? values[i + step] ?? null
    out.push(value ?? 0)
  }
  return out
}

export class WingAero {
  /** @param {WingSections} data @param {{strips?: number, rows?: number, body?: RankineBody | null, core?: number}} [options] */
  constructor(data, options = {}) {
    const stations = data.stations
    this.samples = data.samples
    this.step = stations[1].x - stations[0].x
    this.count = stations.length
    this.halfSpan = stations[stations.length - 1].x + this.step
    this.le = median3(stations.map((station) => station.le))
    this.te = median3(stations.map((station) => station.te))
    this.yu = stations.map((station) => fill(station.yu))
    this.yl = stations.map((station) => fill(station.yl))
    this.strips = options.strips ?? 24
    this.rows = options.rows ?? 2
    /** @type {RankineBody | null} */
    this.body = options.body === undefined ? { radius: 0.42, y: -0.33, nose: -2.2, tail: 1.9 } : options.body
    this.core = options.core ?? 0.07
    this.wind = [0, 0, 1]
    this.speed = 1
    this.n = this.strips * this.rows
    const n = this.n
    this.cp = new Float64Array(n * 3)
    this.normal = new Float64Array(n * 3)
    this.boundA = new Float64Array(n * 3)
    this.boundB = new Float64Array(n * 3)
    this.teA = new Float64Array(n * 3)
    this.teB = new Float64Array(n * 3)
    this.width = new Float64Array(this.strips)
    this.gamma = new Float64Array(n)
    this.matrix = new Float64Array(n * n)
    this.rhs = new Float64Array(n)
    this.segmentCount = n + (this.strips + 1) * (this.rows + 1)
    // Merged filaments used for every velocity query: x1, y1, z1, x2, y2, z2, strength.
    this.segments = new Float64Array(this.segmentCount * 7)
    /** @type {LatticeEdge[]} */
    this.edges = []
    this.area = 0
    this.meanChord = 1
    this.meanLeadingEdge = 0
    this.scratch = stationSample()
    this.buildLattice()
  }

  /** Leading and trailing edge at a spanwise position. @param {number} x @param {StationSample} out */
  station(x, out) {
    const a = Math.min(Math.abs(x) / this.step, this.count - 1)
    const i = Math.min(Math.floor(a), this.count - 2), t = Math.min(a - i, 1)
    out.le = this.le[i] + (this.le[i + 1] - this.le[i]) * t
    out.te = this.te[i] + (this.te[i + 1] - this.te[i]) * t
    out.i = i; out.t = t
    return out
  }

  /** Surface height at chord fraction s. @param {number[][]} table @param {StationSample} st @param {number} s */
  height(table, st, s) {
    const b = Math.min(Math.max(s, 0), 1) * (this.samples - 1)
    const k = Math.min(Math.floor(b), this.samples - 2), u = b - k
    const lo = table[st.i][k] + (table[st.i][k + 1] - table[st.i][k]) * u
    const hi = table[st.i + 1][k] + (table[st.i + 1][k + 1] - table[st.i + 1][k]) * u
    return lo + (hi - lo) * st.t
  }

  /** Point on the camber surface. @param {number} x @param {number} s @returns {number[]} */
  camberPoint(x, s) {
    const st = this.station(x, stationSample())
    return [x, (this.height(this.yu, st, s) + this.height(this.yl, st, s)) / 2, st.le + (st.te - st.le) * s]
  }

  buildLattice() {
    const { strips, rows } = this
    let area = 0, chordSquared = 0, leMoment = 0
    for (let e = 0; e <= strips; e++) {
      const x = -this.halfSpan + (2 * this.halfSpan * e) / strips
      const xe = Math.max(Math.min(x, this.halfSpan - 1e-3), -this.halfSpan + 1e-3)
      this.edges.push({
        x: xe, te: this.camberPoint(xe, 1),
        bound: Array.from({ length: rows }, (_, k) => this.camberPoint(xe, (k + 0.25) / rows)),
        corners: Array.from({ length: rows + 1 }, (_, k) => this.camberPoint(xe, k / rows))
      })
    }
    for (let i = 0; i < strips; i++) {
      const left = this.edges[i], right = this.edges[i + 1], xm = (left.x + right.x) / 2
      const st = this.station(xm, stationSample()), chord = st.te - st.le
      this.width[i] = right.x - left.x
      area += chord * this.width[i]; chordSquared += chord * chord * this.width[i]; leMoment += st.le * chord * this.width[i]
      for (let k = 0; k < rows; k++) {
        const m = (i * rows + k) * 3
        this.cp.set(this.camberPoint(xm, (k + 0.75) / rows), m)
        this.boundA.set(left.bound[k], m); this.boundB.set(right.bound[k], m)
        this.teA.set(left.te, m); this.teB.set(right.te, m)
        // Panel normal from its diagonals, pointing up.
        const p1 = left.corners[k], p2 = right.corners[k + 1], p3 = right.corners[k], p4 = left.corners[k + 1]
        const ax = p2[0] - p1[0], ay = p2[1] - p1[1], az = p2[2] - p1[2]
        const bx = p4[0] - p3[0], by = p4[1] - p3[1], bz = p4[2] - p3[2]
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
        const length = Math.hypot(nx, ny, nz) * Math.sign(ny || 1)
        this.normal.set([nx / length, ny / length, nz / length], m)
      }
    }
    this.area = area
    this.meanChord = chordSquared / area
    this.meanLeadingEdge = leMoment / area
  }

  /** Velocity induced at a point by a straight filament, added into out.
   * @param {number} px @param {number} py @param {number} pz
   * @param {number} x1 @param {number} y1 @param {number} z1 @param {number} x2 @param {number} y2 @param {number} z2
   * @param {number} strength @param {number} coreSquared @param {number[]} out
   */
  static filament(px, py, pz, x1, y1, z1, x2, y2, z2, strength, coreSquared, out) {
    const ax = px - x1, ay = py - y1, az = pz - z1
    const bx = px - x2, by = py - y2, bz = pz - z2
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1
    const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(bx * bx + by * by + bz * bz)
    if (la < 1e-9 || lb < 1e-9) return
    const cross = cx * cx + cy * cy + cz * cz + coreSquared * (dx * dx + dy * dy + dz * dz)
    const k = strength / FOUR_PI * ((dx * ax + dy * ay + dz * az) / la - (dx * bx + dy * by + dz * bz) / lb) / cross
    out[0] += k * cx; out[1] += k * cy; out[2] += k * cz
  }

  /** Displacement flow of the pilot and seat. @param {number} px @param {number} py @param {number} pz @param {number[]} out */
  bodyVelocity(px, py, pz, out) {
    const body = this.body
    if (!body) return
    const q = this.speed * body.radius * body.radius / 4
    const dy = py - body.y
    let dz = pz - body.nose, r2 = px * px + dy * dy + dz * dz + 0.01, k = q / (r2 * Math.sqrt(r2))
    out[0] += k * px; out[1] += k * dy; out[2] += k * dz
    dz = pz - body.tail; r2 = px * px + dy * dy + dz * dz + 0.01; k = -q / (r2 * Math.sqrt(r2))
    out[0] += k * px; out[1] += k * dy; out[2] += k * dz
  }

  /** Solves the circulations for a wind velocity given in the wing frame.
   * @param {number} wx @param {number} wy @param {number} wz @returns {WingForces}
   */
  solve(wx, wy, wz) {
    const n = this.n, speed = Math.hypot(wx, wy, wz), far = 40 / speed
    this.wind = [wx, wy, wz]; this.speed = speed
    const fx = wx * far, fy = wy * far, fz = wz * far
    const v = [0, 0, 0], a = this.matrix, core = 1e-8
    for (let m = 0; m < n; m++) {
      const px = this.cp[m * 3], py = this.cp[m * 3 + 1], pz = this.cp[m * 3 + 2]
      const nx = this.normal[m * 3], ny = this.normal[m * 3 + 1], nz = this.normal[m * 3 + 2]
      for (let j = 0; j < n; j++) {
        const o = j * 3
        const ax = this.boundA[o], ay = this.boundA[o + 1], az = this.boundA[o + 2]
        const bx = this.boundB[o], by = this.boundB[o + 1], bz = this.boundB[o + 2]
        const tax = this.teA[o], tay = this.teA[o + 1], taz = this.teA[o + 2]
        const tbx = this.teB[o], tby = this.teB[o + 1], tbz = this.teB[o + 2]
        v[0] = v[1] = v[2] = 0
        WingAero.filament(px, py, pz, tax + fx, tay + fy, taz + fz, tax, tay, taz, 1, core, v)
        WingAero.filament(px, py, pz, tax, tay, taz, ax, ay, az, 1, core, v)
        WingAero.filament(px, py, pz, ax, ay, az, bx, by, bz, 1, core, v)
        WingAero.filament(px, py, pz, bx, by, bz, tbx, tby, tbz, 1, core, v)
        WingAero.filament(px, py, pz, tbx, tby, tbz, tbx + fx, tby + fy, tbz + fz, 1, core, v)
        a[m * n + j] = v[0] * nx + v[1] * ny + v[2] * nz
      }
      v[0] = wx; v[1] = wy; v[2] = wz
      this.bodyVelocity(px, py, pz, v)
      this.rhs[m] = -(v[0] * nx + v[1] * ny + v[2] * nz)
    }
    this.gamma.set(gauss(a, this.rhs, n))
    this.mergeSegments(fx, fy, fz)
    return this.forces()
  }

  /** @param {number} fx @param {number} fy @param {number} fz */
  mergeSegments(fx, fy, fz) {
    const { strips, rows, segments, gamma } = this
    let s = 0
    for (let j = 0; j < this.n; j++) {
      const o = j * 3
      segments.set([this.boundA[o], this.boundA[o + 1], this.boundA[o + 2], this.boundB[o], this.boundB[o + 1], this.boundB[o + 2], gamma[j]], s * 7); s++
    }
    for (let e = 0; e <= strips; e++) {
      const edge = this.edges[e]
      let strength = 0
      for (let k = 0; k < rows; k++) {
        // Net circulation leaving along this edge: the strip on the left sheds, the one on the right takes in.
        strength += (e > 0 ? gamma[(e - 1) * rows + k] : 0) - (e < strips ? gamma[e * rows + k] : 0)
        const from = edge.bound[k], to = k + 1 < rows ? edge.bound[k + 1] : edge.te
        segments.set([from[0], from[1], from[2], to[0], to[1], to[2], strength], s * 7); s++
      }
      segments.set([edge.te[0], edge.te[1], edge.te[2], edge.te[0] + fx, edge.te[1] + fy, edge.te[2] + fz, strength], s * 7); s++
    }
  }

  /** Flow velocity at a point of the wing frame. @param {number} px @param {number} py @param {number} pz @param {number[]} out @param {number} [core] */
  velocity(px, py, pz, out, core = this.core) {
    out[0] = this.wind[0]; out[1] = this.wind[1]; out[2] = this.wind[2]
    this.bodyVelocity(px, py, pz, out)
    const g = this.segments, coreSquared = core * core
    for (let s = 0, end = this.segmentCount * 7; s < end; s += 7) {
      if (g[s + 6] !== 0) WingAero.filament(px, py, pz, g[s], g[s + 1], g[s + 2], g[s + 3], g[s + 4], g[s + 5], g[s + 6], coreSquared, out)
    }
    return out
  }

  /** Kutta-Joukowski forces on the bound legs, as coefficients on the planform area. @returns {WingForces} */
  forces() {
    const { strips, rows } = this
    const [wx, wy, wz] = this.wind, speed = this.speed, q = 0.5 * speed * speed * this.area
    const ux = wx / speed, uy = wy / speed, uz = wz / speed
    let fx = 0, fy = 0, fz = 0, liftMomentZ = 0, liftSum = 0
    const v = [0, 0, 0]
    const loading = new Float64Array(strips)
    for (let i = 0; i < strips; i++) {
      for (let k = 0; k < rows; k++) {
        const j = i * rows + k, o = j * 3
        const mx = (this.boundA[o] + this.boundB[o]) / 2, my = (this.boundA[o + 1] + this.boundB[o + 1]) / 2, mz = (this.boundA[o + 2] + this.boundB[o + 2]) / 2
        this.velocity(mx, my, mz, v, 0.02)
        const lx = this.boundB[o] - this.boundA[o], ly = this.boundB[o + 1] - this.boundA[o + 1], lz = this.boundB[o + 2] - this.boundA[o + 2]
        const g = this.gamma[j]
        const px = g * (v[1] * lz - v[2] * ly), py = g * (v[2] * lx - v[0] * lz), pz = g * (v[0] * ly - v[1] * lx)
        fx += px; fy += py; fz += pz
        // Local lift: the part of the panel force normal to the wind.
        const along = px * ux + py * uy + pz * uz
        const lift = Math.hypot(px - along * ux, py - along * uy, pz - along * uz) * Math.sign(py - along * uy || 1)
        loading[i] += lift / (this.width[i] * 0.5 * speed * speed)
        liftMomentZ += lift * mz; liftSum += lift
      }
    }
    const drag = fx * ux + fy * uy + fz * uz
    // Lift axis: normal to the wind, in the plane of the wind and the wing's up axis.
    let lx = -uy * ux, ly = 1 - uy * uy, lz = -uy * uz
    const ll = Math.hypot(lx, ly, lz) || 1
    lx /= ll; ly /= ll; lz /= ll
    const centre = liftSum ? liftMomentZ / liftSum : 0
    return {
      cl: (fx * lx + fy * ly + fz * lz) / q, cdi: drag / q, loading,
      centreFraction: (centre - this.meanLeadingEdge) / this.meanChord,
      alpha: Math.atan2(wy, wz), beta: Math.asin(wx / speed)
    }
  }

  /** Upper and lower surface at a point of the planform, or null outside it.
   * @param {number} x @param {number} z @param {StationSample} out @returns {StationSample | null}
   */
  surface(x, z, out) {
    if (Math.abs(x) >= this.halfSpan) return null
    const st = this.station(x, out)
    if (z <= st.le || z >= st.te) return null
    const s = (z - st.le) / (st.te - st.le)
    out.upper = this.height(this.yu, st, s); out.lower = this.height(this.yl, st, s)
    return out
  }
}

/** Gaussian elimination with partial pivoting; a is row-major n by n and is overwritten.
 * @param {Float64Array} a @param {Float64Array} b @param {number} n
 */
function gauss(a, b, n) {
  const x = Float64Array.from(b)
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[pivot * n + c])) pivot = r
    if (pivot !== c) {
      for (let k = c; k < n; k++) { const t = a[c * n + k]; a[c * n + k] = a[pivot * n + k]; a[pivot * n + k] = t }
      const t = x[c]; x[c] = x[pivot]; x[pivot] = t
    }
    const d = a[c * n + c]
    for (let r = c + 1; r < n; r++) {
      const f = a[r * n + c] / d
      if (f === 0) continue
      for (let k = c; k < n; k++) a[r * n + k] -= f * a[c * n + k]
      x[r] -= f * x[c]
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let sum = x[r]
    for (let k = r + 1; k < n; k++) sum -= a[r * n + k] * x[k]
    x[r] = sum / a[r * n + r]
  }
  return x
}

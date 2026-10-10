/** @typedef {{heading: number|null, roll: number|null, pitch: number|null, airspeed: number|null, altitude: number|null, verticalSpeed: number|null, gLoad: number|null, accel?: number[]|null}} InstrumentData */
/** @typedef {{background: string, surface: string, sky: string, ground: string, line: string, muted: string, text: string, reference: string, caution: string, font: string}} InstrumentStyle */
/** @type {WeakMap<HTMLCanvasElement, InstrumentStyle>} */
const styles = new WeakMap()

/** @param {HTMLCanvasElement} canvas @returns {InstrumentStyle} */
export function instrumentStyle(canvas) {
  const cached = styles.get(canvas)
  if (cached) return cached
  const css = getComputedStyle(canvas)
  const token = (/** @type {string} */ name) => css.getPropertyValue(name).trim()
  const style = {
    background: token("--ex-carbon-950"), surface: token("--ex-carbon-900"),
    sky: token("--ex-instrument-sky"), ground: token("--ex-instrument-ground"),
    line: token("--ex-instrument-line"), muted: token("--ex-instrument-muted"),
    text: token("--ex-vapor-50"), reference: token("--ex-aqua-500"),
    caution: token("--ex-amber-500"), font: token("--ex-font-mono")
  }
  styles.set(canvas, style)
  return style
}

/** @param {number} heading */
export function normalizeHeading(heading) { return ((heading % 360) + 360) % 360 }

/** @param {number|null} value @param {number} step @param {number} spacing @param {number} center @param {number} top @param {number} bottom @param {number} minimum */
export function instrumentTapeTicks(value, step, spacing, center, top, bottom, minimum = -Infinity) {
  if (value == null || !Number.isFinite(value)) return []
  const lower = Math.ceil(Math.max(minimum, value - (bottom - center) * step / spacing) / step)
  const upper = Math.floor((value + (center - top) * step / spacing) / step)
  return Array.from({length: Math.max(0, upper - lower + 1)}, (_, index) => {
    const tick = (lower + index) * step
    return {value: tick, y: center - (tick - value) * spacing / step}
  })
}

/** @param {number|null} value @param {number} precision @param {boolean} signed */
function number(value, precision = 0, signed = false) {
  if (value == null || !Number.isFinite(value)) return "---"
  const rounded = Number(value.toFixed(precision))
  return `${signed && rounded > 0 ? "+" : ""}${rounded.toFixed(precision)}`
}

/** @param {CanvasRenderingContext2D} ctx @param {number} width @param {number} height @param {InstrumentData} data @param {InstrumentStyle} style */
export function drawSignalInstruments(ctx, width, height, data, style) {
  const scale = Math.min(1.6, Math.max(.8, Math.min(width / 510, height / 282)))
  const w = width / scale, h = height / scale
  ctx.save()
  ctx.scale(scale, scale)
  ctx.fillStyle = style.background
  ctx.fillRect(0, 0, w, h)
  ctx.lineCap = "butt"
  ctx.lineJoin = "round"
  ctx.textBaseline = "middle"
  const side = Math.min(94, Math.max(82, w * .18))
  const top = 76, bottom = h - 48, center = (top + bottom) / 2
  drawHeading(ctx, w, data.heading, style)
  drawAttitude(ctx, side, top, w - side * 2, bottom - top, data, style)
  drawGLoad(ctx, side + 30, bottom - 30, data.accel, style)
  drawTape(ctx, 14, 68, center, top + 20, bottom, data.airspeed, true, style)
  drawTape(ctx, w - 82, 68, center, top + 20, bottom, data.altitude, false, style)
  drawReadouts(ctx, w, h, data, style)
  ctx.restore()
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number[]|null|undefined} acceleration @param {InstrumentStyle} s */
function drawGLoad(ctx, x, y, acceleration, s) {
  const radius = 23
  const valid = acceleration?.length === 3 && acceleration.every(Number.isFinite)
  ctx.save()
  ctx.fillStyle = s.background
  ctx.beginPath(); ctx.arc(x, y, radius + 4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = s.line; ctx.lineWidth = .7
  for (const r of [radius / 2, radius]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(x - radius, y); ctx.lineTo(x + radius, y)
  ctx.moveTo(x, y - radius); ctx.lineTo(x, y + radius); ctx.stroke()
  if (valid) {
    // Sensor X points right and sensor Y points up; the outer ring is 2 g.
    // Clamp radially so out-of-range values preserve their direction.
    const gx = acceleration[0] / 9.80665, gy = acceleration[1] / 9.80665
    const factor = (radius - 3) / Math.max(2, Math.hypot(gx, gy))
    ctx.fillStyle = s.reference
    ctx.beginPath(); ctx.arc(x + gx * factor, y - gy * factor, 3, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.fillStyle = s.background; ctx.fillRect(x - 20, y - 5, 40, 10)
    ctx.fillStyle = s.muted; ctx.textAlign = "center"; ctx.font = `500 7px ${s.font}`
    ctx.fillText("NO DATA", x, y)
  }
  ctx.textAlign = "center"; ctx.fillStyle = s.muted; ctx.font = `500 6px ${s.font}`
  ctx.fillText("Y", x, y - radius + 5)
  ctx.fillText("X", x + radius - 5, y - 5)
  ctx.fillText("2 g", x, y + radius - 4)
  ctx.restore()
}

/** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number|null} heading @param {InstrumentStyle} s */
function drawHeading(ctx, w, heading, s) {
  const center = w / 2, span = Math.min(w - 42, 490), pixels = span / 120
  ctx.textAlign = "center"
  ctx.fillStyle = s.muted
  ctx.font = `500 9px ${s.font}`
  ctx.fillText("HDG", center - 53, 22)
  ctx.font = `500 23px ${s.font}`
  ctx.fillStyle = heading == null ? s.muted : s.text
  ctx.fillText(heading == null ? "---" : `${String(Math.round(normalizeHeading(heading)) % 360).padStart(3, "0")}°`, center, 23)
  ctx.strokeStyle = s.line
  ctx.lineWidth = .7
  ctx.beginPath(); ctx.moveTo(center - span / 2, 43); ctx.lineTo(center + span / 2, 43); ctx.stroke()
  if (heading == null) return
  for (let tick = Math.ceil((heading - 60) / 5) * 5; tick <= heading + 60; tick += 5) {
    const x = center + (tick - heading) * pixels
    const bearing = normalizeHeading(tick), major = tick % 10 === 0
    ctx.strokeStyle = major ? s.muted : s.line
    ctx.beginPath(); ctx.moveTo(x, 43); ctx.lineTo(x, major ? 51 : 47); ctx.stroke()
    if (major) {
      ctx.fillStyle = bearing % 90 === 0 ? s.text : s.muted
      ctx.font = `500 9px ${s.font}`
      ctx.fillText(({0: "N", 90: "E", 180: "S", 270: "W"})[bearing] ?? String(bearing / 10).padStart(2, "0"), x, 61)
    }
  }
  ctx.fillStyle = s.reference
  ctx.beginPath(); ctx.moveTo(center - 4, 35); ctx.lineTo(center + 4, 35); ctx.lineTo(center, 42); ctx.closePath(); ctx.fill()
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {InstrumentData} data @param {InstrumentStyle} s */
function drawAttitude(ctx, x, y, w, h, data, s) {
  const cx = x + w / 2, cy = y + h / 2, pixels = h / 50
  const {roll, pitch} = data
  const valid = roll != null && pitch != null
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.clip()
  if (valid) {
    ctx.save()
    // Positive pitch lowers the horizon; right bank rotates the world left.
    ctx.translate(cx, cy)
    ctx.rotate(-roll * Math.PI / 180)
    ctx.translate(0, pitch * pixels)
    const extent = Math.hypot(w, h) * 4
    ctx.fillStyle = s.sky; ctx.fillRect(-extent, -extent, extent * 2, extent)
    ctx.fillStyle = s.ground; ctx.fillRect(-extent, 0, extent * 2, extent)
    ctx.strokeStyle = s.text; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(-extent, 0); ctx.lineTo(extent, 0); ctx.stroke()
    ctx.font = `500 9px ${s.font}`
    for (let degree = -90; degree <= 90; degree += 5) {
      if (!degree) continue
      const py = -degree * pixels, major = degree % 10 === 0, half = major ? 42 : 25
      ctx.setLineDash(degree < 0 ? [3, 3] : [])
      ctx.strokeStyle = major ? s.text : s.muted; ctx.lineWidth = .8
      ctx.beginPath()
      ctx.moveTo(-half, py); ctx.lineTo(-12, py)
      ctx.moveTo(12, py); ctx.lineTo(half, py)
      ctx.stroke()
      if (major) {
        ctx.fillStyle = s.text
        ctx.textAlign = "right"; ctx.fillText(String(Math.abs(degree)), -half - 7, py)
        ctx.textAlign = "left"; ctx.fillText(String(Math.abs(degree)), half + 7, py)
      }
    }
    ctx.restore()
  } else {
    ctx.fillStyle = s.surface; ctx.fillRect(x, y, w, h)
    ctx.fillStyle = s.caution; ctx.textAlign = "center"; ctx.font = `500 12px ${s.font}`
    ctx.fillText("ATTITUDE", cx, cy - 10)
    ctx.font = `500 10px ${s.font}`; ctx.fillText("NO DATA", cx, cy + 9)
  }
  ctx.restore()
  ctx.strokeStyle = s.line; ctx.lineWidth = .65
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.stroke()
  if (!valid) return
  const radius = Math.min(w * .35, h * .5 - 10)
  ctx.save(); ctx.translate(cx, cy)
  ctx.strokeStyle = s.muted; ctx.lineWidth = .7
  ctx.beginPath(); ctx.arc(0, 0, radius, -Math.PI * 5 / 6, -Math.PI / 6); ctx.stroke()
  for (const angle of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const radians = angle * Math.PI / 180, major = angle % 30 === 0, length = major ? 7 : 4
    ctx.beginPath(); ctx.moveTo(Math.sin(radians) * radius, -Math.cos(radians) * radius)
    ctx.lineTo(Math.sin(radians) * (radius + length), -Math.cos(radians) * (radius + length)); ctx.stroke()
  }
  ctx.save(); ctx.rotate(roll * Math.PI / 180)
  ctx.strokeStyle = s.reference; ctx.lineWidth = 1.1
  ctx.beginPath(); ctx.moveTo(0, -radius + 3); ctx.lineTo(-4, -radius + 10); ctx.lineTo(4, -radius + 10); ctx.closePath(); ctx.stroke()
  ctx.restore()
  ctx.strokeStyle = s.reference; ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(-49, 0); ctx.lineTo(-18, 0); ctx.lineTo(-18, 5)
  ctx.moveTo(49, 0); ctx.lineTo(18, 0); ctx.lineTo(18, 5)
  ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} w @param {number} center @param {number} top @param {number} bottom @param {number|null} value @param {boolean} speed @param {InstrumentStyle} s */
function drawTape(ctx, x, w, center, top, bottom, value, speed, s) {
  const axis = speed ? x + w - 4 : x + 4
  const textX = speed ? x + w - 20 : x + 20
  ctx.textAlign = speed ? "right" : "left"
  ctx.fillStyle = s.muted; ctx.font = `500 9px ${s.font}`
  ctx.fillText(speed ? "IAS EST" : "GPS ALT", speed ? x + w - 3 : x + 3, 72)
  ctx.font = `400 8px ${s.font}`
  ctx.fillText(speed ? "km/h" : "m AMSL", speed ? x + w - 3 : x + 3, 85)
  ctx.strokeStyle = s.line; ctx.lineWidth = .7
  ctx.beginPath(); ctx.moveTo(axis, top); ctx.lineTo(axis, bottom); ctx.stroke()
  const ticks = instrumentTapeTicks(value, speed ? 10 : 100, 29, center, top, bottom - 3, speed ? 0 : -Infinity)
  ctx.save(); ctx.beginPath(); ctx.rect(x, top, w, bottom - top); ctx.clip()
  for (const tick of ticks) {
    ctx.strokeStyle = s.muted
    ctx.beginPath(); ctx.moveTo(axis, tick.y); ctx.lineTo(axis + (speed ? -9 : 9), tick.y); ctx.stroke()
    ctx.fillStyle = s.muted; ctx.font = `400 10px ${s.font}`
    ctx.fillText(String(tick.value), textX, tick.y)
    const minorY = tick.y - 14.5
    if (minorY >= top) {
      ctx.strokeStyle = s.line; ctx.beginPath(); ctx.moveTo(axis, minorY); ctx.lineTo(axis + (speed ? -4 : 4), minorY); ctx.stroke()
    }
  }
  ctx.restore()
  ctx.fillStyle = s.background; ctx.strokeStyle = value == null ? s.line : s.reference; ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, center - 15); ctx.lineTo(x + w, center - 15)
  if (speed) { ctx.lineTo(x + w, center - 5); ctx.lineTo(x + w + 5, center); ctx.lineTo(x + w, center + 5) }
  ctx.lineTo(x + w, center + 15); ctx.lineTo(x, center + 15)
  if (!speed) { ctx.lineTo(x, center + 5); ctx.lineTo(x - 5, center); ctx.lineTo(x, center - 5) }
  ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.textAlign = "center"; ctx.fillStyle = value == null ? s.muted : s.text; ctx.font = `500 19px ${s.font}`
  ctx.fillText(number(value), x + w / 2, center + 1)
  if (value == null) {
    ctx.fillStyle = s.caution; ctx.font = `500 8px ${s.font}`
    ctx.fillText("NO DATA", x + w / 2, center + 29)
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h @param {InstrumentData} data @param {InstrumentStyle} s */
function drawReadouts(ctx, w, h, data, s) {
  ctx.strokeStyle = s.line; ctx.lineWidth = .6
  ctx.beginPath(); ctx.moveTo(14, h - 36); ctx.lineTo(w - 14, h - 36); ctx.stroke()
  const readings = [
    {label: "ROLL", value: data.roll, unit: "°", precision: 1, signed: true},
    {label: "PITCH", value: data.pitch, unit: "°", precision: 1, signed: true},
    {label: "G LOAD", value: data.gLoad, unit: " g", precision: 2, signed: false},
    {label: "V/S", value: data.verticalSpeed, unit: " m/s", precision: 1, signed: true}
  ]
  readings.forEach((item, index) => {
    const x = (index + .5) * w / readings.length
    ctx.textAlign = "center"; ctx.fillStyle = s.muted; ctx.font = `500 8px ${s.font}`
    ctx.fillText(item.label, x, h - 25)
    ctx.fillStyle = item.value == null ? s.muted : s.text; ctx.font = `500 12px ${s.font}`
    ctx.fillText(`${number(item.value, item.precision, item.signed)}${item.value == null ? "" : item.unit}`, x, h - 10)
  })
}

/** @type {Array<"height" | "hspeed" | "vspeed" | "glide" | "distance">} */
const optionalFlightFields = ["height", "hspeed", "vspeed", "glide", "distance"]

/** @param {unknown} value @returns {value is number} */
export function isFiniteNumber(value) { return typeof value === "number" && Number.isFinite(value) }

/** @param {unknown} value @returns {number | null} */
export function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** @param {number} value @param {number} minimum @param {number} maximum */
export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

/** @param {number} start @param {number} finish @param {number} ratio */
export function lerp(start, finish, ratio) {
  return start + ((finish - start) * ratio)
}

/** @param {number[]} values @returns {number | null} */
export function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return null

  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * @param {import("../types/flight").FlightPoint} previous
 * @param {import("../types/flight").FlightPoint} next
 * @param {number} ratio
 * @param {number} elapsed
 */
export function interpolateFlightPoint(previous, next, ratio, elapsed) {
  /** @type {import("../types/flight").FlightPoint} */
  const point = { ...previous, t: elapsed }
  /** @type {Array<keyof import("../types/flight").FlightPoint>} */
  const keys = ["lat", "lon", "alt", "height", "hspeed", "vspeed", "glide", "distance", "visualAlt", "groundAlt", "datumOffset"]

  keys.forEach((key) => {
    const start = finiteNumber(previous[key])
    const finish = finiteNumber(next[key])
    if (start !== null && finish !== null) point[key] = lerp(start, finish, ratio)
  })

  return point
}

/**
 * @param {number} elapsed
 * @param {import("../types/flight").FlightPoint[]} points
 */
export function sampleFlightPoint(elapsed, points) {
  if (!points?.length) return null
  if (points.length === 1) return { ...points[0], t: elapsed }

  const firstTime = finiteNumber(points[0].t) ?? 0
  if (elapsed <= firstTime) return { ...points[0], t: elapsed }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const next = points[index]
    const previousTime = finiteNumber(previous.t) ?? 0
    const nextTime = finiteNumber(next.t) ?? previousTime
    if (elapsed > nextTime) continue

    const span = Math.max(nextTime - previousTime, 0.001)
    return interpolateFlightPoint(previous, next, (elapsed - previousTime) / span, elapsed)
  }

  return { ...points[points.length - 1], t: elapsed }
}

/**
 * @param {number} elapsed
 * @param {import("../types/flight").SensorSample[]} rows
 * @param {string} key
 */
export function sampleSensorValue(elapsed, rows, key) {
  if (!rows.length) return null

  const firstTime = finiteNumber(rows[0].t) ?? 0
  if (elapsed <= firstTime) return { row: rows[0], value: finiteNumber(rows[0].readings?.[key]) }

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]
    const next = rows[index]
    const previousTime = finiteNumber(previous.t) ?? 0
    const nextTime = finiteNumber(next.t) ?? previousTime
    if (elapsed > nextTime) continue

    const previousValue = finiteNumber(previous.readings?.[key])
    const nextValue = finiteNumber(next.readings?.[key])
    if (previousValue === null) return { row: next, value: nextValue }
    if (nextValue === null) return { row: previous, value: previousValue }

    return {
      row: next,
      value: lerp(previousValue, nextValue, (elapsed - previousTime) / Math.max(nextTime - previousTime, 0.001))
    }
  }

  const last = rows[rows.length - 1]
  return { row: last, value: finiteNumber(last.readings?.[key]) }
}

/** @param {unknown} value @returns {import("../types/flight").FlightPoint[]} */
export function normalizeFlightPoints(value) {
  if (!Array.isArray(value)) return []
  /** @type {import("../types/flight").FlightPoint[]} */
  const points = []
  for (const row of value) {
    if (!row || typeof row !== "object" || ![row.t, row.lat, row.lon, row.alt].every(isFiniteNumber)) continue
    if (Math.abs(row.lat) > 90 || Math.abs(row.lon) > 180) continue
    /** @type {import("../types/flight").FlightPoint} */
    const point = {t:row.t, lat:row.lat, lon:row.lon, alt:row.alt}
    for (const key of optionalFlightFields) {
      if (isFiniteNumber(row[key])) point[key] = row[key]
    }
    points.push(point)
  }
  return points
}

/** @param {unknown} value @returns {import("../types/flight").SensorSample[]} */
export function normalizeSensorSamples(value) {
  if (!Array.isArray(value)) return []
  return value.filter((row) => row && typeof row === "object" && isFiniteNumber(row.t) && typeof row.type === "string")
    .map((row) => ({t:row.t, type:row.type, readings:row.readings && typeof row.readings === "object" && !Array.isArray(row.readings) ? row.readings : {}}))
}

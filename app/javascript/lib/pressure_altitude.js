export const STANDARD_PRESSURE_PA = 101_325
export const PRESSURE_ALTITUDE_EXPONENT = 0.190294957
export const PRESSURE_ALTITUDE_SCALE_METERS = 44_330

/**
 * Convert static pressure in pascals to ISA pressure altitude in meters.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function pressureAltitudeFromPascals(value) {
  const pressure = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(pressure) || pressure <= 0) return null

  return PRESSURE_ALTITUDE_SCALE_METERS
    * (1 - ((pressure / STANDARD_PRESSURE_PA) ** PRESSURE_ALTITUDE_EXPONENT))
}

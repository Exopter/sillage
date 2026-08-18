/**
 * @typedef {Object} FdrWifiProvisioningProfile
 * @property {number} position
 * @property {string} ssid
 * @property {number} security
 * @property {boolean} enabled
 * @property {string} password
 */

/**
 * @typedef {Object} FdrWifiProvisioningBundle
 * @property {number} version
 * @property {string} assembly_id
 * @property {FdrWifiProvisioningProfile[]} profiles
 * @property {{ heartbeat_url: string }} sillage
 */

/**
 * Validate the authenticated Rails response before any credential or endpoint is
 * sent to a recorder. Static types protect callers after this runtime boundary.
 *
 * @param {unknown} value
 * @returns {FdrWifiProvisioningBundle}
 */
export function parseFdrWifiProvisioningBundle(value) {
  const bundle = objectValue(value, "provisioning bundle")
  if (bundle.version !== 1) throw invalidBundle("version must be 1")
  if (typeof bundle.assembly_id !== "string" || bundle.assembly_id.length === 0) {
    throw invalidBundle("assembly_id must be a non-empty string")
  }
  if (!Array.isArray(bundle.profiles)) throw invalidBundle("profiles must be an array")

  const sillage = objectValue(bundle.sillage, "provisioning bundle sillage")
  if (typeof sillage.heartbeat_url !== "string") {
    throw invalidBundle("sillage.heartbeat_url must be a string")
  }

  return {
    version: 1,
    assembly_id: bundle.assembly_id,
    profiles: bundle.profiles.map(parseProfile),
    sillage: { heartbeat_url: sillage.heartbeat_url }
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function parseFdrAuthenticationProof(value) {
  const payload = objectValue(value, "authentication response")
  if (typeof payload.proof !== "string" || !/^[0-9a-f]{64}$/i.test(payload.proof)) {
    throw new Error("Sillage returned an invalid recorder authentication proof.")
  }
  return payload.proof
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function fdrApiErrorMessage(value) {
  if (!isObject(value) || typeof value.error !== "string" || value.error.length === 0) return null
  return value.error
}

/**
 * @param {unknown} value
 * @param {number} index
 * @returns {FdrWifiProvisioningProfile}
 */
function parseProfile(value, index) {
  const profile = objectValue(value, `provisioning profile ${index + 1}`)
  if (!Number.isInteger(profile.position)) throw invalidBundle(`profiles[${index}].position must be an integer`)
  if (typeof profile.ssid !== "string") throw invalidBundle(`profiles[${index}].ssid must be a string`)
  if (!Number.isInteger(profile.security)) throw invalidBundle(`profiles[${index}].security must be an integer`)
  if (typeof profile.enabled !== "boolean") throw invalidBundle(`profiles[${index}].enabled must be a boolean`)
  if (typeof profile.password !== "string") throw invalidBundle(`profiles[${index}].password must be a string`)

  return {
    position: /** @type {number} */ (profile.position),
    ssid: profile.ssid,
    security: /** @type {number} */ (profile.security),
    enabled: profile.enabled,
    password: profile.password
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function objectValue(value, label) {
  if (!isObject(value)) throw new Error(`Sillage returned an invalid ${label}.`)
  return value
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** @param {string} detail */
function invalidBundle(detail) {
  return new Error(`Sillage returned an invalid Wi-Fi provisioning bundle: ${detail}.`)
}

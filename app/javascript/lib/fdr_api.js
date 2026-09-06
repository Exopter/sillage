/** @param {unknown} value @returns {Record<string,unknown>} */
export function objectPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Sillage returned an invalid response object.")
  return /** @type {Record<string,unknown>} */ (value)
}

/** @param {unknown} value @param {string} field */
function requiredString(value, field) {
  if (typeof value !== "string" || !value) throw new Error(`Sillage returned an invalid ${field}.`)
  return value
}

/** @param {unknown} value @param {string} field */
function localPath(value, field) {
  const path = requiredString(value, field)
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error(`Sillage returned an invalid ${field}.`)
  return path
}

/** @param {Response} response @param {string} fallback */
export async function readResponse(response, fallback) {
  const payload = objectPayload(await response.json())
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : fallback)
  return payload
}

/** @param {unknown} value */
export function registrationPayload(value) {
  const payload = objectPayload(value)
  if (payload.registered === false) return {registered: false}
  if (payload.registered !== true) throw new Error("Sillage returned an invalid registration state.")
  const recorder = objectPayload(payload.recorder)
  if (typeof recorder.initialization_confirmed !== "boolean") throw new Error("Sillage returned an invalid initialization state.")
  return {
    registered: true,
    recorder: {
      device_id: requiredString(recorder.device_id, "recorder identifier"),
      connectivity_url: localPath(recorder.connectivity_url, "connectivity URL"),
      initialization_url: localPath(recorder.initialization_url, "initialization URL"),
      initialization_confirmed: recorder.initialization_confirmed
    },
    aircraft: payload.aircraft == null ? null : {registration: requiredString(objectPayload(payload.aircraft).registration, "aircraft registration")}
  }
}

/** @param {unknown} value */
export function importReceipt(value) {
  const payload = objectPayload(value)
  const status = requiredString(payload.import_status, "import status")
  if (!["pending", "processing", "imported", "failed"].includes(status)) throw new Error("Sillage returned an unknown import status.")
  return {
    sha256: authenticationHex(payload.sha256), import_status: status,
    error: typeof payload.error === "string" ? payload.error : undefined,
    status_url: payload.status_url == null ? undefined : requiredString(payload.status_url, "import status URL")
  }
}

/** @param {unknown} value */
export function authenticationHex(value) {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("Sillage returned an invalid SHA-256 value.")
  return value
}

/** @param {unknown} value */
export function commandSequence(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("Sillage returned an invalid recording command sequence.")
  return value
}

/** @param {unknown} value @returns {import("./fdr_heartbeat").RawFields} */
function rawFields(value) {
  const fields = objectPayload(value)
  for (const field of Object.values(fields)) {
    if (field !== null && !["string", "number", "boolean"].includes(typeof field)) throw new Error("Sillage returned an invalid heartbeat field.")
  }
  return /** @type {import("./fdr_heartbeat").RawFields} */ (fields)
}

/** @param {unknown} value @returns {import("../types/recorder").Heartbeat[]} */
export function heartbeatPayloads(value) {
  const payload = objectPayload(value)
  if (!Array.isArray(payload.heartbeats)) throw new Error("Sillage returned an invalid heartbeat list.")
  return payload.heartbeats.map((value) => {
    const heartbeat = objectPayload(value)
    const recorder = objectPayload(heartbeat.recorder)
    const source = objectPayload(heartbeat.status)
    /** @type {import("../types/recorder").Heartbeat["status"]} */
    const status = {}
    for (const [key, field] of Object.entries(source)) {
      if (field === null || typeof field === "number" || typeof field === "string" || typeof field === "boolean") status[key] = field
    }
    for (const key of ["wifi_upload", "recording_control", "diagnostics"]) {
      if (source[key] != null) status[key] = rawFields(source[key])
    }
    const command = heartbeat.recording_command == null ? null : objectPayload(heartbeat.recording_command)
    return {
      recorder: {device_id: requiredString(recorder.device_id, "recorder identifier"), firmware: typeof recorder.firmware === "string" ? recorder.firmware : undefined, model: typeof recorder.model === "string" ? recorder.model : undefined},
      seen_at: requiredString(heartbeat.seen_at, "heartbeat timestamp"), status,
      aircraft: heartbeat.aircraft == null ? null : {registration: requiredString(objectPayload(heartbeat.aircraft).registration, "aircraft registration")},
      recording_command: command ? {sequence: commandSequence(command.sequence), status: requiredString(command.status, "recording command status")} : null
    }
  })
}

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

/** @param {unknown} value @returns {import("../types/recorder").RecorderAssembly|null|undefined} */
function recorderAssembly(value) {
  // Omitted identity means unresolved (for older responses), not unassigned.
  if (value === undefined || value === null) return value
  const assembly = objectPayload(value)
  return {
    name: requiredString(assembly.name, "assembly name"),
    identity_label: requiredString(assembly.identity_label, "assembly identity"),
    serial_number: assembly.serial_number == null ? null : requiredString(assembly.serial_number, "assembly serial number"),
    functional_configuration: assembly.functional_configuration == null ? null : requiredString(assembly.functional_configuration, "functional configuration"),
    assembly_method: assembly.assembly_method == null ? null : requiredString(assembly.assembly_method, "assembly method")
  }
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
      ...(recorder.identity_provisioning == null ? {} : { identity_provisioning: identityProvisioning(recorder.identity_provisioning) }),
      assembly: recorderAssembly(recorder.assembly),
      connectivity_url: localPath(recorder.connectivity_url, "connectivity URL"),
      initialization_url: localPath(recorder.initialization_url, "initialization URL"),
      ...(recorder.access_restoration_url == null ? {} : {
        access_restoration_url: localPath(recorder.access_restoration_url, "access restoration URL")
      }),
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
export function authenticationKey(value) {
  // A 32-byte key uses unpadded, canonical Base64url, not a hexadecimal digest.
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value)) {
    throw new Error("Sillage returned an invalid recorder authentication key.")
  }
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

/** @param {unknown} value @returns {import("./fdr_heartbeat").ImportQueue} */
function importQueuePayload(value) {
  const queue = objectPayload(value)
  if (queue.version !== 1 || typeof queue.paused !== "boolean" || !Array.isArray(queue.files) || queue.files.length > 8) {
    throw new Error("Sillage returned an invalid recorder file list.")
  }
  /** @param {unknown} number */
  const integer = (number) => {
    if (typeof number !== "number" || !Number.isInteger(number) || number < 0) throw new Error("Sillage returned an invalid recorder file field.")
    return number
  }
  return {
    version: queue.version, paused: queue.paused,
    boot_id: integer(queue.boot_id), revision: integer(queue.revision),
    command_sequence: integer(queue.command_sequence), command_result: integer(queue.command_result),
    before_index: integer(queue.before_index), next_before_index: integer(queue.next_before_index),
    files: queue.files.map((value) => {
      const file = objectPayload(value)
      const index = integer(file.file_index)
      if (index < 1 || index > 999999) throw new Error("Sillage returned an invalid recorder file index.")
      return {
        file_index: index, boot_id: integer(file.boot_id), size_bytes: integer(file.size_bytes), flags: integer(file.flags),
        duration_ms: file.duration_ms == null ? null : integer(file.duration_ms),
        started_at_unix_ms: file.started_at_unix_ms == null ? null : integer(file.started_at_unix_ms)
      }
    })
  }
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
    if (source.import_queue != null) status.import_queue = importQueuePayload(source.import_queue)
    const command = heartbeat.recording_command == null ? null : objectPayload(heartbeat.recording_command)
    return {
      recorder: {device_id: requiredString(recorder.device_id, "recorder identifier"), assembly: recorderAssembly(recorder.assembly), firmware: typeof recorder.firmware === "string" ? recorder.firmware : undefined, model: typeof recorder.model === "string" ? recorder.model : undefined},
      seen_at: requiredString(heartbeat.seen_at, "heartbeat timestamp"), status,
      aircraft: heartbeat.aircraft == null ? null : {registration: requiredString(objectPayload(heartbeat.aircraft).registration, "aircraft registration")},
      recording_command: command ? {sequence: commandSequence(command.sequence), status: requiredString(command.status, "recording command status")} : null
    }
  })
}

/** @param {unknown} value */
export function identityProvisioning(value) {
  if (value == null) return null
  const payload = objectPayload(value)
  if (typeof payload.command !== "string" || !/^[0-9a-f]{82}$/i.test(payload.command) ||
      typeof payload.signature !== "string" || !/^[0-9a-f]{64}$/i.test(payload.signature)) {
    throw new Error("Sillage returned an invalid FDR name configuration.")
  }
  return {command: payload.command, signature: payload.signature}
}

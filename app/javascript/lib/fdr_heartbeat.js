/** @typedef {Record<string, number | string | boolean | null>} RawFields */
/** @typedef {{[key: string]: number | string | boolean | null | RawFields | undefined, wifi_upload?: RawFields, recording_control?: RawFields}} RawStatus */
/** @param {RawStatus} status */
export function normalizeSillageHeartbeatStatus(status = {}) {
  const upload = status.wifi_upload || {}
  const recording = status.recording_control
  return {
    stateFlags: Number(status.state_flags || 0),
    sensorValidity: Number(status.sensor_validity || 0),
    alertFlags: Number(status.alert_flags || 0),
    storageFreeMiB: Number(status.storage_free_mib || 0),
    storageTotalMiB: Number(status.storage_total_mib || 0),
    lastSyncResult: Number(status.last_sync_result || 0),
    securityState: 2,
    activeFileIndex: Number(status.active_file_index || 0),
    lastSyncedFileIndex: Number(status.last_synced_file_index || 0),
    wifiUpload: {
      state: String(upload.state || "disconnected"),
      fileIndex: Number(upload.file_index || 0),
      offset: Number(upload.offset || 0),
      sizeBytes: Number(upload.size_bytes || 0),
      lastHttpStatus: Number(upload.last_http_status || 0),
      rejectedFiles: Number(upload.rejected_files || 0),
      deferredFiles: Number(upload.deferred_files || 0),
      damagedFileIndex: Number(upload.damaged_file_index || 0)
    },
    recordingControl: recording && typeof recording === "object"
      ? {
          requestedEnabled: recording.requested_enabled === true,
          effectiveEnabled: recording.effective_enabled === true,
          lastCommandSequence: Number(recording.last_command_sequence || 0),
          lastCommandResult: Number(recording.last_command_result || 0)
        }
      : null
  }
}

/** @param {Partial<ReturnType<typeof normalizeSillageHeartbeatStatus>["wifiUpload"]>} upload */
export function describeWifiUpload(upload = {}) {
  const filename = upload.fileIndex
    ? `FDR${String(upload.fileIndex).padStart(6, "0")}.BIN`
    : "recordings"
  const size = Math.max(0, Number(upload.sizeBytes) || 0)
  const offset = Math.max(0, Number(upload.offset) || 0)
  const percent = size > 0
    ? Math.min(100, Math.round(offset / size * 100))
    : 0
  switch (upload.state) {
    case "waiting_stable":
      return "Waiting for stable Wi-Fi before upload"
    case "preparing":
    case "requesting":
      return `Preparing ${filename} for automatic upload`
    case "uploading":
      return `Uploading ${filename} · ${percent}%`
    case "finalizing":
      return `Finalizing ${filename}`
    case "verifying":
      return `Verifying ${filename} in Sillage`
    case "complete":
      if ((upload.deferredFiles || 0) > 0) return "Upload pass finished · temporary failures will retry automatically"
      return (upload.rejectedFiles || 0) > 0 || (upload.damagedFileIndex || 0) > 0
        ? "Upload finished · rejected recordings retained on the card"
        : "All sealed recordings synchronized"
    case "paused":
      return size > 0
        ? `Automatic upload paused · ${filename} · ${percent}%`
        : "Automatic upload paused"
    case "error":
      return upload.lastHttpStatus
        ? `Automatic upload retrying · HTTP ${upload.lastHttpStatus}`
        : "Automatic upload retrying"
    default:
      return "Automatic upload waiting"
  }
}

/** @param {RawFields} diagnostics */
export function normalizeSillageHeartbeatDiagnostics(diagnostics = {}) {
  return {
    gpsErrors: Number(diagnostics.gps_errors || 0),
    imuErrors: Number(diagnostics.imu_errors || 0),
    airspeedErrors: Number(diagnostics.airspeed_errors || 0),
    storageWriteErrors: Number(diagnostics.storage_write_errors || 0),
    droppedRecords: Number(diagnostics.dropped_records || 0)
  }
}

/** @param {{recorder?: {device_id?: string, firmware?: string, model?: string}}} heartbeat */
export function sillageHeartbeatIdentity(heartbeat) {
  const recorder = heartbeat?.recorder || {}
  const deviceId = String(recorder.device_id || "").trim().toUpperCase()
  if (!deviceId) throw new Error("Sillage returned a heartbeat without a recorder identifier.")

  return {
    deviceId,
    firmware: recorder.firmware,
    model: recorder.model
  }
}

/** @param {string} value */
export function formatSeenAt(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return "just now"
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  return seconds < 2 ? "just now" : `${seconds}s ago`
}

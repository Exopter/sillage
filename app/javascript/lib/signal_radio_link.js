/** @typedef {{deviceId: string, recorderLabel: string, aircraftLabel: string|null, registered: boolean, assemblyId: number|null, canAcquire: boolean, modeControl?: boolean}} RadioIdentity */

/** Resolve the received full ECU identity through Sillage's current installation chain.
 * @param {string} deviceId @returns {Promise<RadioIdentity>} */
export async function resolveRadioIdentity(deviceId) {
  const response = await fetch(`/api/v1/fdr-registration?device_id=${encodeURIComponent(deviceId)}`, {
    credentials: "same-origin", cache: "no-store", headers: {Accept: "application/json"}, signal: AbortSignal.timeout(5000)
  })
  if (!response.ok) throw new Error("Aircraft identity is unavailable")
  const payload = await response.json()
  if (payload?.registered === false) return {deviceId, recorderLabel: deviceId, aircraftLabel: null, registered: false, assemblyId: null, canAcquire: true}
  if (payload?.registered !== true || payload.recorder?.device_id !== deviceId)
    throw new Error("Recorder identity does not match the radio")
  const recorderLabel = payload.recorder.assembly?.serial_number || payload.recorder.name || deviceId
  const aircraftLabel = payload.aircraft?.display_name ?? null
  if (typeof recorderLabel !== "string" || !recorderLabel.trim() ||
      (payload.aircraft != null && (typeof aircraftLabel !== "string" || !aircraftLabel.trim())))
    throw new Error("Invalid aircraft identity")
  return {deviceId, recorderLabel, aircraftLabel, registered: true, assemblyId: Number.isInteger(payload.recorder.assembly_id) ? payload.recorder.assembly_id : null, canAcquire: payload.recorder.acquisition_allowed === true,
    modeControl: payload.recorder.mode_control === true}
}

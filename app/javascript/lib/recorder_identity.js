/** @param {Pick<import("../types/recorder").Identity, "assembly">} identity */
export function recorderLabel(identity) {
  if (identity.assembly) return identity.assembly.serial_number || [...new Set([identity.assembly.name, identity.assembly.identity_label])].join(" · ")
  return identity.assembly === null ? "Unassigned ECU" : "Recorder not identified"
}

/** @param {import("../types/recorder").Identity} identity */
export function recorderTechnicalLabel(identity) {
  const id = identity.deviceId || ""
  return /^ECU-[0-9A-F]{12}$/.test(id) ? `ECU-${id.slice(-6)}` : id
}

/** @param {Pick<import("../types/recorder").Identity, "assembly">} identity */
export function recorderLabel(identity) {
  if (identity.assembly) return identity.assembly.serial_number || [...new Set([identity.assembly.name, identity.assembly.identity_label])].join(" · ")
  return identity.assembly === null ? "Unassigned ECU" : "Recorder not identified"
}

/** @param {import("../types/recorder").Identity} identity */
export function recorderTechnicalLabel(identity) {
  return identity.deviceId || ""
}

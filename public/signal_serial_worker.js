const MAGIC_V2 = 0xfd
const MAGIC_V1 = 0xfe
const CRC_EXTRAS = new Map([[0, 50], [1, 124], [4, 237], [24, 24], [31, 246], [74, 20], [109, 185], [137, 195], [253, 83]])

let buffer = new Uint8Array(0)
let captureHandle = null
let captureOffset = 0
let errors = 0
let ignored = 0
let lastSequence = null
let dropped = 0

self.onmessage = async ({ data }) => {
  if (data.type === "init-capture") {
    await openCapture(data.filename)
  } else if (data.type === "bytes") {
    feed(new Uint8Array(data.bytes), data.receivedAtUs)
  } else if (data.type === "close") {
    closeCapture()
    self.postMessage({ type: "capture-closed", bytes: captureOffset })
  }
}

async function openCapture(filename) {
  try {
    const root = await navigator.storage.getDirectory()
    const file = await root.getFileHandle(filename, { create: true })
    captureHandle = await file.createSyncAccessHandle()
    captureOffset = captureHandle.getSize()
    self.postMessage({ type: "capture-ready", filename, bytes: captureOffset })
  } catch (error) {
    self.postMessage({ type: "capture-error", message: error.message })
  }
}

function closeCapture() {
  if (!captureHandle) return
  captureHandle.flush()
  captureHandle.close()
  captureHandle = null
}

function feed(chunk, receivedAtUs) {
  const combined = new Uint8Array(buffer.length + chunk.length)
  combined.set(buffer)
  combined.set(chunk, buffer.length)
  buffer = combined

  while (buffer.length) {
    let start = -1
    for (let index = 0; index < buffer.length; index += 1) {
      if (buffer[index] === MAGIC_V2 || buffer[index] === MAGIC_V1) {
        start = index
        break
      }
    }
    if (start < 0) {
      ignored += buffer.length
      buffer = new Uint8Array(0)
      break
    }
    if (start > 0) {
      ignored += start
      buffer = buffer.slice(start)
    }
    if (buffer.length < 2) break

    const isV2 = buffer[0] === MAGIC_V2
    const signatureLength = isV2 && (buffer[2] & 0x01) ? 13 : 0
    const frameLength = (isV2 ? 12 : 8) + buffer[1] + signatureLength
    if (buffer.length < frameLength) break

    const raw = buffer.slice(0, frameLength)
    buffer = buffer.slice(frameLength)
    const timestampUs = BigInt(receivedAtUs || Date.now() * 1000)
    appendCapture(timestampUs, raw)
    if (isV2 && (raw[2] & 0x01)) {
      errors += 1
      continue
    }

    const messageId = isV2 ? raw[7] | (raw[8] << 8) | (raw[9] << 16) : raw[5]
    const extra = CRC_EXTRAS.get(messageId)
    if (extra == null) {
      ignored += 1
      continue
    }
    const stored = raw[raw.length - 2] | (raw[raw.length - 1] << 8)
    if (x25Crc(raw.slice(1, -2), extra) !== stored) {
      errors += 1
      continue
    }

    const sequence = isV2 ? raw[4] : raw[2]
    if (lastSequence != null) {
      const delta = (sequence - lastSequence + 256) % 256
      if (delta > 1 && delta < 128) dropped += delta - 1
    }
    lastSequence = sequence

    const payload = raw.slice(isV2 ? 10 : 6, -2)
    const decoded = decode(messageId, payload)
    const transferableRaw = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    self.postMessage({
      type: "frame",
      messageId,
      systemId: isV2 ? raw[5] : raw[3],
      componentId: isV2 ? raw[6] : raw[4],
      sequence,
      receivedAtUs: timestampUs.toString(),
      decoded,
      parser: { errors, ignored, dropped },
      raw: transferableRaw
    }, [transferableRaw])
  }
}

function appendCapture(receivedAtUs, raw) {
  if (!captureHandle) return
  const record = new Uint8Array(10 + raw.length)
  const view = new DataView(record.buffer)
  view.setBigUint64(0, receivedAtUs, true)
  view.setUint16(8, raw.length, true)
  record.set(raw, 10)
  captureHandle.write(record, { at: captureOffset })
  captureOffset += record.length
  if (captureOffset % 8192 < record.length) captureHandle.flush()
}

function decode(messageId, payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const f32 = (offset) => view.getFloat32(offset, true)
  const u16 = (offset) => view.getUint16(offset, true)
  const i16 = (offset) => view.getInt16(offset, true)
  const u32 = (offset) => view.getUint32(offset, true)
  const i32 = (offset) => view.getInt32(offset, true)

  if (messageId === 0 && payload.length >= 9) {
    return { name: "heartbeat", customMode: u32(0), type: payload[4], autopilot: payload[5], baseMode: payload[6], systemStatus: payload[7] }
  }
  if (messageId === 1 && payload.length >= 31) {
    return { name: "system_status", sensorsPresent: u32(0), sensorsEnabled: u32(4), sensorsHealthy: u32(8), loadPermille: u16(12), voltageMv: u16(14), batteryRemaining: new Int8Array(payload.buffer, payload.byteOffset + 30, 1)[0] }
  }
  if (messageId === 4 && payload.length >= 14) {
    return { name: "ping", timeUs: view.getBigUint64(0, true).toString(), sequence: u32(8), targetSystem: payload[12], targetComponent: payload[13] }
  }
  if (messageId === 24 && payload.length >= 30) {
    return { name: "gps", timeUs: view.getBigUint64(0, true).toString(), latitude: i32(8) / 1e7, longitude: i32(12) / 1e7, altitudeM: i32(16) / 1000, ephM: u16(20) / 100, epvM: u16(22) / 100, velocityMps: u16(24) / 100, courseDeg: u16(26) / 100, fix: payload[28], satellites: payload[29] }
  }
  if (messageId === 31 && payload.length >= 32) {
    const quaternion = [f32(4), f32(8), f32(12), f32(16)]
    const [w, x, y, z] = quaternion
    return { name: "attitude", quaternion, rollDeg: radiansToDegrees(Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))), pitchDeg: radiansToDegrees(Math.asin(clamp(2 * (w * y - z * x), -1, 1))), yawDeg: normalizeDegrees(radiansToDegrees(Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))), rollSpeed: f32(20), pitchSpeed: f32(24), yawSpeed: f32(28) }
  }
  if (messageId === 74 && payload.length >= 20) {
    return { name: "vfr_hud", airspeedMps: f32(0), groundspeedMps: f32(4), altitudeM: f32(8), climbMps: f32(12), headingDeg: i16(16), throttlePercent: u16(18) }
  }
  if (messageId === 109 && payload.length >= 9) {
    return { name: "radio", rxErrors: u16(0), fixed: u16(2), rssi: payload[4], remoteRssi: payload[5], txBufferPercent: payload[6], noise: payload[7], remoteNoise: payload[8], rssiDbm: payload[4] / 1.9 - 127, remoteRssiDbm: payload[5] / 1.9 - 127 }
  }
  if (messageId === 137 && payload.length >= 14) {
    return { name: "pressure", timeBootMs: u32(0), absoluteHpa: f32(4), differentialHpa: f32(8), temperatureC: i16(12) / 100 }
  }
  if (messageId === 253 && payload.length >= 2) {
    const end = payload.slice(1, 51).indexOf(0)
    const text = new TextDecoder().decode(payload.slice(1, end < 0 ? Math.min(51, payload.length) : end + 1))
    return { name: "status_text", severity: payload[0], text }
  }
  return { name: "unknown" }
}

function x25Crc(bytes, extra) {
  let crc = 0xffff
  for (const value of bytes) crc = x25Accumulate(value, crc)
  return x25Accumulate(extra, crc)
}

function x25Accumulate(value, crc) {
  let temporary = value ^ (crc & 0xff)
  temporary ^= (temporary << 4) & 0xff
  return ((crc >> 8) ^ (temporary << 8) ^ (temporary << 3) ^ (temporary >> 4)) & 0xffff
}

function radiansToDegrees(value) { return value * 180 / Math.PI }
function normalizeDegrees(value) { return (value + 360) % 360 }
function clamp(value, minimum, maximum) { return Math.min(Math.max(value, minimum), maximum) }

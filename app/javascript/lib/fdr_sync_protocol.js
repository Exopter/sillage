import {
  EraseRecordingsResult,
  Exs1Layout,
  FRAME_HEADER_SIZE,
  FRAME_MAGIC,
  USB_CHUNK_SIZE,
  USB_PROTOCOL_VERSION,
  UsbCapability,
  UsbErrorCode,
  UsbMessage
} from "exs1_contract"

export {
  EraseRecordingsResult,
  USB_CHUNK_SIZE,
  USB_PROTOCOL_VERSION,
  UsbCapability,
  UsbErrorCode,
  UsbMessage
} from "exs1_contract"

export const USB_CONNECTION_TIMEOUT_MS = 10_000
export const USB_REQUEST_TIMEOUT_MS = 30_000
export const USB_FILE_PREPARATION_TIMEOUT_MS = 120_000
export const USB_ERASE_RECORDINGS_TIMEOUT_MS = 120_000
export const USB_PORT_RELEASE_TIMEOUT_MS = 2_000

/**
 * Error metadata shared across USB, BLE, and Wi-Fi protocol failures.
 *
 * @typedef {Error & {
 *   fdrAuthResult?: number,
 *   recorderCode?: number,
 *   recorderRequestType?: number,
 *   recorderWifiCommand?: number,
 *   recorderWifiResult?: number,
 *   timeoutMs?: number,
 *   usbConnectionLost?: boolean,
 *   usbRequestTimedOut?: boolean,
 *   usbRequestType?: number
 * }} FdrProtocolError
 */
/** @typedef {Uint8Array | DataView | ArrayBuffer | ArrayLike<number> | number | null | undefined} BinaryValue */
/** @typedef {{ payload: Uint8Array, sequence: number, type: number }} UsbFrame */
/**
 * @typedef {Object} UsbSerialPort
 * @property {ReadableStream<Uint8Array> | null} readable
 * @property {WritableStream<Uint8Array> | null} writable
 * @property {(options: { baudRate: number }) => Promise<void>} open
 * @property {() => Promise<void>} close
 */
/**
 * @typedef {Object} UsbPortLockState
 * @property {{ locked?: boolean } | null} [readable]
 * @property {{ locked?: boolean } | null} [writable]
 */
/**
 * @typedef {Object} GattCharacteristicLike
 * @property {() => Promise<DataView>} readValue
 * @property {(payload: Uint8Array) => Promise<void>} writeValue
 * @property {(payload: Uint8Array) => Promise<void>} [writeValueWithResponse]
 */
/**
 * @typedef {Object} WifiProfileInput
 * @property {boolean} enabled
 * @property {string} [password]
 * @property {number} position
 * @property {boolean} [preservePassword]
 * @property {number} security
 * @property {string} ssid
 */
/** @typedef {{ heartbeatUrl: string }} WifiSillageInput */
/** @typedef {{ wifi: (payload: Uint8Array) => Promise<Uint8Array> }} UsbWifiTransport */

const USB_CONNECTION_TIMEOUT_MESSAGE = "USB connection timed out after 10 seconds. Disconnect and reconnect the recorder, then try again."
const USB_PORT_BUSY_MESSAGE = "USB-C is still in use by another Sillage page. Wait a moment, then try again."
const USB_CONNECTION_CLOSED_MESSAGE = "The recorder disconnected during synchronization. The source recording and any partial transfer are preserved; reconnect it to resume."

export const UsbSecurityCommand = Object.freeze({
  INSTALL_KEY: 1,
  GET_CHALLENGE: 2,
  AUTHENTICATE: 3
})

export const BleUuid = Object.freeze({
  service: "4f58a100-7b6d-4d0c-9f2a-5f4452440001",
  status: "4f58a101-7b6d-4d0c-9f2a-5f4452440001",
  diagnostics: "4f58a102-7b6d-4d0c-9f2a-5f4452440001",
  config: "4f58a103-7b6d-4d0c-9f2a-5f4452440001",
  debug: "4f58a104-7b6d-4d0c-9f2a-5f4452440001",
  device: "4f58a105-7b6d-4d0c-9f2a-5f4452440001",
  wifi: "4f58a106-7b6d-4d0c-9f2a-5f4452440001",
  authentication: "4f58a107-7b6d-4d0c-9f2a-5f4452440001"
})

export const WifiCommand = Object.freeze({
  GET_STATUS: 1,
  GET_PROFILE: 2,
  START_SCAN: 3,
  GET_SCAN_RESULT: 4,
  BEGIN_UPDATE: 5,
  STAGE_PROFILE: 6,
  COMMIT_UPDATE: 7,
  CANCEL_UPDATE: 8,
  SET_SILLAGE: 9,
  GET_SILLAGE: 10
})

export const WifiResponse = Object.freeze({
  STATUS: 0x81,
  PROFILE: 0x82,
  SCAN_RESULT: 0x83,
  ACK: 0x84,
  SILLAGE: 0x85,
  ERROR: 0xff
})

export const WifiResult = Object.freeze({
  OK: 0,
  INVALID_COMMAND: 1,
  INVALID_INDEX: 2,
  INVALID_DATA: 3,
  STORAGE_ERROR: 4,
  BUSY: 5,
  NOT_READY: 6,
  UNAUTHORIZED: 7
})

export const FdrAuthResult = Object.freeze({
  OK: 0,
  INVALID_DATA: 1,
  ALREADY_CONFIGURED: 2,
  STORAGE_ERROR: 3,
  NOT_CONFIGURED: 4,
  AUTHENTICATION_FAILED: 5
})

export const WifiScanState = Object.freeze({ IDLE: 0, REQUESTED: 1, RUNNING: 2, COMPLETE: 3, FAILED: 4 })
export const WifiStageFlag = Object.freeze({ ENABLED: 1, PRESERVE_PASSWORD: 2 })
export const WIFI_MAX_PROFILES = 5
export const WIFI_MAX_SILLAGE_URL_BYTES = 112
export const FDR_AUTH_KEY_BYTES = 32

const MAX_FRAME_PAYLOAD = 1024 * 1024
const USB_ERROR_MESSAGES = /** @type {Readonly<Record<number, string>>} */ (Object.freeze({
  [UsbErrorCode.BAD_FRAME]: "The recorder rejected a corrupted USB command. Disconnect and reconnect it, then try again.",
  [UsbErrorCode.BAD_SEQUENCE]: "The recorder USB session is no longer active. Disconnect and reconnect it, then try again.",
  [UsbErrorCode.NOT_READY]: "The recorder is not ready yet. Wait a few seconds, then try again.",
  [UsbErrorCode.BAD_REQUEST]: "Sillage and the recorder firmware do not support the same USB command. Update them to compatible versions.",
  [UsbErrorCode.STORAGE_ERROR]: "The recorder microSD is unavailable. Check that the card and reader are connected, then try again.",
  [UsbErrorCode.HASH_MISMATCH]: "The recorder rejected the synchronization acknowledgement because the file checksum did not match. The file remains on the recorder; reconnect and try again.",
  [UsbErrorCode.AUTHENTICATION_REQUIRED]: "Sillage must authenticate this USB-C session before the recorder accepts synchronization or configuration commands."
}))
const WIFI_ERROR_MESSAGES = /** @type {Readonly<Record<number, string>>} */ (Object.freeze({
  [WifiResult.INVALID_COMMAND]: "The recorder does not support this Wi-Fi command. Check that Sillage and the recorder firmware are compatible.",
  [WifiResult.INVALID_INDEX]: "The selected Wi-Fi profile no longer exists. Refresh the page and try again.",
  [WifiResult.INVALID_DATA]: "The recorder rejected the Wi-Fi settings. Check the network name, security type, and password.",
  [WifiResult.STORAGE_ERROR]: "The recorder could not save the Wi-Fi settings. Restart it and try again.",
  [WifiResult.BUSY]: "The recorder is busy with another Wi-Fi operation. Wait a few seconds and try again.",
  [WifiResult.NOT_READY]: "The recorder is not ready for this Wi-Fi operation. Wait for the current scan or update to finish.",
  [WifiResult.UNAUTHORIZED]: "Sillage has not authenticated this BLE session. Reconnect the recorder and try again."
}))
const FDR_AUTH_ERROR_MESSAGES = /** @type {Readonly<Record<number, string>>} */ (Object.freeze({
  [FdrAuthResult.INVALID_DATA]: "The recorder rejected the Sillage authentication data.",
  [FdrAuthResult.ALREADY_CONFIGURED]: "This recorder is already claimed with a different Sillage authentication key.",
  [FdrAuthResult.STORAGE_ERROR]: "The recorder could not save its Sillage authentication key.",
  [FdrAuthResult.NOT_CONFIGURED]: "Connect this recorder over USB-C once to establish its Sillage authentication key.",
  [FdrAuthResult.AUTHENTICATION_FAILED]: "The recorder rejected the Sillage authentication proof."
}))

export class UsbFdrClient {
  /** @param {UsbSerialPort} port */
  constructor(port) {
    this.port = port
    this.sequence = 0
    /** @type {ReadableStreamDefaultReader<Uint8Array> | null} */
    this.reader = null
    /** @type {WritableStreamDefaultWriter<Uint8Array> | null} */
    this.writer = null
    /** @type {FrameReader | null} */
    this.frameReader = null
    /** @type {Promise<unknown>} */
    this.requestTail = Promise.resolve()
    /** @type {Promise<void> | null} */
    this.closePromise = null
  }

  async open() {
    await waitForUsbPortAvailability(this.port)
    if (!this.port.readable || !this.port.writable) await this.port.open({ baudRate: 115200 })
    await waitForUsbPortAvailability(this.port)
    const readable = this.port.readable
    const writable = this.port.writable
    if (!readable || !writable) throw usbConnectionError()
    this.reader = readable.getReader()
    this.writer = writable.getWriter()
    this.frameReader = new FrameReader(this.reader)
  }

  async connect({ timeoutMs = USB_CONNECTION_TIMEOUT_MS } = {}) {
    let timedOut = false
    let timeoutId
    const connection = (async () => {
      await this.open()
      if (timedOut) {
        await this.close()
        throw new Error(USB_CONNECTION_TIMEOUT_MESSAGE)
      }
      return this.hello()
    })()
    const timeout = new Promise((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        timedOut = true
        void this.close()
        reject(new Error(USB_CONNECTION_TIMEOUT_MESSAGE))
      }, timeoutMs)
    })

    try {
      return await Promise.race([connection, timeout])
    } finally {
      globalThis.clearTimeout(timeoutId)
    }
  }

  async hello() {
    const frame = await this.request(UsbMessage.HELLO, new Uint8Array(), [UsbMessage.DEVICE_INFO])
    return parseDeviceInfo(frame.payload)
  }

  async nextFile() {
    const frame = await this.request(
      UsbMessage.NEXT_FILE,
      new Uint8Array(),
      [UsbMessage.FILE_MANIFEST, UsbMessage.NO_FILE],
      { timeoutMs: USB_FILE_PREPARATION_TIMEOUT_MS }
    )
    return frame.type === UsbMessage.NO_FILE ? null : parseFileManifest(frame.payload)
  }

  /**
   * @param {number} fileIndex
   * @param {number} offset
   * @param {number} [length]
   */
  async readChunk(fileIndex, offset, length = USB_CHUNK_SIZE) {
    const payload = new Uint8Array(Exs1Layout.READ_CHUNK)
    const view = new DataView(payload.buffer)
    view.setUint32(0, fileIndex, true)
    view.setBigUint64(4, BigInt(offset), true)
    view.setUint32(12, length, true)
    const frame = await this.request(UsbMessage.READ_CHUNK, payload, [UsbMessage.FILE_CHUNK])
    return parseFileChunk(frame.payload, fileIndex, offset)
  }

  /**
   * @param {number} fileIndex
   * @param {string} sha256
   */
  async acknowledge(fileIndex, sha256) {
    const payload = new Uint8Array(Exs1Layout.ACK_FILE)
    new DataView(payload.buffer).setUint32(0, fileIndex, true)
    payload.set(hexToBytes(sha256), 4)
    await this.request(UsbMessage.ACK_FILE, payload, [UsbMessage.ACK_ACCEPTED])
  }

  async eraseRecordings() {
    const frame = await this.request(
      UsbMessage.ERASE_RECORDINGS,
      new Uint8Array(),
      [UsbMessage.ERASE_RECORDINGS_DATA],
      { timeoutMs: USB_ERASE_RECORDINGS_TIMEOUT_MS }
    )
    return parseEraseRecordingsResult(frame.payload)
  }

  async status() {
    const frame = await this.request(UsbMessage.STATUS, new Uint8Array(), [UsbMessage.STATUS_DATA])
    return parseBleStatus(frame.payload)
  }

  async diagnostics() {
    const frame = await this.request(UsbMessage.DIAGNOSTICS, new Uint8Array(), [UsbMessage.DIAGNOSTICS_DATA])
    return parseBleDiagnostics(frame.payload)
  }

  async config() {
    const frame = await this.request(UsbMessage.CONFIG, new Uint8Array(), [UsbMessage.CONFIG_DATA])
    return parseBleConfig(frame.payload)
  }

  /** @param {number} statusIntervalSeconds */
  async writeConfig(statusIntervalSeconds) {
    const frame = await this.request(
      UsbMessage.SET_CONFIG,
      encodeBleConfig(statusIntervalSeconds),
      [UsbMessage.CONFIG_DATA]
    )
    return parseBleConfig(frame.payload)
  }

  async debug() {
    const frame = await this.request(UsbMessage.DEBUG, new Uint8Array(), [UsbMessage.DEBUG_DATA])
    return new TextDecoder().decode(frame.payload)
  }

  /** @param {Uint8Array} payload */
  async wifi(payload) {
    const frame = await this.request(UsbMessage.WIFI, payload, [UsbMessage.WIFI_DATA])
    return frame.payload
  }

  /** @param {string} encodedKey */
  async installAuthenticationKey(encodedKey) {
    const key = decodeBase64Url(encodedKey)
    if (key.length !== FDR_AUTH_KEY_BYTES) throw new Error("The Sillage authentication key must be 32 bytes.")
    const payload = new Uint8Array(2 + key.length)
    payload.set([1, UsbSecurityCommand.INSTALL_KEY])
    payload.set(key, 2)
    const frame = await this.request(UsbMessage.SECURITY, payload, [UsbMessage.SECURITY_DATA])
    const status = parseUsbSecurityStatus(frame.payload)
    if (status.result !== FdrAuthResult.OK) throw fdrAuthenticationError(status.result)
    return status
  }

  async usbAuthenticationChallenge() {
    const payload = Uint8Array.from([1, UsbSecurityCommand.GET_CHALLENGE])
    const frame = await this.request(UsbMessage.SECURITY, payload, [UsbMessage.SECURITY_DATA])
    const status = parseUsbSecurityStatus(frame.payload)
    if (status.result !== FdrAuthResult.OK && status.result !== FdrAuthResult.NOT_CONFIGURED) {
      throw fdrAuthenticationError(status.result)
    }
    if (status.configured && /^0+$/.test(status.nonce)) {
      throw new Error("The recorder did not provide a fresh authentication challenge. Disconnect and reconnect it, then try again.")
    }
    return status
  }

  /** @param {string} proof */
  async authenticateUsbSession(proof) {
    const proofBytes = hexToBytes(proof)
    const payload = new Uint8Array(2 + proofBytes.length)
    payload.set([1, UsbSecurityCommand.AUTHENTICATE])
    payload.set(proofBytes, 2)
    const frame = await this.request(UsbMessage.SECURITY, payload, [UsbMessage.SECURITY_DATA])
    const status = parseUsbSecurityStatus(frame.payload)
    if (status.result !== FdrAuthResult.OK) throw fdrAuthenticationError(status.result)
    if (!status.authenticated) throw new Error("The recorder did not authenticate the USB-C session.")
    return status
  }

  /**
   * @param {number} type
   * @param {Uint8Array} payload
   * @param {number[]} expectedTypes
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<UsbFrame>}
   */
  request(type, payload, expectedTypes, { timeoutMs = USB_REQUEST_TIMEOUT_MS } = {}) {
    const operation = this.requestTail.then(() => this.performRequest(type, payload, expectedTypes, { timeoutMs }))
    this.requestTail = operation.catch(() => {})
    return operation
  }

  /**
   * @param {number} type
   * @param {Uint8Array} payload
   * @param {number[]} expectedTypes
   * @param {{ timeoutMs: number }} options
   * @returns {Promise<UsbFrame>}
   */
  async performRequest(type, payload, expectedTypes, { timeoutMs }) {
    if (!this.writer || !this.frameReader) throw usbConnectionError()

    let timeoutId
    const exchange = this.exchangeFrame(type, payload, expectedTypes)
    const timeout = new Promise((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        reject(usbRequestTimeoutError(type, timeoutMs))
        void this.close()
      }, timeoutMs)
    })

    try {
      return await Promise.race([exchange, timeout])
    } catch (error) {
      if (!this.writer || !this.frameReader) {
        if (error?.usbRequestTimedOut) throw error
        throw usbConnectionError()
      }
      throw error
    } finally {
      globalThis.clearTimeout(timeoutId)
    }
  }

  /**
   * @param {number} type
   * @param {Uint8Array} payload
   * @param {number[]} expectedTypes
   * @returns {Promise<UsbFrame>}
   */
  async exchangeFrame(type, payload, expectedTypes) {
    const writer = this.writer
    const frameReader = this.frameReader
    if (!writer || !frameReader) throw usbConnectionError()

    const sequence = this.sequence++ >>> 0
    try {
      await writer.write(encodeFrame(type, sequence, payload))
      while (true) {
        const frame = await frameReader.read()
        if (frame.sequence !== sequence) continue
        if (frame.type === UsbMessage.ERROR) throw parseUsbDeviceError(frame.payload)
        if (!expectedTypes.includes(frame.type)) throw new Error(`Unexpected EXS1 response ${frame.type}.`)
        return frame
      }
    } catch (error) {
      if (!this.writer || !this.frameReader || isUsbTransportError(error)) throw usbConnectionError()
      throw error
    }
  }

  async close() {
    if (this.closePromise) return this.closePromise
    this.closePromise = this.performClose()
    try {
      await this.closePromise
    } finally {
      this.closePromise = null
    }
  }

  async performClose() {
    const reader = this.reader
    const writer = this.writer
    this.reader = null
    this.writer = null
    this.frameReader = null
    try { await reader?.cancel() } catch (_) {}
    try { reader?.releaseLock() } catch (_) {}
    try { writer?.releaseLock() } catch (_) {}
    try { await this.port?.close() } catch (_) {}
  }
}

function usbConnectionError() {
  const error = /** @type {FdrProtocolError} */ (new Error(USB_CONNECTION_CLOSED_MESSAGE))
  error.usbConnectionLost = true
  return error
}

/**
 * @param {number} type
 * @param {number} timeoutMs
 */
function usbRequestTimeoutError(type, timeoutMs) {
  const seconds = Math.ceil(timeoutMs / 1000)
  let message
  if (type === UsbMessage.NEXT_FILE) {
    message = `The recorder stopped responding while preparing the sealed recording (${seconds}s timeout). The recording remains stored on the recorder; reconnect it to try again.`
  } else if (type === UsbMessage.READ_CHUNK) {
    message = `The recorder stopped responding while transferring the recording (${seconds}s timeout). The partial transfer is saved; reconnect it to resume.`
  } else {
    message = `The recorder stopped responding over USB-C (${seconds}s timeout). Reconnect it and try again.`
  }
  const error = /** @type {FdrProtocolError} */ (new Error(message))
  error.usbConnectionLost = true
  error.usbRequestTimedOut = true
  error.usbRequestType = type
  error.timeoutMs = timeoutMs
  return error
}

/** @param {unknown} error */
function isUsbTransportError(error) {
  return error instanceof Error && (
    error.name === "NetworkError"
    || error.name === "InvalidStateError"
    || error.message === "The recorder disconnected during synchronization."
  )
}

/**
 * @param {UsbPortLockState} port
 * @param {{ timeoutMs?: number }} [options]
 */
export async function waitForUsbPortAvailability(port, { timeoutMs = USB_PORT_RELEASE_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + timeoutMs
  while (port.readable?.locked || port.writable?.locked) {
    if (Date.now() >= deadline) throw new Error(USB_PORT_BUSY_MESSAGE)
    await new Promise((resolve) => globalThis.setTimeout(resolve, 25))
  }
}

export class FrameReader {
  /** @param {ReadableStreamDefaultReader<Uint8Array>} reader */
  constructor(reader) {
    this.reader = reader
    this.buffer = new Uint8Array()
  }

  /** @returns {Promise<UsbFrame>} */
  async read() {
    while (true) {
      const frame = this.extractFrame()
      if (frame) return frame
      const { value, done } = await this.reader.read()
      if (done) throw new Error("The recorder disconnected during synchronization.")
      this.buffer = joinBytes(this.buffer, value)
    }
  }

  /** @returns {UsbFrame | null} */
  extractFrame() {
    const magicOffset = findMagic(this.buffer)
    if (magicOffset < 0) {
      this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - 3))
      return null
    }
    if (magicOffset > 0) this.buffer = this.buffer.slice(magicOffset)
    if (this.buffer.length < FRAME_HEADER_SIZE) return null

    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength)
    const version = view.getUint8(4)
    const type = view.getUint8(5)
    const sequence = view.getUint32(8, true)
    const payloadLength = view.getUint32(12, true)
    const payloadCrc32 = view.getUint32(16, true)
    if (version !== USB_PROTOCOL_VERSION || payloadLength > MAX_FRAME_PAYLOAD) {
      this.buffer = this.buffer.slice(1)
      return null
    }
    if (this.buffer.length < FRAME_HEADER_SIZE + payloadLength) return null

    const payload = this.buffer.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + payloadLength)
    this.buffer = this.buffer.slice(FRAME_HEADER_SIZE + payloadLength)
    if (crc32(payload) !== payloadCrc32) throw new Error("EXS1 frame CRC mismatch.")
    return { type, sequence, payload }
  }
}

/**
 * @param {number} type
 * @param {number} sequence
 * @param {BinaryValue} [payload]
 */
export function encodeFrame(type, sequence, payload = new Uint8Array()) {
  const bytes = exactBytes(payload)
  const frame = new Uint8Array(FRAME_HEADER_SIZE + bytes.length)
  frame.set(FRAME_MAGIC)
  const view = new DataView(frame.buffer)
  view.setUint8(4, USB_PROTOCOL_VERSION)
  view.setUint8(5, type)
  view.setUint16(6, 0, true)
  view.setUint32(8, sequence, true)
  view.setUint32(12, bytes.length, true)
  view.setUint32(16, crc32(bytes), true)
  frame.set(bytes, FRAME_HEADER_SIZE)
  return frame
}

/** @param {BinaryValue} bytes */
export function crc32(bytes) {
  let crc = 0xffffffff
  for (const value of exactBytes(bytes)) {
    crc ^= value
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** @param {BinaryValue} value */
export function parseBleStatus(value) {
  const view = dataView(value, Exs1Layout.STATUS, "BLE status")
  if (view.getUint8(0) !== 1) throw new Error("Unsupported BLE status version.")
  return {
    version: 1,
    stateFlags: view.getUint8(1),
    sensorValidity: view.getUint16(2, true),
    alertFlags: view.getUint16(4, true),
    storageFreeMiB: view.getUint16(6, true),
    storageTotalMiB: view.getUint16(8, true),
    lastSyncResult: view.getUint8(10),
    securityState: view.getUint8(11),
    activeFileIndex: view.getUint32(12, true),
    lastSyncedFileIndex: view.getUint32(16, true)
  }
}

/**
 * @param {number} freeMiB
 * @param {number} totalMiB
 */
export function formatStorageCapacity(freeMiB, totalMiB) {
  if (totalMiB < 1024) return `${freeMiB} MiB free of ${totalMiB} MiB`

  return `${(freeMiB / 1024).toFixed(1)} GiB free of ${(totalMiB / 1024).toFixed(1)} GiB`
}

/** @param {BinaryValue} value */
export function parseBleDiagnostics(value) {
  const view = dataView(value, Exs1Layout.DIAGNOSTICS, "BLE diagnostics")
  return {
    gpsErrors: view.getUint32(0, true),
    imuErrors: view.getUint32(4, true),
    airspeedErrors: view.getUint32(8, true),
    storageWriteErrors: view.getUint32(12, true),
    droppedRecords: view.getUint32(16, true)
  }
}

/** @param {BinaryValue} value */
export function parseBleConfig(value) {
  const view = dataView(value, Exs1Layout.CONFIG, "BLE configuration")
  if (view.getUint8(0) !== 1) throw new Error("Unsupported BLE configuration version.")
  return {
    version: 1,
    statusIntervalSeconds: view.getUint8(1),
    flags: view.getUint8(2),
    writeResult: view.getUint8(3)
  }
}

/** @param {number} statusIntervalSeconds */
export function encodeBleConfig(statusIntervalSeconds) {
  const payload = new Uint8Array(Exs1Layout.CONFIG)
  payload[0] = 1
  payload[1] = statusIntervalSeconds
  payload[2] = 1
  return payload
}

/** @param {BinaryValue} value */
export function parseBleDeviceInfo(value) {
  const bytes = exactBytes(value)
  const view = dataView(bytes, Exs1Layout.BLE_DEVICE_INFO, "BLE device information")
  if (view.getUint8(0) !== 1) throw new Error("Unsupported BLE device information version.")
  return {
    version: 1,
    capabilities: view.getUint8(1),
    maxWifiProfiles: view.getUint8(2),
    deviceId: decodeFixedString(bytes.slice(4, 28)),
    firmware: decodeFixedString(bytes.slice(28, 52)),
    model: decodeFixedString(bytes.slice(52, 64))
  }
}

/**
 * @param {number} command
 * @param {number} [index]
 */
export function encodeWifiCommand(command, index) {
  const payload = new Uint8Array(index === undefined ? 2 : 3)
  payload[0] = 1
  payload[1] = command
  if (index !== undefined) payload[2] = index
  return payload
}

/** @param {WifiProfileInput} profile */
export function encodeWifiStageProfile({ position, ssid, security, enabled, password = "", preservePassword = false }) {
  const ssidBytes = new TextEncoder().encode(ssid)
  const passwordBytes = new TextEncoder().encode(password)
  if (position < 0 || position >= WIFI_MAX_PROFILES) throw new Error("Invalid Wi-Fi profile position.")
  if (ssidBytes.length < 1 || ssidBytes.length > 32) throw new Error("Wi-Fi network names must be 1 to 32 bytes.")
  if (passwordBytes.length > 63) throw new Error("Wi-Fi passwords must be at most 63 bytes.")
  if (security !== 0 && !preservePassword && passwordBytes.length < 8) throw new Error("Protected Wi-Fi passwords must be at least 8 bytes.")
  if (security === 0 && passwordBytes.length !== 0) throw new Error("Open Wi-Fi networks cannot have a password.")

  const payloadPassword = preservePassword ? new Uint8Array() : passwordBytes
  const payload = new Uint8Array(7 + ssidBytes.length + payloadPassword.length)
  payload[0] = 1
  payload[1] = WifiCommand.STAGE_PROFILE
  payload[2] = position
  payload[3] = (enabled ? WifiStageFlag.ENABLED : 0) | (preservePassword ? WifiStageFlag.PRESERVE_PASSWORD : 0)
  payload[4] = security
  payload[5] = ssidBytes.length
  payload[6] = payloadPassword.length
  payload.set(ssidBytes, 7)
  payload.set(payloadPassword, 7 + ssidBytes.length)
  return payload
}

/** @param {WifiSillageInput} sillage */
export function encodeWifiSillage({ heartbeatUrl }) {
  const url = heartbeatUrl
  const urlBytes = new TextEncoder().encode(url)
  if (urlBytes.length < 1 || urlBytes.length > WIFI_MAX_SILLAGE_URL_BYTES) {
    throw new Error(`The Sillage heartbeat URL must be 1 to ${WIFI_MAX_SILLAGE_URL_BYTES} bytes.`)
  }
  if (!/^https?:\/\//.test(url)) throw new Error("The Sillage heartbeat URL must use HTTP or HTTPS.")

  const payload = new Uint8Array(3 + urlBytes.length)
  payload.set([1, WifiCommand.SET_SILLAGE, urlBytes.length])
  payload.set(urlBytes, 3)
  return payload
}

/** @param {BinaryValue} value */
export function parseWifiResponse(value) {
  const bytes = exactBytes(value)
  if (bytes.length < 3 || bytes[0] !== 1) throw new Error("Invalid Wi-Fi provisioning response.")
  const type = bytes[1]
  const result = bytes[2]
  if (type === WifiResponse.ERROR || result !== 0) {
    const command = bytes[3] || 0
    const error = /** @type {FdrProtocolError} */ (new Error(WIFI_ERROR_MESSAGES[result] || "The recorder reported an unknown Wi-Fi error. Reconnect it and try again."))
    error.recorderWifiResult = result
    error.recorderWifiCommand = command
    throw error
  }

  if (type === WifiResponse.STATUS) {
    const view = dataView(bytes, 20, "Wi-Fi status")
    return {
      type,
      profileCount: view.getUint8(3),
      scanState: view.getUint8(4),
      scanCount: view.getUint8(5),
      activeProfileIndex: view.getUint8(6) === 0xff ? null : view.getUint8(6),
      revision: view.getUint32(8, true),
      scanGeneration: view.getUint32(12, true),
      rssi: view.getInt16(16, true),
      connected: (view.getUint16(18, true) & 1) !== 0
    }
  }

  if (type === WifiResponse.PROFILE) {
    if (bytes.length < 12 || bytes.length !== 12 + bytes[6]) throw new Error("Invalid Wi-Fi profile response.")
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const flags = view.getUint8(4)
    return {
      type,
      position: view.getUint8(3),
      enabled: (flags & 1) !== 0,
      hasPassword: (flags & 2) !== 0,
      connected: (flags & 4) !== 0,
      security: view.getUint8(5),
      revision: view.getUint32(8, true),
      ssid: new TextDecoder().decode(bytes.slice(12))
    }
  }

  if (type === WifiResponse.SCAN_RESULT) {
    if (bytes.length < 14 || bytes.length !== 14 + bytes[6]) throw new Error("Invalid Wi-Fi scan response.")
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return {
      type,
      position: view.getUint8(3),
      security: view.getUint8(4),
      savedOnRecorder: view.getUint8(5) === 1,
      scanGeneration: view.getUint32(8, true),
      rssi: view.getInt16(12, true),
      ssid: new TextDecoder().decode(bytes.slice(14))
    }
  }

  if (type === WifiResponse.ACK) {
    const view = dataView(bytes, 8, "Wi-Fi acknowledgement")
    return { type, command: view.getUint8(3), revision: view.getUint32(4, true) }
  }

  if (type === WifiResponse.SILLAGE) {
    if (bytes.length < 5 || bytes.length !== 5 + bytes[4]) throw new Error("Invalid Sillage heartbeat response.")
    return {
      type,
      configured: (bytes[3] & 1) !== 0,
      url: new TextDecoder().decode(bytes.slice(5))
    }
  }

  throw new Error(`Unexpected Wi-Fi provisioning response ${type}.`)
}

export class BleAuthenticationClient {
  /** @param {GattCharacteristicLike} characteristic */
  constructor(characteristic) {
    this.characteristic = characteristic
  }

  async challenge() {
    return parseBleAuthenticationStatus(await this.characteristic.readValue())
  }

  /** @param {string} proof */
  async authenticate(proof) {
    const proofBytes = hexToBytes(proof)
    if (proofBytes.length !== 32) throw new Error("Sillage returned an invalid BLE authentication proof.")
    const payload = new Uint8Array(33)
    payload[0] = 1
    payload.set(proofBytes, 1)
    if (this.characteristic.writeValueWithResponse) await this.characteristic.writeValueWithResponse(payload)
    else await this.characteristic.writeValue(payload)
    const status = parseBleAuthenticationStatus(await this.characteristic.readValue())
    if (!status.authenticated) throw fdrAuthenticationError(status.result)
    return status
  }
}

export class BleWifiClient {
  /** @param {GattCharacteristicLike | null} characteristic */
  constructor(characteristic) {
    this.characteristic = characteristic
  }

  /**
   * @param {Uint8Array} payload
   * @param {number} expectedType
   */
  async request(payload, expectedType) {
    const characteristic = this.characteristic
    if (!characteristic) throw new Error("A BLE characteristic is required for this Wi-Fi client.")
    if (characteristic.writeValueWithResponse) await characteristic.writeValueWithResponse(payload)
    else await characteristic.writeValue(payload)
    const response = parseWifiResponse(await characteristic.readValue())
    if (response.type !== expectedType) throw new Error(`Unexpected Wi-Fi provisioning response ${response.type}.`)
    return response
  }

  status() {
    return this.request(encodeWifiCommand(WifiCommand.GET_STATUS), WifiResponse.STATUS)
  }

  /** @param {number} index */
  profile(index) {
    return this.request(encodeWifiCommand(WifiCommand.GET_PROFILE, index), WifiResponse.PROFILE)
  }

  startScan() {
    return this.request(encodeWifiCommand(WifiCommand.START_SCAN), WifiResponse.ACK)
  }

  /** @param {number} index */
  scanResult(index) {
    return this.request(encodeWifiCommand(WifiCommand.GET_SCAN_RESULT, index), WifiResponse.SCAN_RESULT)
  }

  /** @param {number} count */
  beginUpdate(count) {
    return this.request(encodeWifiCommand(WifiCommand.BEGIN_UPDATE, count), WifiResponse.ACK)
  }

  /** @param {WifiProfileInput} profile */
  stageProfile(profile) {
    return this.request(encodeWifiStageProfile(profile), WifiResponse.ACK)
  }

  commitUpdate() {
    return this.request(encodeWifiCommand(WifiCommand.COMMIT_UPDATE), WifiResponse.ACK)
  }

  cancelUpdate() {
    return this.request(encodeWifiCommand(WifiCommand.CANCEL_UPDATE), WifiResponse.ACK)
  }

  /** @param {WifiSillageInput} sillage */
  configureSillage(sillage) {
    return this.request(encodeWifiSillage(sillage), WifiResponse.ACK)
  }

  sillage() {
    return this.request(encodeWifiCommand(WifiCommand.GET_SILLAGE), WifiResponse.SILLAGE)
  }
}

export class UsbWifiClient extends BleWifiClient {
  /** @param {UsbWifiTransport} client */
  constructor(client) {
    super(null)
    this.client = client
  }

  /**
   * @param {Uint8Array} payload
   * @param {number} expectedType
   */
  async request(payload, expectedType) {
    const response = parseWifiResponse(await this.client.wifi(payload))
    if (response.type !== expectedType) throw new Error(`Unexpected Wi-Fi provisioning response ${response.type}.`)
    return response
  }
}

/** @param {BinaryValue} value */
export function parseBleAuthenticationStatus(value) {
  const bytes = exactBytes(value)
  const view = dataView(bytes, Exs1Layout.SECURITY_STATUS, "BLE authentication status")
  if (view.getUint8(0) !== 1) throw new Error("Unsupported BLE authentication version.")
  return {
    version: 1,
    result: view.getUint8(1),
    configured: view.getUint8(2) === 1,
    authenticated: view.getUint8(3) === 1,
    nonce: bytesToHex(bytes.slice(4, 20))
  }
}

/** @param {BinaryValue} payload */
export function parseUsbSecurityStatus(payload) {
  const bytes = exactBytes(payload)
  const view = dataView(bytes, Exs1Layout.SECURITY_STATUS, "USB authentication status")
  if (view.getUint8(0) !== 1) throw new Error("Unsupported USB authentication version.")
  return {
    version: 1,
    result: view.getUint8(1),
    configured: view.getUint8(2) === 1,
    authenticated: view.getUint8(3) === 1,
    nonce: bytesToHex(bytes.slice(4, 20))
  }
}

/** @param {BinaryValue} payload */
export function parseEraseRecordingsResult(payload) {
  const view = dataView(payload, Exs1Layout.ERASE_RECORDINGS_RESULT, "erase-recordings result")
  if (view.getUint8(0) !== 1) throw new Error("Unsupported erase-recordings result version.")
  const result = view.getUint8(1)
  if (result !== EraseRecordingsResult.OK) {
    throw new Error("The recorder could not erase all recordings or restart logging. Check storage diagnostics before trying again.")
  }
  return {
    version: 1,
    result,
    deletedFiles: view.getUint32(4, true),
    deletedBytes: Number(view.getBigUint64(8, true))
  }
}

/** @param {number} result */
function fdrAuthenticationError(result) {
  const error = /** @type {FdrProtocolError} */ (new Error(FDR_AUTH_ERROR_MESSAGES[result] || "The recorder returned an unknown Sillage authentication error."))
  error.fdrAuthResult = result
  return error
}

/** @param {Uint8Array} payload */
function parseDeviceInfo(payload) {
  const view = dataView(payload, Exs1Layout.DEVICE_INFO, "device information")
  return {
    protocolVersion: view.getUint16(0, true),
    capabilities: view.getUint16(2, true),
    bootId: view.getUint32(4, true),
    deviceId: decodeFixedString(payload.slice(8, 32)),
    firmware: decodeFixedString(payload.slice(32, 56))
  }
}

/** @param {Uint8Array} payload */
function parseFileManifest(payload) {
  const view = dataView(payload, Exs1Layout.FILE_MANIFEST, "file manifest")
  return {
    fileIndex: view.getUint32(0, true),
    bootId: view.getUint32(4, true),
    sizeBytes: Number(view.getBigUint64(8, true)),
    formatVersion: view.getUint16(16, true),
    filename: decodeFixedString(payload.slice(20, 40)),
    sha256: bytesToHex(payload.slice(40, 72))
  }
}

/**
 * @param {Uint8Array} payload
 * @param {number} expectedFileIndex
 * @param {number} expectedOffset
 */
function parseFileChunk(payload, expectedFileIndex, expectedOffset) {
  if (payload.length < Exs1Layout.FILE_CHUNK_PREFIX) throw new Error("Truncated EXS1 file chunk.")
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const fileIndex = view.getUint32(0, true)
  const offset = Number(view.getBigUint64(4, true))
  const length = view.getUint32(12, true)
  const bytes = payload.slice(Exs1Layout.FILE_CHUNK_PREFIX)
  if (fileIndex !== expectedFileIndex || offset !== expectedOffset || length !== bytes.length) {
    throw new Error("Unexpected EXS1 file chunk.")
  }
  return bytes
}

/** @param {BinaryValue} payload */
export function parseUsbDeviceError(payload) {
  const view = dataView(payload, Exs1Layout.ERROR, "device error")
  const code = view.getUint16(0, true)
  const requestType = view.getUint8(2)
  const error = /** @type {FdrProtocolError} */ (new Error(USB_ERROR_MESSAGES[code] || "The recorder reported an unknown USB error. Disconnect and reconnect it, then try again."))
  error.recorderCode = code
  error.recorderRequestType = requestType
  if (code === UsbErrorCode.BAD_SEQUENCE) error.usbConnectionLost = true
  return error
}

/** @param {FdrProtocolError} error */
export function formatUsbErrorDetails(error) {
  if (!Number.isInteger(error?.recorderCode)) return ""
  const errorName = enumName(UsbErrorCode, error.recorderCode) || "UNKNOWN_ERROR"
  const requestName = enumName(UsbMessage, error.recorderRequestType) || "UNKNOWN_REQUEST"
  return `EXS1 · error ${errorName} (${error.recorderCode}) · request ${requestName} (${error.recorderRequestType})`
}

/**
 * @param {Readonly<Record<string, number>>} values
 * @param {number | undefined} code
 */
function enumName(values, code) {
  return Object.entries(values).find(([, value]) => value === code)?.[0]
}

/**
 * @param {BinaryValue} value
 * @param {number} expectedLength
 * @param {string} label
 */
function dataView(value, expectedLength, label) {
  const bytes = exactBytes(value)
  if (bytes.byteLength !== expectedLength) throw new Error(`Invalid ${label} payload.`)
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/** @param {BinaryValue} value */
function exactBytes(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof DataView) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (typeof value === "number") return new Uint8Array(value)
  if (!value) return new Uint8Array()
  return new Uint8Array(value)
}

/** @param {Uint8Array} bytes */
function decodeFixedString(bytes) {
  const end = bytes.indexOf(0)
  return new TextDecoder().decode(end < 0 ? bytes : bytes.slice(0, end))
}

/** @param {string} value */
function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("The Sillage authentication key is invalid.")
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const binary = globalThis.atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

/** @param {string} hex */
function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Invalid SHA-256.")
  const pairs = hex.match(/../g)
  if (!pairs) throw new Error("Invalid SHA-256.")
  return Uint8Array.from(pairs, (byte) => Number.parseInt(byte, 16))
}

/** @param {Uint8Array} bytes */
function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")
}

/** @param {Uint8Array} bytes */
function findMagic(bytes) {
  for (let offset = 0; offset <= bytes.length - FRAME_MAGIC.length; offset += 1) {
    if (FRAME_MAGIC.every((value, index) => bytes[offset + index] === value)) return offset
  }
  return -1
}

/**
 * @param {Uint8Array} left
 * @param {Uint8Array} right
 */
function joinBytes(left, right) {
  const result = new Uint8Array(left.length + right.length)
  result.set(left)
  result.set(right, left.length)
  return result
}

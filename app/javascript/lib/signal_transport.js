import { UsbFdrClient, UsbMessage, UsbCapability, BleUuid, BleAuthenticationClient, parseBleDeviceInfo } from "fdr_sync_protocol"

export const TELEMETRY_UUID = "4f58a10a-7b6d-4d0c-9f2a-5f4452440001"

/** Reject duplicates before the common MAVLink decoder and raw capture. */
export class LivePacketReader {
  /** @type {number|null} */ generation = null
  /** @param {Uint8Array} packet */
  decode(packet) {
    if (packet.length === 0) return new Uint8Array()
    if (packet.length < 8 || packet.length > 512) throw new Error("Invalid live telemetry packet.")
    const generation = new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(0, true)
    if (generation === this.generation) return new Uint8Array()
    this.generation = generation
    return packet.slice(8)
  }
}

/** @template T @param {Promise<T>} operation @param {number} timeoutMs @returns {Promise<T>} */
async function deadline(operation, timeoutMs) {
  let timer
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Telemetry connection timed out. Reconnect the recorder.")), timeoutMs)
    })])
  } finally { clearTimeout(timer) }
}

/** @param {string} url @param {object} body */
async function post(url, body) {
  const response = await fetch(url, {method: "POST", credentials: "same-origin", cache: "no-store",
    signal: AbortSignal.timeout(5000),
    headers: {"Content-Type": "application/json", "Accept": "application/json",
      "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || ""},
    body: JSON.stringify(body)})
  if (!response.ok) throw new Error(`Sillage connection failed (${response.status}).`)
  return response.json()
}

/** @param {string} deviceId @param {string} nonce @param {string} transport */
async function proof(deviceId, nonce, transport) {
  const result = await post("/api/v1/fdr-authentication", {device_id: deviceId, nonce, transport})
  if (typeof result.proof !== "string" || !/^[a-f0-9]{64}$/i.test(result.proof)) throw new Error("Invalid recorder authentication proof.")
  return result.proof
}

/** Adapt bounded transport polling to the existing capture stream. */
export class PollingTelemetryPort {
  /** @type {ReadableStream<Uint8Array>|null} */ readable = null
  writable = null
  closed = false
  /** @type {Promise<Uint8Array>|null} */ pending = null
  /** @type {null|(() => Promise<void>)} */ cleanup = null
  /** @param {() => Promise<{poll: () => Promise<Uint8Array>, close: () => Promise<void>}>} setup */
  constructor(setup) { this.setup = setup }
  getInfo() { return {} }
  async open() {
    try {
      let abandoned = false
      const setup = this.setup()
      setup.then(connection => { if (abandoned) void connection.close() }, () => {})
      let connection
      try { connection = await deadline(setup, 15000) }
      catch (error) { abandoned = true; throw error }
      this.cleanup = connection.close
      const packets = new LivePacketReader()
      this.readable = new ReadableStream({
        pull: async (controller) => {
          try {
            while (!this.closed) {
              this.pending = deadline(connection.poll(), 5000)
              const bytes = packets.decode(await this.pending)
              if (this.closed) return
              await new Promise(resolve => setTimeout(resolve, 75))
              if (bytes.length) { controller.enqueue(bytes); return }
            }
          } catch (error) { if (!this.closed) controller.error(error) }
          finally { this.pending = null }
        },
        cancel: () => { this.closed = true }
      })
    } catch (error) { await this.cleanup?.(); throw error }
  }
  async close() {
    this.closed = true
    try { await this.pending } catch (_) { /* Polling may end on disconnect. */ }
    await this.cleanup?.()
    this.readable = null
  }
}

/** @param {"usb-c"|"ble"|"wifi"} kind @param {{deviceId: string, sessionUuid: string}} options @returns {Promise<SerialPort>} */
export async function directTelemetryPort(kind, options) {
  if (kind === "usb-c") {
    if (!navigator.serial) throw new Error("USB-C requires Web Serial in Chrome or Edge.")
    const native = await navigator.serial.requestPort({filters: [{usbVendorId: 0x303a}, {usbVendorId: 0x2886}]})
    const client = new UsbFdrClient(native)
    return asSerialPort(new PollingTelemetryPort(async () => {
      try {
        const device = await client.connect({attempts: 1})
        if (!(device.capabilities & UsbCapability.LIVE_TELEMETRY)) throw new Error("Update the recorder firmware to enable Signal over USB-C.")
        const challenge = await client.usbAuthenticationChallenge()
        if (!challenge.configured) throw new Error("Register this recorder in Forge over USB-C first.")
        await client.authenticateUsbSession(await proof(device.deviceId, challenge.nonce, "usb"))
        return {poll: async () => (await client.request(UsbMessage.LIVE_TELEMETRY, Uint8Array.of(1), [UsbMessage.LIVE_TELEMETRY_DATA], {timeoutMs: 3000})).payload,
          close: async () => { await client.close() }}
      } catch (error) { await client.close(); throw error }
    }))
  }
  if (kind === "ble") {
    if (!navigator.bluetooth) throw new Error("Bluetooth requires Web Bluetooth in a supported browser.")
    const device = await navigator.bluetooth.requestDevice({filters: [{services: [BleUuid.service]}]})
    return asSerialPort(new PollingTelemetryPort(async () => {
      try {
        if (!device.gatt) throw new Error("The recorder has no Bluetooth GATT server.")
        const server = await device.gatt.connect()
        const service = await server.getPrimaryService(BleUuid.service)
        const identity = parseBleDeviceInfo(await (await service.getCharacteristic(BleUuid.device)).readValue())
        const auth = new BleAuthenticationClient(await service.getCharacteristic(BleUuid.authentication))
        const challenge = await auth.challenge()
        if (!challenge.configured) throw new Error("Register this recorder in Forge over USB-C first.")
        await auth.authenticate(await proof(identity.deviceId, challenge.nonce, "ble"))
        const telemetry = await service.getCharacteristic(TELEMETRY_UUID)
        return {poll: async () => { const value = await telemetry.readValue(); return new Uint8Array(value.buffer, value.byteOffset, value.byteLength) },
          close: async () => { device.gatt?.disconnect() }}
      } catch (error) { device.gatt?.disconnect(); throw error }
    }))
  }
  if (!options.deviceId) throw new Error("Select a recorder for Wi-Fi telemetry.")
  return asSerialPort(new PollingTelemetryPort(async () => ({
    poll: async () => {
      const requestedAt = performance.now()
      const result = await post("/api/v1/fdr-live-telemetry", {device_id: options.deviceId, session_uuid: options.sessionUuid})
      const packet = result.telemetry?.packet
      if (packet == null) return new Uint8Array()
      if (typeof packet !== "string" || !/^(?:[a-f0-9]{2}){8,512}$/.test(packet)) throw new Error("Invalid Wi-Fi telemetry packet.")
      const age = result.telemetry.age_ms
      if (typeof age !== "number" || !Number.isFinite(age) || age < 0 || age + performance.now() - requestedAt > 2000) return new Uint8Array()
      return Uint8Array.from(packet.match(/../g) || [], hex => parseInt(hex, 16))
    }, close: async () => {}
  })))
}

/** @param {PollingTelemetryPort} port @returns {SerialPort} */
function asSerialPort(port) { return /** @type {SerialPort} */ (/** @type {unknown} */ (port)) }

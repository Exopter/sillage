import { Controller } from "@hotwired/stimulus"
import {
  BleUuid,
  BleAuthenticationClient,
  BleWifiClient,
  UsbFdrClient,
  UsbWifiClient,
  WifiResponse,
  WifiScanState,
  parseBleDeviceInfo,
  parseBleStatus
} from "fdr_sync_protocol"
import {
  fdrApiErrorMessage,
  parseFdrAuthenticationProof,
  parseFdrWifiProvisioningBundle
} from "fdr_wifi_provisioning"

const BLE_DEVICE_STORAGE_KEY = "sillage:fdr-ble-device"
const USB_PORT_STORAGE_KEY = "sillage:fdr-usb-port"
const SECURITY_NAMES = new Map([
  [0, "open"],
  [2, "wpa"],
  [3, "wpa2"],
  [4, "wpa_wpa2"],
  [6, "wpa3"],
  [7, "wpa2_wpa3"]
])
const SECURITY_LABELS = new Map([
  [0, "Open"],
  [2, "WPA"],
  [3, "WPA2"],
  [4, "WPA/WPA2"],
  [6, "WPA3"],
  [7, "WPA2/WPA3"]
])

/**
 * Stimulus installs target and value accessors dynamically from the declarations below.
 * This type keeps those runtime accessors visible to static analysis without emitting
 * class fields that would shadow Stimulus getters.
 *
 * @typedef {Object} FdrWifiStimulusBindings
 * @property {HTMLButtonElement} usbButtonTarget
 * @property {HTMLButtonElement} bleButtonTarget
 * @property {HTMLElement} bleStatusTarget
 * @property {HTMLElement} bleDeviceTarget
 * @property {HTMLElement} firmwareTarget
 * @property {HTMLElement} healthTarget
 * @property {HTMLElement} lastReadTarget
 * @property {HTMLButtonElement} scanButtonTarget
 * @property {HTMLElement} scanStatusTarget
 * @property {HTMLElement} scanResultsTarget
 * @property {HTMLDialogElement} manualDialogTarget
 * @property {HTMLInputElement} ssidTarget
 * @property {HTMLSelectElement} securityTarget
 * @property {HTMLInputElement} passwordTarget
 * @property {HTMLButtonElement} applyButtonTarget
 * @property {HTMLElement} applyStatusTarget
 * @property {string} provisioningUrlValue
 * @property {string} confirmationUrlValue
 * @property {string} authenticationUrlValue
 * @property {boolean} previewValue
 */

/**
 * @typedef {Object} FdrWifiControllerState
 * @property {UsbFdrClient | null} usbClient
 * @property {boolean} usbAuthenticated
 * @property {number | undefined} usbKeepaliveTimer
 * @property {SerialPort | null} usbPort
 * @property {BluetoothDevice | null} device
 * @property {BluetoothRemoteGATTServer | null} server
 * @property {BleWifiClient | null} wifiClient
 * @property {{ deviceId: string, firmware: string } | null} deviceInfo
 * @property {"USB-C" | "BLE" | null} activeTransport
 * @property {boolean} bleAuthenticated
 * @property {string} initialDeviceLabel
 */

/**
 * @typedef {Object} WifiScanResult
 * @property {string} ssid
 * @property {number} security
 * @property {number} rssi
 * @property {boolean} savedOnRecorder
 */

/**
 * @typedef {Object} StoredUsbPort
 * @property {number} [usbVendorId]
 * @property {number} [usbProductId]
 */

/** @typedef {Controller & FdrWifiStimulusBindings & FdrWifiControllerState} FdrWifiControllerBase */

const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => FdrWifiControllerBase} */ (
  /** @type {unknown} */ (Controller)
)

export default class extends TypedController {
  static values = {
    provisioningUrl: String,
    confirmationUrl: String,
    authenticationUrl: String,
    preview: Boolean
  }

  static targets = [
    "usbButton", "bleButton", "bleStatus", "bleDevice", "firmware", "health", "lastRead",
    "scanButton", "scanStatus", "scanResults", "manualDialog", "ssid", "security",
    "password", "applyButton", "applyStatus"
  ]

  connect() {
    this.usbClient = null
    this.usbAuthenticated = false
    this.usbKeepaliveTimer = undefined
    this.usbPort = null
    this.device = null
    this.server = null
    this.wifiClient = null
    this.deviceInfo = null
    this.activeTransport = null
    this.bleAuthenticated = false
    this.initialDeviceLabel = this.bleDeviceTarget.textContent || ""
    this.handleDisconnect = this.handleDisconnect.bind(this)
    this.handleSerialDisconnect = this.handleSerialDisconnect.bind(this)
    navigator.serial?.addEventListener("disconnect", this.handleSerialDisconnect)

    if (this.previewValue) this.renderPreview()
    else this.autoReconnect()
  }

  disconnect() {
    navigator.serial?.removeEventListener("disconnect", this.handleSerialDisconnect)
    window.clearInterval(this.usbKeepaliveTimer)
    this.usbClient?.close()
    this.device?.removeEventListener("gattserverdisconnected", this.handleDisconnect)
    this.server?.disconnect()
  }

  async connectUsb() {
    if (this.previewValue) return this.renderPreview("USB-C")
    if (this.usbClient) return this.disconnectUsb()
    if (this.wifiClient) return this.showError("Disconnect the current recorder connection first.")
    if (!navigator.serial) return this.showError("Web Serial is not available in this browser.")

    try {
      const port = await navigator.serial.requestPort()
      this.rememberUsbPort(port)
      await this.openUsbPort(port)
    } catch (error) {
      if (error.name !== "NotFoundError") this.showError(error.message)
      this.resetConnectionState()
    }
  }

  async connectBle() {
    if (this.previewValue) return this.renderPreview()
    if (this.server) return this.disconnectBle()
    if (this.wifiClient) return this.showError("Disconnect the current recorder connection first.")
    if (!navigator.bluetooth) return this.showError("Web Bluetooth is not available in this browser.")

    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [BleUuid.service] }] })
      window.localStorage.setItem(BLE_DEVICE_STORAGE_KEY, device.id)
      await this.openDevice(device)
    } catch (error) {
      if (error.name !== "NotFoundError") this.showError(error.message)
      this.device?.removeEventListener("gattserverdisconnected", this.handleDisconnect)
      this.device?.gatt?.disconnect()
      this.resetConnectionState()
    }
  }

  async autoReconnect() {
    await this.autoReconnectUsb()
    if (!this.wifiClient) await this.autoReconnectBle()
  }

  async autoReconnectUsb() {
    if (!navigator.serial) return

    try {
      const saved = JSON.parse(window.localStorage.getItem(USB_PORT_STORAGE_KEY) || "null")
      if (!saved) return
      const ports = await navigator.serial.getPorts()
      const port = ports.find((candidate) => samePort(candidate.getInfo(), saved))
      if (port) await this.openUsbPort(port)
    } catch (_) {
      window.localStorage.removeItem(USB_PORT_STORAGE_KEY)
      this.resetConnectionState()
    }
  }

  async autoReconnectBle() {
    if (!navigator.bluetooth?.getDevices) return

    try {
      const savedId = window.localStorage.getItem(BLE_DEVICE_STORAGE_KEY)
      if (!savedId) return
      const devices = await navigator.bluetooth.getDevices()
      const device = devices.find((candidate) => candidate.id === savedId)
      if (device) await this.openDevice(device)
    } catch (_) {
      this.device?.removeEventListener("gattserverdisconnected", this.handleDisconnect)
      this.server?.disconnect()
      this.resetConnectionState()
    }
  }

  /** @param {SerialPort} port */
  async openUsbPort(port) {
    this.setConnectionPending("Connecting over USB-C")
    const client = new UsbFdrClient(port)
    try {
      await client.open()
      const deviceInfo = await client.hello()
      const status = await client.status()
      const challenge = await client.usbAuthenticationChallenge()
      if (challenge.configured) {
        const proof = parseFdrAuthenticationProof(await this.fetchJson(this.authenticationUrlValue, {
          method: "POST",
          body: JSON.stringify({ device_id: deviceInfo.deviceId, nonce: challenge.nonce, transport: "usb" })
        }))
        await client.authenticateUsbSession(proof)
        this.usbAuthenticated = true
      }
      this.usbClient = client
      this.usbPort = port
      this.deviceInfo = deviceInfo
      this.wifiClient = new UsbWifiClient(client)
      this.renderConnection(status, "USB-C")
      this.startUsbKeepalive()
    } catch (error) {
      await client.close()
      throw error
    }
  }

  /** @param {BluetoothDevice} device */
  async openDevice(device) {
    this.setConnectionPending("Connecting over BLE")
    this.device = device
    device.addEventListener("gattserverdisconnected", this.handleDisconnect)
    if (!device.gatt) throw new Error("The selected Bluetooth device does not provide a GATT server.")
    this.server = await device.gatt.connect()
    const service = await this.server.getPrimaryService(BleUuid.service)
    const [statusCharacteristic, deviceCharacteristic, wifiCharacteristic, authenticationCharacteristic] = await Promise.all([
      service.getCharacteristic(BleUuid.status),
      service.getCharacteristic(BleUuid.device),
      service.getCharacteristic(BleUuid.wifi),
      service.getCharacteristic(BleUuid.authentication)
    ])

    const [statusValue, deviceValue] = await Promise.all([
      statusCharacteristic.readValue(),
      deviceCharacteristic.readValue()
    ])
    this.deviceInfo = parseBleDeviceInfo(deviceValue)
    const authentication = new BleAuthenticationClient(authenticationCharacteristic)
    const challenge = await authentication.challenge()
    if (!challenge.configured) {
      throw new Error("Connect this recorder over USB-C once to establish its Sillage authentication key.")
    }
    const proof = parseFdrAuthenticationProof(await this.fetchJson(this.authenticationUrlValue, {
      method: "POST",
      body: JSON.stringify({ device_id: this.deviceInfo.deviceId, nonce: challenge.nonce, transport: "ble" })
    }))
    await authentication.authenticate(proof)
    this.bleAuthenticated = true
    this.wifiClient = new BleWifiClient(wifiCharacteristic)
    this.renderConnection(parseBleStatus(statusValue), "BLE")
  }

  handleDisconnect() {
    if (this.activeTransport === "BLE") this.resetConnectionState()
  }

  /** @param {Event & { port?: SerialPort }} event */
  handleSerialDisconnect(event) {
    const port = event.port || event.target
    if (port === this.usbPort) this.resetConnectionState()
  }

  async disconnectUsb() {
    const client = this.usbClient
    this.usbClient = null
    this.usbPort = null
    await client?.close()
    this.resetConnectionState()
  }

  disconnectBle() {
    this.device?.removeEventListener("gattserverdisconnected", this.handleDisconnect)
    this.server?.disconnect()
    this.device = null
    this.server = null
    this.resetConnectionState()
  }

  async scan() {
    if (this.previewValue) return this.renderPreviewScan()
    if (!this.wifiClient) return this.showError("Connect the recorder over USB-C or BLE before scanning.")

    this.scanButtonTarget.disabled = true
    this.scanStatusTarget.textContent = "Scanning from the recorder…"
    try {
      await this.wifiClient.startScan()
      const status = await this.waitForScan()
      const results = []
      for (let index = 0; index < status.scanCount; index += 1) {
        const result = await this.wifiClient.scanResult(index)
        if (result.type !== WifiResponse.SCAN_RESULT) throw new Error("The recorder returned an invalid Wi-Fi scan result.")
        results.push(result)
      }
      this.renderScanResults(results)
      this.scanStatusTarget.textContent = `${results.length} network${results.length === 1 ? "" : "s"} found`
    } catch (error) {
      this.showError(error.message)
      this.scanStatusTarget.textContent = "Scan failed"
    } finally {
      this.scanButtonTarget.disabled = false
    }
  }

  async waitForScan() {
    const wifiClient = this.wifiClient
    if (!wifiClient) throw new Error("Connect the recorder over USB-C or BLE before scanning.")

    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const status = await wifiClient.status()
      if (status.scanState === WifiScanState.COMPLETE) return status
      if (status.scanState === WifiScanState.FAILED) throw new Error("The recorder could not scan Wi-Fi networks.")
      await new Promise((resolve) => window.setTimeout(resolve, 400))
    }
    throw new Error("The Wi-Fi scan timed out.")
  }

  /** @param {Event} [event] */
  openManual(event) {
    const button = event?.currentTarget
    if (button instanceof HTMLElement && button.dataset.ssid) {
      this.ssidTarget.value = button.dataset.ssid
      this.securityTarget.value = SECURITY_NAMES.get(Number(button.dataset.security)) || "wpa2"
    }
    this.togglePasswordRequirement()
    this.manualDialogTarget.showModal()
  }

  closeManual() {
    this.manualDialogTarget.close()
  }

  togglePasswordRequirement() {
    const open = this.securityTarget.value === "open"
    this.passwordTarget.required = !open
    this.passwordTarget.disabled = open
    if (open) this.passwordTarget.value = ""
  }

  async apply() {
    if (this.previewValue) return this.renderPreviewApply()
    if (!this.wifiClient || !this.deviceInfo) return this.showError("Connect the recorder over USB-C or BLE before applying changes.")
    const wifiClient = this.wifiClient
    const deviceInfo = this.deviceInfo
    if (this.usbClient && !this.usbAuthenticated) {
      return this.showError("Initialize this recorder from Signal over USB-C before applying connectivity changes.")
    }
    if (!this.usbClient && !this.bleAuthenticated) {
      return this.showError("Sillage has not authenticated this BLE session.")
    }

    this.applyButtonTarget.disabled = true
    this.applyStatusTarget.textContent = "Preparing encrypted Wi-Fi credentials…"
    let bundle
    try {
      bundle = parseFdrWifiProvisioningBundle(await this.fetchJson(this.provisioningUrlValue, {
        method: "POST",
        body: JSON.stringify({ device_id: deviceInfo.deviceId })
      }))
      this.applyStatusTarget.textContent = "Writing profiles to the recorder…"
      await wifiClient.beginUpdate(bundle.profiles.length)
      for (const profile of bundle.profiles) await wifiClient.stageProfile(profile)
      await wifiClient.commitUpdate()
      await wifiClient.configureSillage(bundle.sillage.heartbeat_url)

      this.applyStatusTarget.textContent = "Verifying the recorder copy…"
      const status = await wifiClient.status()
      if (status.profileCount !== bundle.profiles.length) throw new Error("The recorder returned a different Wi-Fi profile count.")
      for (let index = 0; index < bundle.profiles.length; index += 1) {
        const saved = await wifiClient.profile(index)
        const desired = bundle.profiles[index]
        if (saved.position !== desired.position || saved.ssid !== desired.ssid || saved.security !== desired.security || saved.enabled !== desired.enabled || (desired.security !== 0 && !saved.hasPassword)) {
          throw new Error(`The recorder did not verify Wi-Fi profile ${index + 1}.`)
        }
      }
      const sillage = await wifiClient.sillage()
      if (!sillage.configured || sillage.url !== bundle.sillage.heartbeat_url) {
        throw new Error("The recorder did not verify its Sillage heartbeat endpoint.")
      }

      await this.fetchJson(this.confirmationUrlValue, {
        method: "PATCH",
        body: JSON.stringify({ device_id: deviceInfo.deviceId })
      })
      this.applyStatusTarget.textContent = "Configuration verified and confirmed in Hangar."
      this.applyStatusTarget.dataset.state = "success"
      window.setTimeout(() => window.location.reload(), 700)
    } catch (error) {
      try { await wifiClient.cancelUpdate() } catch (_) {}
      this.showError(error.message)
    } finally {
      bundle?.profiles.forEach((profile) => { profile.password = "" })
      bundle = null
      this.applyButtonTarget.disabled = false
    }
  }

  /**
   * @param {string} url
   * @param {RequestInit} options
   * @returns {Promise<unknown>}
   */
  async fetchJson(url, options) {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || ""
      },
      ...options
    })
    const payload = /** @type {unknown} */ (await response.json())
    if (!response.ok) throw new Error(fdrApiErrorMessage(payload) || "Sillage rejected the Wi-Fi provisioning request.")
    return payload
  }

  /**
   * @param {{ alertFlags: number }} status
   * @param {"USB-C" | "BLE"} transport
   */
  renderConnection(status, transport) {
    const deviceInfo = this.deviceInfo
    if (!deviceInfo) throw new Error("The recorder did not provide its identity.")

    this.activeTransport = transport
    this.usbButtonTarget.disabled = transport !== "USB-C"
    this.bleButtonTarget.disabled = transport !== "BLE"
    this.setButtonLabel(this.usbButtonTarget, transport === "USB-C" ? "Disconnect USB-C" : "Connect USB-C")
    this.setButtonLabel(this.bleButtonTarget, transport === "BLE" ? "Disconnect BLE" : "Connect BLE")
    this.bleStatusTarget.textContent = transport === "BLE"
      ? "Connected over Sillage-authenticated BLE"
      : this.usbAuthenticated
        ? "Connected over Sillage-authenticated USB-C"
        : "Connected over USB-C · secure initialization required"
    this.bleStatusTarget.dataset.state = "connected"
    this.bleDeviceTarget.textContent = deviceInfo.deviceId
    this.firmwareTarget.textContent = deviceInfo.firmware
    this.healthTarget.textContent = status.alertFlags === 0 ? "Healthy" : `Alerts 0x${status.alertFlags.toString(16)}`
    this.lastReadTarget.textContent = "just now"
    this.applyButtonTarget.disabled = transport === "USB-C" ? !this.usbAuthenticated : !this.bleAuthenticated
    this.scanButtonTarget.disabled = transport === "USB-C" ? !this.usbAuthenticated : !this.bleAuthenticated
    if (transport === "USB-C" && !this.usbAuthenticated) {
      this.applyStatusTarget.textContent = "Initialize this recorder from Signal over USB-C before applying connectivity changes."
    }
  }

  startUsbKeepalive() {
    window.clearInterval(this.usbKeepaliveTimer)
    this.usbKeepaliveTimer = window.setInterval(() => {
      this.usbClient?.status().catch(() => void this.disconnectUsb())
    }, 2000)
  }

  /** @param {string} label */
  setConnectionPending(label) {
    this.bleStatusTarget.textContent = label
    this.bleStatusTarget.dataset.state = "connecting"
    this.usbButtonTarget.disabled = true
    this.bleButtonTarget.disabled = true
  }

  resetConnectionState() {
    window.clearInterval(this.usbKeepaliveTimer)
    this.usbKeepaliveTimer = undefined
    this.wifiClient = null
    this.bleAuthenticated = false
    this.usbAuthenticated = false
    this.deviceInfo = null
    this.activeTransport = null
    this.usbClient = null
    this.usbPort = null
    this.server = null
    this.device = null
    this.usbButtonTarget.disabled = false
    this.bleButtonTarget.disabled = false
    this.setButtonLabel(this.usbButtonTarget, "Connect USB-C")
    this.setButtonLabel(this.bleButtonTarget, "Connect BLE")
    this.bleStatusTarget.textContent = "Recorder disconnected"
    this.bleStatusTarget.dataset.state = "disconnected"
    this.bleDeviceTarget.textContent = this.initialDeviceLabel
    this.firmwareTarget.textContent = "not read"
    this.healthTarget.textContent = "Not read"
    this.lastReadTarget.textContent = "never"
    this.applyButtonTarget.disabled = true
    this.scanButtonTarget.disabled = true
  }

  /**
   * @param {HTMLButtonElement} button
   * @param {string} label
   */
  setButtonLabel(button, label) {
    const labelTarget = button.querySelector("span:last-child")
    if (!labelTarget) throw new Error("Recorder connection button label is missing.")
    labelTarget.textContent = label
  }

  /** @param {SerialPort} port */
  rememberUsbPort(port) {
    const info = port.getInfo()
    window.localStorage.setItem(USB_PORT_STORAGE_KEY, JSON.stringify({
      usbVendorId: info.usbVendorId,
      usbProductId: info.usbProductId
    }))
  }

  /** @param {WifiScanResult[]} results */
  renderScanResults(results) {
    this.scanResultsTarget.replaceChildren(...results.map((result) => this.scanResultRow(result)))
  }

  /** @param {WifiScanResult} result */
  scanResultRow(result) {
    const row = document.createElement("div")
    row.className = "fdr-wifi-scan-row"

    const identity = document.createElement("span")
    const name = document.createElement("strong")
    name.textContent = result.ssid
    const meta = document.createElement("small")
    meta.textContent = result.savedOnRecorder ? "Present on recorder" : `${result.rssi} dBm`
    identity.append(name, meta)

    const security = document.createElement("span")
    security.className = "fdr-wifi-cell-muted"
    security.textContent = SECURITY_LABELS.get(result.security) || "Unknown"

    const button = document.createElement("button")
    button.type = "button"
    button.className = "button-secondary is-compact"
    button.textContent = "Add network"
    button.dataset.ssid = result.ssid
    button.dataset.security = String(result.security)
    button.dataset.action = "fdr-wifi-configuration#openManual"

    row.append(identity, security, button)
    return row
  }

  /** @param {string} message */
  showError(message) {
    this.applyStatusTarget.textContent = message
    this.applyStatusTarget.dataset.state = "error"
  }

  /** @param {"USB-C" | "BLE"} [transport] */
  renderPreview(transport = "BLE") {
    this.deviceInfo = { deviceId: "EXOFDR-00C012", firmware: "fdr_integrated/8" }
    this.renderConnection({ alertFlags: 0 }, transport)
    this.renderPreviewScan()
  }

  renderPreviewScan() {
    this.renderScanResults([
      { ssid: "EXOPTER-LAB", security: 6, rssi: -39, savedOnRecorder: true },
      { ssid: "AIRFIELD-HANGAR", security: 7, rssi: -51, savedOnRecorder: false },
      { ssid: "CLUBHOUSE", security: 3, rssi: -67, savedOnRecorder: false },
      { ssid: "JULIEN-HOTSPOT", security: 3, rssi: -73, savedOnRecorder: false }
    ])
    this.scanStatusTarget.textContent = "4 networks found"
  }

  renderPreviewApply() {
    this.applyStatusTarget.textContent = "Preview: configuration verified and confirmed in Hangar."
    this.applyStatusTarget.dataset.state = "success"
  }
}

/**
 * @param {SerialPortInfo} info
 * @param {StoredUsbPort} saved
 */
function samePort(info, saved) {
  if (saved.usbVendorId == null && saved.usbProductId == null) return false
  return info.usbVendorId === saved.usbVendorId && info.usbProductId === saved.usbProductId
}

import { Controller } from "@hotwired/stimulus"
import { AircraftConnectionTransport, setAircraftConnection } from "aircraft_connection"
import { PartialFdrFile } from "fdr_partial_file"
import {
  BleUuid,
  BleAuthenticationClient,
  USB_CHUNK_SIZE,
  UsbCapability,
  UsbErrorCode,
  UsbFdrClient,
  encodeBleConfig,
  formatStorageCapacity,
  formatUsbErrorDetails,
  parseBleConfig,
  parseBleDeviceInfo,
  parseBleDiagnostics,
  parseBleStatus
} from "fdr_sync_protocol"

const USB_PORT_STORAGE_KEY = "sillage:fdr-usb-port"
const BLE_DEVICE_STORAGE_KEY = "sillage:fdr-ble-device"

export default class extends Controller {
  static values = {
    uploadUrl: String,
    registrationUrl: String,
    authenticationUrl: String,
    sillageHeartbeatUrl: String
  }
  static targets = [
    "usbButton", "stopSyncButton", "eraseSdButton", "usbStatus", "usbDevice", "syncProgress", "syncDetail", "syncTechnical",
    "usbNotice", "usbNoticeLabel", "bleButton", "bleStatus", "bleDevice", "bleDetail",
    "bleNotice", "bleNoticeLabel", "wifiStatus", "wifiDevice", "wifiAutoLabel", "wifiDetail",
    "wifiNotice", "wifiNoticeLabel", "recorderStatus",
    "recorderSource", "recorderDevice", "recorderFirmware", "health", "storage",
    "lastSync", "security", "configInterval", "configButton", "configResult",
    "debugButton", "debug", "recorderTools", "recorderToolsHint", "recorderAlert",
    "recorderAlertMessage", "recorderAlertTechnical", "recorderOnboarding",
    "recorderOnboardingTitle", "wifiDescription", "wifiLink",
    "wifiLinkLabel", "wifiRegisterButton", "wifiRegisterLabel", "wifiRegistrationStatus"
  ]

  connect() {
    if (this.initialized) return

    this.initialized = true
    this.usbBusy = false
    this.usbClient = null
    this.usbSession = null
    this.usbAuthenticated = false
    this.usbAuthenticationConfigured = false
    this.usbPort = null
    this.usbPollTimer = null
    this.usbIdentity = null
    this.usbFacts = null
    this.usbSynchronization = null
    this.usbRecorderError = null
    this.usbSyncActive = false
    this.usbSyncInterrupted = false
    this.usbUploadController = null
    this.usbEraseActive = false
    this.bleDevice = null
    this.bleServer = null
    this.bleCharacteristics = {}
    this.bleIdentity = null
    this.bleFacts = null
    this.bleAuthenticated = false
    this.wifiIdentity = null
    this.wifiIdentities = []
    this.wifiFacts = null
    this.wifiPollTimer = null
    this.registrationIdentity = null
    this.registrationLookupDeviceId = null
    this.registrationRequestToken = 0
    this.registrationState = "idle"
    this.registrationSubmitting = false
    this.registeredRecorder = null
    this.registeredAircraft = null
    this.defaultWifiState = {
      description: this.wifiDescriptionTarget.textContent,
      href: this.wifiLinkTarget.href,
      label: this.wifiLinkLabelTarget.textContent
    }
    this.handleSerialConnect = this.handleSerialConnect.bind(this)
    this.handleSerialDisconnect = this.handleSerialDisconnect.bind(this)
    this.handleBleDisconnect = this.handleBleDisconnect.bind(this)
    navigator.serial?.addEventListener("connect", this.handleSerialConnect)
    navigator.serial?.addEventListener("disconnect", this.handleSerialDisconnect)
    this.autoReconnectUsb()
    this.autoReconnectBle()
    this.startWifiPolling()
  }

  disconnect() {
    queueMicrotask(() => {
      if (!this.element.isConnected) this.teardown()
    })
  }

  teardown() {
    if (!this.initialized) return

    this.initialized = false
    setAircraftConnection(AircraftConnectionTransport.USB_C, false)
    setAircraftConnection(AircraftConnectionTransport.BLE, false)
    setAircraftConnection(AircraftConnectionTransport.WIFI, false)
    navigator.serial?.removeEventListener("connect", this.handleSerialConnect)
    navigator.serial?.removeEventListener("disconnect", this.handleSerialDisconnect)
    window.clearInterval(this.usbPollTimer)
    window.clearInterval(this.wifiPollTimer)
    this.usbClient?.close()
    this.bleDevice?.removeEventListener("gattserverdisconnected", this.handleBleDisconnect)
    this.bleServer?.disconnect()
  }

  async connectUsb() {
    if (this.usbClient) return this.disconnectUsb()
    if (!navigator.serial) return this.showUsbConnectionError("Web Serial is not available in this browser.")
    try {
      const port = await navigator.serial.requestPort()
      this.rememberUsbPort(port)
      await this.synchronizeUsb(port)
    } catch (error) {
      if (error.name !== "NotFoundError") this.showUsbConnectionError(error)
    }
  }

  async connectBle() {
    if (!navigator.bluetooth) return this.showBleConnectionError("Web Bluetooth is not available in this browser.")
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BleUuid.service] }]
      })
      window.localStorage.setItem(BLE_DEVICE_STORAGE_KEY, device.id)
      await this.openBleDevice(device)
    } catch (error) {
      if (error.name !== "NotFoundError") this.showBleConnectionError(error.message)
    }
  }

  async saveConfig() {
    const characteristic = this.bleCharacteristics.config
    if (!this.usbClient && !characteristic) return this.showControlActionError("Connect the recorder first.")
    const seconds = Number.parseInt(this.configIntervalTarget.value, 10)
    try {
      let config
      if (this.usbClient) {
        config = await this.usbClient.writeConfig(seconds)
      } else {
        const payload = encodeBleConfig(seconds)
        if (characteristic.writeValueWithResponse) await characteristic.writeValueWithResponse(payload)
        else await characteristic.writeValue(payload)
        config = parseBleConfig(await characteristic.readValue())
      }
      this.renderConfig(config)
    } catch (error) {
      this.showControlActionError(error.message)
    }
  }

  async refreshDebug() {
    const characteristic = this.bleCharacteristics.debug
    if (!this.usbClient && !characteristic) return this.showControlActionError("Connect the recorder first.")
    try {
      this.debugTarget.textContent = this.usbClient
        ? await this.usbClient.debug()
        : new TextDecoder().decode(await characteristic.readValue())
    } catch (error) {
      this.showControlActionError(error.message)
    }
  }

  async autoReconnectUsb() {
    if (!navigator.serial || this.usbBusy) return
    try {
      const saved = JSON.parse(window.localStorage.getItem(USB_PORT_STORAGE_KEY) || "null")
      if (!saved) return
      const ports = await navigator.serial.getPorts()
      const port = ports.find((candidate) => samePort(candidate.getInfo(), saved))
      if (port) await this.synchronizeUsb(port)
    } catch (error) {
      this.showUsbConnectionError(error)
    }
  }

  async handleSerialConnect(event) {
    const saved = JSON.parse(window.localStorage.getItem(USB_PORT_STORAGE_KEY) || "null")
    const port = event.port || event.target
    if (saved && port?.getInfo && samePort(port.getInfo(), saved)) await this.synchronizeUsb(port)
  }

  handleSerialDisconnect(event) {
    const port = event.port || event.target
    if (port === this.usbPort) void this.disconnectUsb()
  }

  async synchronizeUsb(port, { skipFileSynchronization = false } = {}) {
    if (this.usbBusy || this.usbClient) return
    const session = Symbol("usb-session")
    const client = new UsbFdrClient(port)
    this.usbBusy = true
    this.usbSession = session
    this.usbClient = client
    this.usbPort = port
    this.usbAuthenticated = false
    this.usbAuthenticationConfigured = false
    this.usbIdentity = null
    this.usbFacts = null
    this.usbSynchronization = null
    this.usbRecorderError = null
    this.usbSyncActive = false
    this.usbSyncInterrupted = false
    this.usbEraseActive = false
    this.usbDeviceTarget.textContent = "Identifying recorder"
    this.syncProgressTarget.hidden = true
    this.syncProgressTarget.value = 0
    this.syncProgressTarget.max = 1
    this.showUsbNotice(skipFileSynchronization
      ? "Restoring the authenticated USB-C control session without restarting synchronization"
      : "Preparing sealed recordings and verifying checksums")
    this.renderRecorderInformation()
    this.setTransportStatus(this.usbStatusTarget, "Connecting", "connecting")
    try {
      const device = await client.connect()
      if (!this.usbSessionActive(session, client)) return
      let authenticationNotice = null
      const challenge = await client.usbAuthenticationChallenge()
      this.usbAuthenticationConfigured = challenge.configured
      if (!challenge.configured) {
        authenticationNotice = {
          message: "This recorder is ready to be added and initialized in Sillage.",
          state: "caution",
          label: "Secure onboarding required"
        }
      } else {
        try {
          const proof = await this.requestAuthenticationProof(device.deviceId, challenge.nonce, "usb")
          await client.authenticateUsbSession(proof)
          this.usbAuthenticated = true
        } catch (error) {
          authenticationNotice = {
            message: error.message,
            state: "error",
            label: "Sillage authentication"
          }
        }
      }
      this.usbIdentity = device
      this.refreshRecorderRegistration()
      setAircraftConnection(AircraftConnectionTransport.USB_C, true, { deviceId: device.deviceId })
      this.usbDeviceTarget.textContent = device.deviceId
      this.usbButtonTarget.textContent = "Disconnect USB-C"
      await this.refreshUsbControlData()
      if (!this.usbSessionActive(session, client)) return
      this.updateToolsAvailability()
      this.renderRecorderInformation()
      if (this.usbAuthenticated && skipFileSynchronization) {
        this.usbSynchronization = "Interrupted by operator"
        this.usbFacts.synchronization = this.usbSynchronization
        this.showUsbNotice("Transfer interrupted. The recordings and partial transfer are preserved.", {
          state: "caution",
          label: "Synchronization stopped"
        })
      } else if (this.usbAuthenticated) {
        this.setTransportStatus(this.usbStatusTarget, "Synchronizing", "connecting")
        this.usbSyncActive = true
        this.usbSyncInterrupted = false
        this.updateUsbActions()
        try {
          const synchronization = await this.synchronizeUsbFiles(client, device)
          if (!this.usbSessionActive(session, client)) return
          this.showUsbNotice(synchronization)
          this.usbSynchronization = synchronization
          this.usbFacts.synchronization = synchronization
        } catch (error) {
          if (!this.usbSessionActive(session, client) || error?.usbConnectionLost) throw error
          if (error?.usbSyncInterrupted) {
            this.usbSynchronization = "Interrupted by operator"
            this.usbFacts.synchronization = this.usbSynchronization
            this.showUsbNotice("Transfer interrupted. The recordings and partial transfer are preserved.", {
              state: "caution",
              label: "Synchronization stopped"
            })
          } else {
            this.showUsbSyncError(error)
          }
        } finally {
          this.usbSyncActive = false
          this.usbUploadController = null
          this.updateUsbActions()
        }
      } else {
        this.showUsbNotice(authenticationNotice.message, authenticationNotice)
      }
      this.syncProgressTarget.hidden = true
      this.setTransportStatus(
        this.usbStatusTarget,
        this.usbAuthenticated ? "Authenticated" : "Connected read-only",
        "ready"
      )
      this.startUsbPolling()
      this.renderRecorderInformation()
    } catch (error) {
      if (!this.usbSessionActive(session, client)) return
      this.usbClient = null
      this.usbAuthenticated = false
      this.usbPort = null
      await client.close()
      this.showUsbConnectionError(error)
    } finally {
      if (this.usbSession === session) {
        this.usbSession = null
        this.usbBusy = false
        this.usbButtonTarget.disabled = false
        this.updateUsbActions()
      }
    }
  }

  usbSessionActive(session, client) {
    return this.usbSession === session && this.usbClient === client
  }

  async synchronizeUsbFiles(client, device) {
    let synchronizedFiles = 0
    while (true) {
      this.ensureUsbSyncContinues()
      const manifest = await client.nextFile()
      this.ensureUsbSyncContinues()
      if (!manifest) break
      const partial = await PartialFdrFile.open(device.deviceId, manifest)
      try {
        let offset = partial.size
        this.syncProgressTarget.value = offset
        this.syncProgressTarget.max = manifest.sizeBytes
        this.syncProgressTarget.hidden = false
        this.syncDetailTarget.textContent = `${manifest.filename} · ${formatBytes(manifest.sizeBytes)}`
        while (offset < manifest.sizeBytes) {
          this.ensureUsbSyncContinues()
          const chunk = await client.readChunk(
            manifest.fileIndex,
            offset,
            Math.min(USB_CHUNK_SIZE, manifest.sizeBytes - offset)
          )
          this.ensureUsbSyncContinues()
          if (!chunk.length) throw new Error("The recorder returned an empty chunk before end of file.")
          await partial.append(offset, chunk)
          offset += chunk.length
          this.syncProgressTarget.value = offset
          this.syncProgressTarget.max = manifest.sizeBytes
          this.syncDetailTarget.textContent = `${manifest.filename} · ${formatBytes(offset)} / ${formatBytes(manifest.sizeBytes)}`
        }
        this.ensureUsbSyncContinues()
        const blob = await partial.blob()
        this.ensureUsbSyncContinues()
        const uploadController = new AbortController()
        this.usbUploadController = uploadController
        await this.uploadFile(device, manifest, blob, { signal: uploadController.signal })
        this.usbUploadController = null
        this.ensureUsbSyncContinues()
        await client.acknowledge(manifest.fileIndex, manifest.sha256)
        await partial.remove()
        synchronizedFiles += 1
      } catch (error) {
        this.usbUploadController = null
        await partial.close()
        if (this.usbSyncInterrupted) throw usbSyncInterruptedError()
        throw error
      }
    }
    return synchronizedFiles
      ? `${synchronizedFiles} file${synchronizedFiles === 1 ? "" : "s"} synchronized`
      : "No sealed file waiting"
  }

  async interruptUsbSync() {
    if (!this.usbSyncActive || this.usbSyncInterrupted) return

    const port = this.usbPort
    this.usbSyncInterrupted = true
    this.usbUploadController?.abort()
    this.stopSyncButtonTarget.disabled = true
    this.stopSyncButtonTarget.textContent = "Stopping…"
    this.showUsbNotice("Closing the transfer and preserving the partial file…", {
      state: "caution",
      label: "Stopping synchronization"
    })
    await this.disconnectUsb()
    if (port) await this.synchronizeUsb(port, { skipFileSynchronization: true })
  }

  ensureUsbSyncContinues() {
    if (this.usbSyncInterrupted) throw usbSyncInterruptedError()
  }

  async eraseSdRecordings() {
    const client = this.usbClient
    if (!client || !this.usbAuthenticated) {
      return this.showUsbNotice("Connect and authenticate the recorder over USB-C first.", {
        state: "error",
        label: "Erase unavailable"
      })
    }
    if (this.usbSyncActive) {
      return this.showUsbNotice("Stop the transfer before erasing recordings.", {
        state: "caution",
        label: "Erase unavailable"
      })
    }
    if ((this.usbIdentity?.capabilities & UsbCapability.ERASE_RECORDINGS) === 0) {
      return this.showUsbNotice("Update the recorder firmware before erasing recordings from Sillage.", {
        state: "caution",
        label: "Erase unavailable"
      })
    }
    if (!window.confirm("Erase all FDR recordings from this recorder's microSD card? This cannot be undone. Files already synchronized to Sillage and non-FDR files on the card will be preserved.")) return

    window.clearInterval(this.usbPollTimer)
    this.usbPollTimer = null
    this.usbEraseActive = true
    this.updateUsbActions()
    this.setTransportStatus(this.usbStatusTarget, "Erasing recordings", "connecting")
    this.showUsbNotice("Closing the active recording and erasing FDR files…", {
      state: "caution",
      label: "Erasing microSD recordings"
    })
    try {
      const result = await client.eraseRecordings()
      if (client !== this.usbClient) return
      this.usbSynchronization = "Recordings erased"
      if (this.usbFacts) this.usbFacts.synchronization = this.usbSynchronization
      await this.refreshUsbControlData()
      this.showUsbNotice(`${result.deletedFiles} recording${result.deletedFiles === 1 ? "" : "s"} erased · ${formatBytes(result.deletedBytes)} freed. Recording resumed in a new file.`, {
        label: "microSD recordings erased"
      })
    } catch (error) {
      if (error?.usbConnectionLost) {
        await this.disconnectUsb()
        this.showUsbConnectionError(error)
      } else {
        this.showUsbNotice(error.message, { state: "error", label: "Erase failed" })
      }
    } finally {
      this.usbEraseActive = false
      if (client === this.usbClient) {
        this.setTransportStatus(this.usbStatusTarget, "Authenticated", "ready")
        this.startUsbPolling()
      }
      this.updateUsbActions()
      this.renderRecorderInformation()
    }
  }

  async refreshUsbControlData() {
    if (!this.usbClient) return
    const status = await this.usbClient.status()
    const diagnostics = await this.usbClient.diagnostics()
    const config = await this.usbClient.config()
    this.renderStatus(status, "usb")
    this.renderDiagnostics(diagnostics, "usb")
    this.renderConfig(config)
  }

  startUsbPolling() {
    window.clearInterval(this.usbPollTimer)
    this.usbPollTimer = window.setInterval(async () => {
      try {
        await this.refreshUsbControlData()
      } catch (error) {
        await this.disconnectUsb()
        this.showUsbConnectionError(error)
      }
    }, 2000)
  }

  async disconnectUsb() {
    window.clearInterval(this.usbPollTimer)
    this.usbPollTimer = null
    const client = this.usbClient
    this.usbSyncInterrupted = true
    this.usbUploadController?.abort()
    this.usbClient = null
    this.usbSession = null
    this.usbBusy = false
    this.usbAuthenticated = false
    this.usbAuthenticationConfigured = false
    this.usbPort = null
    this.usbIdentity = null
    this.usbFacts = null
    this.usbSynchronization = null
    this.usbRecorderError = null
    this.usbSyncActive = false
    this.usbUploadController = null
    this.usbEraseActive = false
    this.syncProgressTarget.hidden = true
    this.syncProgressTarget.value = 0
    this.syncProgressTarget.max = 1
    setAircraftConnection(AircraftConnectionTransport.USB_C, false)
    this.usbButtonTarget.textContent = "Connect USB-C"
    this.usbButtonTarget.disabled = false
    this.usbDeviceTarget.textContent = "No recorder selected"
    this.hideUsbNotice()
    this.setTransportStatus(this.usbStatusTarget, "Not connected", "disconnected")
    this.refreshRecorderRegistration()
    this.updateToolsAvailability()
    this.renderRecorderInformation()
    await client?.close()
  }

  async uploadFile(device, manifest, blob, { signal } = {}) {
    const form = new FormData()
    form.append("source_file", blob, manifest.filename)
    form.append("device_id", device.deviceId)
    form.append("filename", manifest.filename)
    form.append("file_index", manifest.fileIndex)
    form.append("boot_id", manifest.bootId)
    form.append("format_version", manifest.formatVersion)
    form.append("size_bytes", manifest.sizeBytes)
    form.append("sha256", manifest.sha256)
    const response = await fetch(this.uploadUrlValue, {
      method: "POST",
      headers: { "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || "" },
      body: form,
      signal
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || `Sillage rejected ${manifest.filename}.`)
    if (payload.sha256 !== manifest.sha256) throw new Error("Sillage acknowledged a different SHA-256.")
  }

  rememberUsbPort(port) {
    const info = port.getInfo()
    window.localStorage.setItem(USB_PORT_STORAGE_KEY, JSON.stringify({
      usbVendorId: info.usbVendorId,
      usbProductId: info.usbProductId
    }))
  }

  async autoReconnectBle() {
    if (!navigator.bluetooth?.getDevices) return
    try {
      const savedId = window.localStorage.getItem(BLE_DEVICE_STORAGE_KEY)
      if (!savedId) return
      const devices = await navigator.bluetooth.getDevices()
      const device = devices.find((candidate) => candidate.id === savedId)
      if (device) await this.openBleDevice(device)
    } catch (error) {
      this.showBleConnectionError(error.message)
    }
  }

  async openBleDevice(device) {
    this.bleIdentity = null
    this.bleFacts = null
    this.bleDeviceTarget.textContent = "Identifying recorder"
    this.hideBleNotice()
    this.renderRecorderInformation()
    this.setTransportStatus(this.bleStatusTarget, "Connecting", "connecting")
    this.bleButtonTarget.disabled = true
    this.bleDevice = device
    device.addEventListener("gattserverdisconnected", this.handleBleDisconnect)
    this.bleServer = await device.gatt.connect()
    const service = await this.bleServer.getPrimaryService(BleUuid.service)
    const [status, diagnostics, config, debug, deviceInformation, authenticationCharacteristic] = await Promise.all([
      service.getCharacteristic(BleUuid.status),
      service.getCharacteristic(BleUuid.diagnostics),
      service.getCharacteristic(BleUuid.config),
      service.getCharacteristic(BleUuid.debug),
      service.getCharacteristic(BleUuid.device),
      service.getCharacteristic(BleUuid.authentication)
    ])
    this.bleCharacteristics = { status, diagnostics, config, debug }
    await status.startNotifications()
    status.addEventListener("characteristicvaluechanged", ({ target }) => this.renderStatus(parseBleStatus(target.value), "ble"))
    const [statusValue, diagnosticsValue, configValue, deviceValue] = await Promise.all([
      status.readValue(), diagnostics.readValue(), config.readValue(), deviceInformation.readValue()
    ])
    this.bleIdentity = parseBleDeviceInfo(deviceValue)
    this.bleAuthenticated = false
    try {
      const authentication = new BleAuthenticationClient(authenticationCharacteristic)
      const challenge = await authentication.challenge()
      if (!challenge.configured) {
        this.showBleNotice("Connect this recorder over USB-C once to establish its Sillage authentication key.", {
          state: "caution",
          label: "Sillage registration required"
        })
      } else {
        const proof = await this.requestAuthenticationProof(this.bleIdentity.deviceId, challenge.nonce, "ble")
        await authentication.authenticate(proof)
        this.bleAuthenticated = true
      }
    } catch (error) {
      this.showBleNotice(error.message, { state: "error", label: "Sillage authentication" })
    }
    this.refreshRecorderRegistration()
    setAircraftConnection(AircraftConnectionTransport.BLE, true, { deviceId: this.bleIdentity.deviceId })
    this.bleDeviceTarget.textContent = this.bleIdentity.deviceId
    if (this.bleAuthenticated) this.hideBleNotice()
    this.setTransportStatus(
      this.bleStatusTarget,
      this.bleAuthenticated ? "Authenticated" : "Connected read-only",
      "ready"
    )
    this.renderStatus(parseBleStatus(statusValue), "ble")
    this.renderDiagnostics(parseBleDiagnostics(diagnosticsValue), "ble")
    this.renderConfig(parseBleConfig(configValue))
    this.updateToolsAvailability()
    this.renderRecorderInformation()
  }

  handleBleDisconnect() {
    setAircraftConnection(AircraftConnectionTransport.BLE, false)
    this.setTransportStatus(this.bleStatusTarget, "Disconnected", "disconnected")
    this.bleDeviceTarget.textContent = "No recorder selected"
    this.showBleNotice("Connection closed. Recorder information is no longer live over BLE.")
    this.bleCharacteristics = {}
    this.bleIdentity = null
    this.bleFacts = null
    this.bleAuthenticated = false
    this.bleDevice = null
    this.bleServer = null
    this.refreshRecorderRegistration()
    this.bleButtonTarget.disabled = false
    this.updateToolsAvailability()
    this.renderRecorderInformation()
  }

  startWifiPolling() {
    window.clearInterval(this.wifiPollTimer)
    void this.refreshSillageHeartbeat()
    this.wifiPollTimer = window.setInterval(() => void this.refreshSillageHeartbeat(), 5000)
  }

  async refreshSillageHeartbeat() {
    if (!this.hasSillageHeartbeatUrlValue) {
      this.disconnectSillageHeartbeat("Sillage heartbeat endpoint unavailable")
      return
    }

    try {
      const url = new URL(this.sillageHeartbeatUrlValue, window.location.origin)
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Sillage could not read recorder heartbeats.")

      const heartbeats = Array.isArray(payload.heartbeats) ? payload.heartbeats : []
      if (heartbeats.length === 0) return this.disconnectSillageHeartbeat("Waiting for signed Sillage heartbeat")
      if (heartbeats.length > 1) return this.renderMultipleSillageHeartbeats(heartbeats)

      this.renderSillageHeartbeat(heartbeats[0])
    } catch (error) {
      this.disconnectSillageHeartbeat("Sillage heartbeat status unavailable", { error: error.message })
    }
  }

  renderSillageHeartbeat(heartbeat) {
    const status = normalizeSillageHeartbeatStatus(heartbeat.status)
    this.wifiIdentity = sillageHeartbeatIdentity(heartbeat)
    this.wifiIdentities = [this.wifiIdentity]
    this.wifiDeviceTarget.textContent = this.wifiIdentity.deviceId
    this.wifiDeviceTarget.removeAttribute("title")
    this.setTransportStatus(this.wifiStatusTarget, "Connected", "ready")
    this.setWifiAutomaticDetail(
      `${describeWifiUpload(status.wifiUpload)} · signed heartbeat ${formatSeenAt(heartbeat.seen_at)}`
    )
    this.hideWifiNotice()
    setAircraftConnection(AircraftConnectionTransport.WIFI, true, {
      deviceId: this.wifiIdentity.deviceId,
      aircraftRegistration: heartbeat.aircraft?.registration
    })
    this.renderStatus(status, "wifi")
    this.renderDiagnostics(normalizeSillageHeartbeatDiagnostics(heartbeat.status?.diagnostics), "wifi")
    this.refreshRecorderRegistration()
    this.renderRecorderInformation()
  }

  renderMultipleSillageHeartbeats(heartbeats) {
    this.wifiIdentities = heartbeats.map(sillageHeartbeatIdentity)
    this.wifiIdentity = null
    this.wifiFacts = null
    const deviceIds = this.wifiIdentities.map(({ deviceId }) => deviceId)
    const deviceList = deviceIds.join(" · ")
    this.wifiDeviceTarget.textContent = deviceList
    this.wifiDeviceTarget.title = deviceList
    this.setTransportStatus(this.wifiStatusTarget, `${deviceIds.length} connected`, "connecting")
    this.setWifiAutomaticDetail(`${deviceIds.length} signed Sillage heartbeats: ${deviceIds.join(", ")}`)
    this.hideWifiNotice()
    setAircraftConnection(AircraftConnectionTransport.WIFI, true, { deviceIds })
    this.refreshRecorderRegistration()
    this.renderRecorderInformation()
  }

  disconnectSillageHeartbeat(detail, { error = null } = {}) {
    setAircraftConnection(AircraftConnectionTransport.WIFI, false)
    this.wifiIdentity = null
    this.wifiIdentities = []
    this.wifiFacts = null
    this.wifiDeviceTarget.textContent = "No recorder detected"
    this.wifiDeviceTarget.removeAttribute("title")
    this.setTransportStatus(
      this.wifiStatusTarget,
      error ? "Status unavailable" : "Not connected",
      error ? "error" : "disconnected"
    )
    this.setWifiAutomaticDetail(error || detail)
    if (error) {
      this.showWifiNotice(error, { state: "error", label: "Connection status" })
    } else {
      this.hideWifiNotice()
    }
    this.refreshRecorderRegistration()
    this.renderRecorderInformation()
  }

  renderStatus(status, transport) {
    const recording = (status.stateFlags & 0x01) !== 0
    const storageReady = (status.stateFlags & 0x02) !== 0
    const facts = {
      health: describeAlerts(status.alertFlags),
      storage: storageReady
        ? formatStorageCapacity(status.storageFreeMiB, status.storageTotalMiB)
        : "microSD unavailable",
      synchronization: status.lastSyncedFileIndex
        ? `Last file FDR${String(status.lastSyncedFileIndex).padStart(6, "0")}.BIN`
        : "No synchronized file",
      security: transport === "usb"
        ? this.usbAuthenticated
          ? "Sillage-authenticated USB-C"
          : status.securityState === 2
            ? "USB-C read-only · Sillage authentication required"
            : "USB-C read-only · secure initialization required"
        : transport === "wifi"
          ? "Signed Sillage heartbeat"
          : this.bleAuthenticated
            ? "Sillage-authenticated BLE"
            : status.securityState === 2
              ? "BLE read-only · Sillage authentication required"
              : "Encrypted BLE bond",
      issue: storageReady ? null : {
        message: "The recorder microSD is unavailable. Check that the card and reader are connected, then try again.",
        technical: ""
      }
    }
    if (transport === "usb") {
      if (this.usbSynchronization) facts.synchronization = this.usbSynchronization
      this.usbFacts = facts
      if (!this.usbBusy) {
        this.setTransportStatus(this.usbStatusTarget, recording ? "Recording" : "Connected", "ready")
      }
    } else if (transport === "ble") {
      this.bleFacts = facts
      this.setTransportStatus(this.bleStatusTarget, recording ? "Recording" : "Connected", "ready")
    } else {
      facts.synchronization = describeWifiUpload(status.wifiUpload)
      this.wifiFacts = facts
      this.setTransportStatus(this.wifiStatusTarget, recording ? "Recording" : "Connected", "ready")
    }
    this.renderRecorderInformation()
  }

  renderDiagnostics(diagnostics, transport) {
    const facts = transport === "usb" ? this.usbFacts : transport === "ble" ? this.bleFacts : this.wifiFacts
    const total = Object.values(diagnostics).reduce((sum, value) => sum + value, 0)
    if (total > 0 && facts?.health === "Nominal") {
      facts.health = `${total} recorded diagnostic event${total === 1 ? "" : "s"}`
      this.renderRecorderInformation()
    }
  }

  renderConfig(config) {
    this.configIntervalTarget.value = String(config.statusIntervalSeconds)
    this.configResultTarget.textContent = {
      0: "No pending change",
      1: "Configuration saved",
      2: "The recorder rejected this configuration.",
      3: "The recorder could not save this configuration."
    }[config.writeResult] || "The recorder returned an unknown configuration result."
  }

  showUsbSyncError(error) {
    const storageUnavailable = error?.recorderCode === UsbErrorCode.STORAGE_ERROR
    const technicalDetails = formatUsbErrorDetails(error)
    const recorderError = Number.isInteger(error?.recorderCode)
    const message = error instanceof Error ? error.message : String(error)
    this.syncProgressTarget.hidden = true
    if (recorderError) {
      this.usbRecorderError = { message, technical: technicalDetails }
      this.hideUsbNotice()
    } else {
      this.showUsbNotice(message, {
        state: "error",
        label: "Synchronization error",
        technical: technicalDetails
      })
    }
    if (this.usbIdentity) {
      this.usbFacts.health = "Attention required"
      if (storageUnavailable) this.usbFacts.storage = "microSD unavailable"
      this.usbSynchronization = "Interrupted"
      this.usbFacts.synchronization = this.usbSynchronization
    }
    this.renderRecorderInformation()
  }

  showUsbConnectionError(error) {
    setAircraftConnection(AircraftConnectionTransport.USB_C, false)
    this.usbRecorderError = null
    this.setTransportStatus(this.usbStatusTarget, "Connection error", "error")
    this.syncProgressTarget.hidden = true
    const technicalDetails = formatUsbErrorDetails(error)
    this.showUsbNotice(error instanceof Error ? error.message : String(error), {
      state: "error",
      label: "Connection error",
      technical: technicalDetails
    })
    this.usbIdentity = null
    this.usbFacts = null
    this.refreshRecorderRegistration()
    this.usbDeviceTarget.textContent = "No recorder selected"
    this.usbButtonTarget.textContent = "Connect USB-C"
    this.updateToolsAvailability()
    this.renderRecorderInformation()
  }

  showBleConnectionError(message) {
    setAircraftConnection(AircraftConnectionTransport.BLE, false)
    this.setTransportStatus(this.bleStatusTarget, "Connection error", "error")
    this.showBleNotice(message, { state: "error", label: "Connection error" })
    this.bleDeviceTarget.textContent = "No recorder selected"
    this.bleIdentity = null
    this.bleFacts = null
    this.refreshRecorderRegistration()
    this.bleButtonTarget.disabled = false
    this.updateToolsAvailability()
    this.renderRecorderInformation()
  }

  showControlActionError(message) {
    this.configResultTarget.textContent = message
  }

  showUsbNotice(message, { state = "status", label = "Synchronization", technical = "" } = {}) {
    this.usbNoticeTarget.dataset.state = state
    this.usbNoticeTarget.setAttribute("role", state === "error" ? "alert" : "status")
    this.usbNoticeLabelTarget.textContent = label
    this.syncDetailTarget.textContent = message
    this.syncDetailTarget.hidden = !message
    this.syncTechnicalTarget.textContent = technical
    this.syncTechnicalTarget.hidden = !technical
    this.usbNoticeTarget.hidden = !message && !technical
  }

  hideUsbNotice() {
    this.showUsbNotice("")
  }

  showBleNotice(message, { state = "status", label = "Connection status" } = {}) {
    this.bleNoticeTarget.dataset.state = state
    this.bleNoticeTarget.setAttribute("role", state === "error" ? "alert" : "status")
    this.bleNoticeLabelTarget.textContent = label
    this.bleDetailTarget.textContent = message
    this.bleDetailTarget.hidden = !message
    this.bleNoticeTarget.hidden = !message
  }

  hideBleNotice() {
    this.showBleNotice("")
  }

  showWifiNotice(message, { state = "status", label = "Automatic connection" } = {}) {
    this.wifiNoticeTarget.dataset.state = state
    this.wifiNoticeTarget.setAttribute("role", state === "error" ? "alert" : "status")
    this.wifiNoticeLabelTarget.textContent = label
    this.wifiDetailTarget.textContent = message
    this.wifiDetailTarget.hidden = !message
    this.wifiNoticeTarget.hidden = !message
  }

  hideWifiNotice() {
    this.showWifiNotice("")
  }

  setWifiAutomaticDetail(detail) {
    this.wifiAutoLabelTarget.title = detail
    this.wifiAutoLabelTarget.setAttribute("aria-label", `Automatic Wi-Fi connection: ${detail}`)
  }

  updateToolsAvailability() {
    const usb = Boolean(this.usbClient) && this.usbAuthenticated
    const ble = Boolean(this.bleCharacteristics.config) && this.bleAuthenticated
    const available = usb || ble
    this.configIntervalTarget.disabled = !available
    this.configButtonTarget.disabled = !available
    this.debugButtonTarget.disabled = !available
    if (!available) this.recorderToolsTarget.open = false
    this.recorderToolsHintTarget.textContent = available
      ? "Available"
      : "Connect USB-C or BLE to access"
    this.updateUsbActions()
  }

  updateUsbActions() {
    const authenticated = Boolean(this.usbClient) && this.usbAuthenticated
    const canErase = authenticated
      && (this.usbIdentity?.capabilities & UsbCapability.ERASE_RECORDINGS) !== 0
    this.stopSyncButtonTarget.hidden = !this.usbSyncActive
    this.stopSyncButtonTarget.disabled = !this.usbSyncActive || this.usbSyncInterrupted
    this.stopSyncButtonTarget.textContent = this.usbSyncInterrupted ? "Stopping…" : "Stop transfer"
    this.eraseSdButtonTarget.hidden = !canErase || this.usbSyncActive
    this.eraseSdButtonTarget.disabled = !canErase || this.usbEraseActive
    this.eraseSdButtonTarget.textContent = this.usbEraseActive ? "Erasing…" : "Erase recordings"
  }

  async requestAuthenticationProof(deviceId, nonce, transport) {
    const response = await fetch(this.authenticationUrlValue, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || ""
      },
      body: JSON.stringify({ device_id: deviceId, nonce, transport })
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || `Sillage could not authenticate this ${transport.toUpperCase()} session.`)
    return payload.proof
  }

  setTransportStatus(target, label, state) {
    target.textContent = label
    target.dataset.state = state
  }

  async refreshRecorderRegistration() {
    const usb = this.usbIdentity
    const ble = this.bleIdentity
    const identities = [usb, ble, ...this.wifiIdentities].filter(Boolean)
    if (new Set(identities.map((identity) => identity.deviceId)).size > 1) {
      this.registrationRequestToken += 1
      this.registrationLookupDeviceId = null
      this.registrationIdentity = null
      this.registrationState = "mismatch"
      this.wifiDescriptionTarget.textContent = "Several recorders are reporting connectivity. Keep only the intended recorder online before configuring Forge."
      this.wifiLinkTarget.hidden = true
      this.recorderOnboardingTarget.hidden = true
      this.setWifiRegistrationStatus("Multiple recorders detected", "error")
      return
    }

    const identity = usb || ble || this.wifiIdentity
    if (!identity) return this.resetWifiRegistration()

    this.registrationIdentity = {
      ...this.registrationIdentity,
      ...identity,
      model: identity.model || this.registrationIdentity?.model
    }
    if (this.registrationLookupDeviceId === identity.deviceId) return

    this.registrationLookupDeviceId = identity.deviceId
    const requestToken = ++this.registrationRequestToken
    this.wifiDescriptionTarget.textContent = `Checking ${identity.deviceId} in Forge…`
    this.wifiLinkTarget.hidden = true
    this.recorderOnboardingTarget.hidden = true
    this.setWifiRegistrationStatus("")

    try {
      const url = new URL(this.registrationUrlValue, window.location.origin)
      url.searchParams.set("device_id", identity.deviceId)
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Sillage could not check this recorder in Forge.")
      if (requestToken !== this.registrationRequestToken) return

      if (payload.registered) {
        if (this.usbAuthenticated && !payload.recorder.initialization_confirmed) {
          try {
            await this.confirmRecorderInitialization(payload.recorder, identity)
            payload.recorder.initialization_confirmed = true
          } catch (_) {}
        }
        this.renderRegisteredRecorder(payload.recorder, payload.aircraft)
      } else {
        this.renderUnregisteredRecorder(this.registrationIdentity)
      }
    } catch (error) {
      if (requestToken !== this.registrationRequestToken) return
      this.wifiDescriptionTarget.textContent = `Recorder ${identity.deviceId} is connected.`
      this.wifiLinkTarget.hidden = false
      this.recorderOnboardingTarget.hidden = true
      this.registrationState = "error"
      this.setWifiRegistrationStatus(error.message, "error")
      this.renderRecorderInformation()
    }
  }

  async onboardRecorder() {
    const identity = this.registrationIdentity
    if (!identity || this.registrationSubmitting) return
    if (!this.canOnboardRecorder(identity)) {
      this.setWifiRegistrationStatus(this.onboardingBlockedMessage(identity), "error")
      return
    }

    this.registrationSubmitting = true
    this.wifiRegisterButtonTarget.disabled = true
    window.clearInterval(this.usbPollTimer)
    this.usbPollTimer = null
    let recorder = this.registeredRecorder
    let aircraft = this.registeredAircraft
    try {
      if (!recorder) {
        this.wifiRegisterLabelTarget.textContent = "Adding to Forge…"
        this.setWifiRegistrationStatus("Creating the FDR in Forge…")
        const registration = await this.createRecorderRegistration(identity)
        recorder = registration.recorder
        aircraft = registration.aircraft
        this.registeredRecorder = recorder
        this.registeredAircraft = aircraft
      }

      this.wifiRegisterLabelTarget.textContent = this.usbAuthenticationConfigured ? "Authenticating…" : "Installing key…"
      this.setWifiRegistrationStatus(
        this.usbAuthenticationConfigured
          ? "Verifying this recorder with its Sillage key…"
          : "Installing the recorder-specific Sillage key over USB-C…"
      )
      await this.establishRecorderAuthentication(recorder, identity)
      this.usbAuthenticated = true
      await this.confirmRecorderInitialization(recorder, identity)
      recorder.initialization_confirmed = true
      this.renderRegisteredRecorder(recorder, aircraft)
      await this.disconnectUsb()
      window.location.assign(recorder.connectivity_url)
    } catch (error) {
      this.registrationSubmitting = false
      if (recorder) this.renderRecorderInitializationRequired(recorder, aircraft, error.message)
      else this.renderUnregisteredRecorder(identity, error.message)
      if (this.usbClient) this.startUsbPolling()
    }
  }

  async createRecorderRegistration(identity) {
    const response = await fetch(this.registrationUrlValue, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || ""
      },
      body: JSON.stringify({
        device_id: identity.deviceId,
        model: identity.model,
        firmware: identity.firmware,
        mavlink_system_id: identity.mavlinkSystemId,
        mavlink_component_id: identity.mavlinkComponentId
      })
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "Sillage could not add this recorder to Forge.")
    return payload
  }

  async establishRecorderAuthentication(recorder, identity) {
    if (!this.usbClient || this.usbIdentity?.deviceId !== identity.deviceId) {
      throw new Error("Keep this recorder connected over USB-C during secure initialization.")
    }

    if (!this.usbAuthenticationConfigured) {
      const response = await fetch(recorder.initialization_url, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || ""
        },
        body: JSON.stringify({ device_id: identity.deviceId })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Sillage could not prepare this recorder's authentication key.")
      await this.usbClient.installAuthenticationKey(payload.authentication.key)
      this.usbAuthenticationConfigured = true
    }

    const challenge = await this.usbClient.usbAuthenticationChallenge()
    if (!challenge.configured) throw new Error("The recorder did not retain its Sillage authentication key.")
    const proof = await this.requestAuthenticationProof(identity.deviceId, challenge.nonce, "usb")
    await this.usbClient.authenticateUsbSession(proof)
  }

  async confirmRecorderInitialization(recorder, identity) {
    const response = await fetch(recorder.initialization_url, {
      method: "PATCH",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || ""
      },
      body: JSON.stringify({ device_id: identity.deviceId })
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "Sillage could not confirm recorder initialization.")
  }

  canOnboardRecorder(identity = this.registrationIdentity) {
    const usbConnected = Boolean(this.usbClient) && this.usbIdentity?.deviceId === identity?.deviceId
    if (!usbConnected) return false
    return this.registrationState !== "unregistered" || !this.usbAuthenticationConfigured
  }

  onboardingBlockedMessage(identity = this.registrationIdentity) {
    if (!this.usbClient || this.usbIdentity?.deviceId !== identity?.deviceId) {
      return "Connect this recorder over USB-C to initialize it securely."
    }
    if (this.registrationState === "unregistered" && this.usbAuthenticationConfigured) {
      return "This recorder already contains another Sillage key. Factory-reset it before adding it here."
    }
    return "Recorder initialization is not available."
  }

  renderRegisteredRecorder(recorder, aircraft = null) {
    this.registeredRecorder = recorder
    this.registeredAircraft = aircraft
    if (this.usbIdentity?.deviceId === recorder.device_id && !this.usbAuthenticated) {
      this.renderRecorderInitializationRequired(recorder, aircraft)
      return
    }

    this.registrationState = "registered"
    this.registrationSubmitting = false
    this.updateResolvedConnections(recorder.device_id, aircraft)
    this.wifiDescriptionTarget.textContent = recorder.internal_number
      ? `${recorder.device_id} is registered in Forge and linked to ${recorder.internal_number}.`
      : `${recorder.device_id} is registered in Forge without a physical asset assignment.`
    this.wifiLinkTarget.href = recorder.connectivity_url
    this.wifiLinkLabelTarget.textContent = "Open connectivity"
    this.wifiLinkTarget.hidden = false
    this.recorderOnboardingTarget.hidden = true
    this.wifiRegisterButtonTarget.disabled = false
    this.wifiRegisterLabelTarget.textContent = "Add and initialize recorder"
    this.setWifiRegistrationStatus("")
    this.renderRecorderInformation()
  }

  renderRecorderInitializationRequired(recorder, aircraft = null, error = null) {
    this.registeredRecorder = recorder
    this.registeredAircraft = aircraft
    this.registrationState = this.usbAuthenticationConfigured ? "authentication_error" : "initialization_required"
    this.registrationSubmitting = false
    this.updateResolvedConnections(recorder.device_id, aircraft)
    this.wifiDescriptionTarget.textContent = `${recorder.device_id} is registered in Forge but requires secure USB-C initialization.`
    this.wifiLinkTarget.hidden = true
    this.recorderOnboardingTitleTarget.textContent = this.usbAuthenticationConfigured
      ? "Recorder authentication needs attention"
      : "Finish secure recorder initialization"
    this.recorderOnboardingTarget.hidden = false
    this.wifiRegisterButtonTarget.disabled = !this.canOnboardRecorder()
    this.wifiRegisterLabelTarget.textContent = this.usbAuthenticationConfigured ? "Retry authentication" : "Initialize recorder"
    this.setWifiRegistrationStatus(
      error || (this.usbAuthenticationConfigured
        ? "Sillage could not authenticate this recorder. Retry while keeping USB-C connected."
        : "Install and verify this recorder's unique Sillage key over USB-C."),
      error ? "error" : "status"
    )
    this.renderRecorderInformation()
  }

  renderUnregisteredRecorder(identity, error = null) {
    this.registeredRecorder = null
    this.registeredAircraft = null
    this.registrationState = "unregistered"
    this.registrationSubmitting = false
    this.updateResolvedConnections(identity.deviceId, null)
    this.wifiDescriptionTarget.textContent = `${identity.deviceId} is connected but not registered in Forge.`
    this.wifiLinkTarget.hidden = true
    this.recorderOnboardingTitleTarget.textContent = "New recorder detected"
    this.recorderOnboardingTarget.hidden = false
    const canOnboard = this.canOnboardRecorder(identity)
    this.wifiRegisterButtonTarget.disabled = !canOnboard
    this.wifiRegisterLabelTarget.textContent = "Add and initialize recorder"
    this.setWifiRegistrationStatus(error || (canOnboard
      ? "Create the Forge record and install its unique Sillage key without disconnecting USB-C."
      : this.onboardingBlockedMessage(identity)), error || (this.usbAuthenticationConfigured && !canOnboard) ? "error" : "status")
    this.renderRecorderInformation()
  }

  updateResolvedConnections(deviceId, aircraft) {
    const identity = {
      deviceId: deviceId,
      aircraftRegistration: aircraft?.registration
    }
    if (this.usbIdentity?.deviceId === deviceId) {
      setAircraftConnection(AircraftConnectionTransport.USB_C, true, identity)
    }
    if (this.bleIdentity?.deviceId === deviceId) {
      setAircraftConnection(AircraftConnectionTransport.BLE, true, identity)
    }
    if (this.wifiIdentity?.deviceId === deviceId) {
      setAircraftConnection(AircraftConnectionTransport.WIFI, true, identity)
    }
  }

  resetWifiRegistration() {
    this.registrationRequestToken += 1
    this.registrationIdentity = null
    this.registrationLookupDeviceId = null
    this.registrationState = "idle"
    this.registrationSubmitting = false
    this.registeredRecorder = null
    this.registeredAircraft = null
    this.wifiDescriptionTarget.textContent = this.defaultWifiState.description
    this.wifiLinkTarget.href = this.defaultWifiState.href
    this.wifiLinkLabelTarget.textContent = this.defaultWifiState.label
    this.wifiLinkTarget.hidden = false
    this.recorderOnboardingTarget.hidden = true
    this.wifiRegisterButtonTarget.disabled = false
    this.wifiRegisterLabelTarget.textContent = "Add and initialize recorder"
    this.setWifiRegistrationStatus("")
  }

  setWifiRegistrationStatus(message, state = "status") {
    this.wifiRegistrationStatusTarget.textContent = message
    this.wifiRegistrationStatusTarget.dataset.state = state
    this.wifiRegistrationStatusTarget.hidden = !message
  }

  renderRecorderInformation() {
    const usb = this.usbIdentity
    const ble = this.bleIdentity
    const identity = usb || ble || this.wifiIdentity
    const multipleWifiRecorders = this.wifiIdentities.length > 1

    if (!identity) {
      if (multipleWifiRecorders) {
        this.setTransportStatus(this.recorderStatusTarget, "Multiple recorders detected", "connecting")
        this.recorderStatusTarget.hidden = false
        this.recorderSourceTarget.textContent = `Wi-Fi · ${this.wifiIdentities.length} recorders`
        this.recorderSourceTarget.dataset.state = "error"
        this.recorderSourceTarget.hidden = false
        this.recorderDeviceTarget.textContent = this.wifiIdentities.map(({ deviceId }) => deviceId).join(" · ")
      } else {
        this.recorderStatusTarget.textContent = ""
        this.recorderStatusTarget.hidden = true
        this.recorderSourceTarget.textContent = ""
        this.recorderSourceTarget.dataset.state = "disconnected"
        this.recorderSourceTarget.hidden = true
        this.recorderDeviceTarget.textContent = "No recorder identified"
      }
      this.recorderFirmwareTarget.textContent = "—"
      this.healthTarget.textContent = "—"
      this.storageTarget.textContent = "—"
      this.lastSyncTarget.textContent = "—"
      this.securityTarget.textContent = "—"
      this.renderRecorderAlert(null)
      return
    }

    const identities = [usb, ble, ...this.wifiIdentities].filter(Boolean)
    const mismatch = new Set(identities.map(({ deviceId }) => deviceId)).size > 1 ||
      new Set(identities.map(({ firmware }) => firmware).filter(Boolean)).size > 1
    this.recorderDeviceTarget.textContent = identity.deviceId
    this.recorderFirmwareTarget.textContent = identity.firmware

    if (mismatch) {
      this.setTransportStatus(this.recorderStatusTarget, "Recorder mismatch", "error")
      this.recorderStatusTarget.hidden = false
      this.recorderSourceTarget.textContent = "Connected transports differ"
      this.recorderSourceTarget.dataset.state = "error"
      this.recorderSourceTarget.hidden = false
    } else {
      if (this.registrationState === "unregistered") {
        this.setTransportStatus(this.recorderStatusTarget, "Not registered in Forge", "connecting")
        this.recorderStatusTarget.hidden = false
      } else if (this.registrationState === "initialization_required") {
        this.setTransportStatus(this.recorderStatusTarget, "Initialization required", "connecting")
        this.recorderStatusTarget.hidden = false
      } else if (this.registrationState === "authentication_error") {
        this.setTransportStatus(this.recorderStatusTarget, "Authentication failed", "error")
        this.recorderStatusTarget.hidden = false
      } else if (this.registrationState === "error") {
        this.setTransportStatus(this.recorderStatusTarget, "Forge lookup unavailable", "error")
        this.recorderStatusTarget.hidden = false
      } else {
        this.recorderStatusTarget.textContent = ""
        this.recorderStatusTarget.hidden = true
      }
      this.recorderSourceTarget.textContent = ""
      this.recorderSourceTarget.dataset.state = "ready"
      this.recorderSourceTarget.hidden = true
    }

    const health = this.usbFacts?.health || this.bleFacts?.health || this.wifiFacts?.health || "Waiting for status"
    const storage = this.usbFacts?.storage || this.bleFacts?.storage || this.wifiFacts?.storage || "Not reported"
    const synchronization = this.usbFacts?.synchronization || this.bleFacts?.synchronization || this.wifiFacts?.synchronization || "Not reported"
    const security = [this.wifiFacts?.security, this.bleFacts?.security, this.usbFacts?.security].filter(Boolean).join(" · ") || "Not reported"
    this.healthTarget.textContent = health
    this.storageTarget.textContent = storage
    this.lastSyncTarget.textContent = synchronization
    this.securityTarget.textContent = security
    this.renderRecorderAlert(this.usbRecorderError || this.usbFacts?.issue || this.bleFacts?.issue || this.wifiFacts?.issue)
  }

  renderRecorderAlert(issue) {
    if (!issue) {
      this.recorderAlertTarget.hidden = true
      this.recorderAlertMessageTarget.textContent = ""
      this.recorderAlertTechnicalTarget.textContent = ""
      this.recorderAlertTechnicalTarget.hidden = true
      return
    }

    this.recorderAlertMessageTarget.textContent = issue.message
    this.recorderAlertTechnicalTarget.textContent = issue.technical
    this.recorderAlertTechnicalTarget.hidden = !issue.technical
    this.recorderAlertTarget.hidden = false
  }
}

function usbSyncInterruptedError() {
  const error = new Error("Synchronization interrupted by operator.")
  error.usbSyncInterrupted = true
  return error
}

function samePort(info, saved) {
  if (!saved || (saved.usbVendorId == null && saved.usbProductId == null)) return false
  return info.usbVendorId === saved.usbVendorId && info.usbProductId === saved.usbProductId
}

function formatBytes(value) {
  return value < 1024 * 1024
    ? `${Math.round(value / 1024)} KB`
    : `${(value / 1024 / 1024).toFixed(1)} MB`
}

function describeAlerts(flags) {
  if (flags === 0) return "Nominal"
  const alerts = [
    [0x01, "GPS"],
    [0x02, "IMU"],
    [0x04, "Airspeed"],
    [0x08, "Storage"],
    [0x10, "Recording queue"]
  ].filter(([flag]) => (flags & flag) !== 0).map(([, label]) => label)
  return alerts.length ? `${alerts.join(", ")} attention` : "Recorder attention"
}

function normalizeSillageHeartbeatStatus(status = {}) {
  const upload = status.wifi_upload || {}
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
      lastHttpStatus: Number(upload.last_http_status || 0)
    }
  }
}

function describeWifiUpload(upload = {}) {
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
      return "All sealed recordings synchronized"
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

function normalizeSillageHeartbeatDiagnostics(diagnostics = {}) {
  return {
    gpsErrors: Number(diagnostics.gps_errors || 0),
    imuErrors: Number(diagnostics.imu_errors || 0),
    airspeedErrors: Number(diagnostics.airspeed_errors || 0),
    storageWriteErrors: Number(diagnostics.storage_write_errors || 0),
    droppedRecords: Number(diagnostics.dropped_records || 0)
  }
}

function sillageHeartbeatIdentity(heartbeat) {
  const recorder = heartbeat?.recorder || {}
  const deviceId = String(recorder.device_id || "").trim().toUpperCase()
  if (!deviceId) throw new Error("Sillage returned a heartbeat without a recorder identifier.")

  return {
    deviceId,
    firmware: recorder.firmware,
    model: recorder.model
  }
}

function formatSeenAt(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return "just now"
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  return seconds < 2 ? "just now" : `${seconds}s ago`
}

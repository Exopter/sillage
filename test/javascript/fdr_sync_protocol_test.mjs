import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const contractSource = await readFile(
  new URL("../../app/javascript/lib/exs1_contract.js", import.meta.url),
  "utf8"
)
const contractUrl = `data:text/javascript;base64,${Buffer.from(contractSource).toString("base64")}`
const protocolSource = (await readFile(
  new URL("../../app/javascript/lib/fdr_sync_protocol.js", import.meta.url),
  "utf8"
)).replaceAll('from "exs1_contract"', `from "${contractUrl}"`)
const protocol = await import(`data:text/javascript;base64,${Buffer.from(protocolSource).toString("base64")}`)
const contract = await import(contractUrl)
const connectivitySource = await readFile(
  new URL("../../app/javascript/controllers/fdr_connectivity_controller.js", import.meta.url),
  "utf8"
)
const connectivityViewSource = await readFile(
  new URL("../../app/views/signal/_fdr_connectivity.html.erb", import.meta.url),
  "utf8"
)

const synchronizeUsbStart = connectivitySource.indexOf("  async synchronizeUsb(port")
assert.ok(synchronizeUsbStart >= 0)
const synchronizeUsbSource = connectivitySource.slice(synchronizeUsbStart)
  .split("\n  usbSessionActive(", 1)[0]
assert.ok(synchronizeUsbSource.indexOf("await this.synchronizeUsbFiles(client, device)") >= 0)
assert.ok(
  synchronizeUsbSource.indexOf("this.startUsbPolling()")
    > synchronizeUsbSource.indexOf("await this.synchronizeUsbFiles(client, device)")
)
assert.doesNotMatch(synchronizeUsbSource, /this\.usbButtonTarget\.disabled = true/)
assert.doesNotMatch(synchronizeUsbSource, /this\.syncProgressTarget\.hidden = false/)
const synchronizeUsbFilesSource = connectivitySource.split("  async synchronizeUsbFiles(client, device) {", 2)[1]
  .split("\n  ensureUsbSyncContinues(", 1)[0]
assert.match(synchronizeUsbFilesSource, /this\.syncProgressTarget\.hidden = false/)
const serialDisconnectSource = connectivitySource.split("  handleSerialDisconnect(event) {", 2)[1]
  .split("\n  }", 1)[0]
assert.match(serialDisconnectSource, /void this\.disconnectUsb\(\)/)
const disconnectUsbSource = connectivitySource.split("  async disconnectUsb() {", 2)[1]
  .split("\n  }", 1)[0]
assert.match(disconnectUsbSource, /await client\?\.close\(\)/)
assert.match(disconnectUsbSource, /this\.syncProgressTarget\.hidden = true/)
assert.match(connectivitySource, /interruptUsbSync\(\)/)
assert.match(connectivitySource, /usbSyncInterruptedError\(\)/)
assert.match(connectivitySource, /skipFileSynchronization: true/)
assert.match(connectivitySource, /await this\.disconnectUsb\(\)/)
assert.match(connectivitySource, /window\.confirm\("Erase all FDR recordings/)
assert.match(connectivitySource, /Stop the transfer before erasing recordings\./)
assert.match(connectivitySource, /describeWifiUpload\(status\.wifiUpload\)/)
assert.match(connectivitySource, /Uploading \$\{filename\} · \$\{percent\}%/)
assert.match(connectivitySource, /All sealed recordings synchronized/)
assert.match(connectivityViewSource, /Automatic resumable recording upload/)
assert.match(connectivityViewSource, /fdr-connectivity#interruptUsbSync/)
assert.match(connectivityViewSource, /fdr-connectivity#eraseSdRecordings/)

const payload = new TextEncoder().encode("abc")
assert.equal(protocol.crc32(payload), 0x352441c2)
assert.equal(
  Buffer.from(protocol.encodeFrame(protocol.UsbMessage.HELLO, 0x10203040, Uint8Array.from([0, 1, 2, 3]))).toString("hex"),
  contract.EXS1_GOLDEN_FRAME_HEX
)
assert.equal(protocol.UsbMessage.STATUS, 12)
assert.equal(protocol.UsbMessage.DIAGNOSTICS, 14)
assert.equal(protocol.UsbMessage.CONFIG, 16)
assert.equal(protocol.UsbMessage.SET_CONFIG, 18)
assert.equal(protocol.UsbMessage.DEBUG, 19)
assert.equal(protocol.UsbMessage.WIFI, 21)
assert.equal(protocol.UsbMessage.SECURITY, 23)
assert.equal(protocol.UsbMessage.ERASE_RECORDINGS, 31)
assert.equal(protocol.UsbMessage.ERASE_RECORDINGS_DATA, 32)
assert.equal(protocol.UsbCapability.ERASE_RECORDINGS, 1 << 10)
assert.equal(protocol.USB_CHUNK_SIZE, 4096)
assert.equal(protocol.USB_CONNECTION_TIMEOUT_MS, 10_000)
assert.equal(protocol.USB_REQUEST_TIMEOUT_MS, 30_000)
assert.equal(protocol.USB_FILE_PREPARATION_TIMEOUT_MS, 120_000)
assert.equal(protocol.USB_ERASE_RECORDINGS_TIMEOUT_MS, 120_000)
assert.equal(protocol.USB_PORT_RELEASE_TIMEOUT_MS, 2_000)

const releasedPort = { readable: { locked: true }, writable: { locked: true } }
setTimeout(() => {
  releasedPort.readable.locked = false
  releasedPort.writable.locked = false
}, 5)
await protocol.waitForUsbPortAvailability(releasedPort, { timeoutMs: 100 })

await assert.rejects(
  protocol.waitForUsbPortAvailability(
    { readable: { locked: true }, writable: { locked: false } },
    { timeoutMs: 5 }
  ),
  { message: "USB-C is still in use by another Sillage page. Wait a moment, then try again." }
)

let releaseUsbOpen
let latePortCloseCount = 0
const lateReader = {
  async cancel() {},
  releaseLock() {}
}
const lateWriter = { releaseLock() {} }
const latePort = {
  readable: null,
  writable: null,
  async open() {
    await new Promise((resolve) => { releaseUsbOpen = resolve })
    this.readable = { getReader: () => lateReader }
    this.writable = { getWriter: () => lateWriter }
  },
  async close() { latePortCloseCount += 1 }
}
const lateClient = new protocol.UsbFdrClient(latePort)
await assert.rejects(
  lateClient.connect({ timeoutMs: 5 }),
  { message: "USB connection timed out after 10 seconds. Disconnect and reconnect the recorder, then try again." }
)
releaseUsbOpen()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(latePortCloseCount, 2)

let stalledHelloCloseCount = 0
let finishStalledHelloClose
const stalledHelloClient = new protocol.UsbFdrClient({})
stalledHelloClient.open = async () => {}
stalledHelloClient.hello = async () => new Promise(() => {})
stalledHelloClient.performClose = async () => {
  stalledHelloCloseCount += 1
  await new Promise((resolve) => { finishStalledHelloClose = resolve })
}
await assert.rejects(
  stalledHelloClient.connect({ timeoutMs: 5 }),
  { message: "USB connection timed out after 10 seconds. Disconnect and reconnect the recorder, then try again." }
)
const repeatedClose = stalledHelloClient.close()
assert.equal(stalledHelloCloseCount, 1)
finishStalledHelloClose()
await repeatedClose

let unopenedPortCloseCount = 0
const unopenedPortClient = new protocol.UsbFdrClient({
  readable: null,
  writable: null,
  async close() { unopenedPortCloseCount += 1 }
})
await unopenedPortClient.close()
assert.equal(unopenedPortCloseCount, 1)

const closedClient = new protocol.UsbFdrClient({ readable: null, writable: null })
await assert.rejects(
  closedClient.request(protocol.UsbMessage.STATUS, new Uint8Array(), [protocol.UsbMessage.STATUS_DATA]),
  (error) => error.message === "The recorder disconnected during synchronization. The source recording and any partial transfer are preserved; reconnect it to resume."
    && error.usbConnectionLost === true
)

let timedOutRequestCloseCount = 0
const timedOutRequestClient = new protocol.UsbFdrClient({ readable: null, writable: null })
timedOutRequestClient.writer = { async write() {}, releaseLock() {} }
timedOutRequestClient.frameReader = { async read() { return new Promise(() => {}) } }
timedOutRequestClient.performClose = async function () {
  timedOutRequestCloseCount += 1
  this.writer = null
  this.frameReader = null
}
await assert.rejects(
  timedOutRequestClient.request(
    protocol.UsbMessage.READ_CHUNK,
    new Uint8Array(),
    [protocol.UsbMessage.FILE_CHUNK],
    { timeoutMs: 5 }
  ),
  (error) => error.message === "The recorder stopped responding while transferring the recording (1s timeout). The partial transfer is saved; reconnect it to resume."
    && error.usbConnectionLost === true
    && error.usbRequestTimedOut === true
    && error.usbRequestType === protocol.UsbMessage.READ_CHUNK
    && error.timeoutMs === 5
)
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(timedOutRequestCloseCount, 1)

const manifestTimeoutClient = new protocol.UsbFdrClient({})
manifestTimeoutClient.request = async (_type, _payload, _expectedTypes, options) => {
  assert.deepEqual(options, { timeoutMs: protocol.USB_FILE_PREPARATION_TIMEOUT_MS })
  return { type: protocol.UsbMessage.NO_FILE, payload: new Uint8Array() }
}
assert.equal(await manifestTimeoutClient.nextFile(), null)

const eraseResultPayload = new Uint8Array(16)
const eraseResultView = new DataView(eraseResultPayload.buffer)
eraseResultView.setUint8(0, 1)
eraseResultView.setUint8(1, protocol.EraseRecordingsResult.OK)
eraseResultView.setUint32(4, 12, true)
eraseResultView.setBigUint64(8, 3_636_527n, true)
assert.deepEqual(protocol.parseEraseRecordingsResult(eraseResultPayload), {
  version: 1,
  result: protocol.EraseRecordingsResult.OK,
  deletedFiles: 12,
  deletedBytes: 3_636_527
})
const eraseClient = new protocol.UsbFdrClient({})
eraseClient.request = async (type, requestPayload, expectedTypes, options) => {
  assert.equal(type, protocol.UsbMessage.ERASE_RECORDINGS)
  assert.equal(requestPayload.length, 0)
  assert.deepEqual(expectedTypes, [protocol.UsbMessage.ERASE_RECORDINGS_DATA])
  assert.deepEqual(options, { timeoutMs: protocol.USB_ERASE_RECORDINGS_TIMEOUT_MS })
  return { payload: eraseResultPayload }
}
assert.equal((await eraseClient.eraseRecordings()).deletedFiles, 12)

const failedErasePayload = eraseResultPayload.slice()
failedErasePayload[1] = protocol.EraseRecordingsResult.STORAGE_ERROR
assert.throws(
  () => protocol.parseEraseRecordingsResult(failedErasePayload),
  { message: "The recorder could not erase all recordings or restart logging. Check storage diagnostics before trying again." }
)

const frame = protocol.encodeFrame(protocol.UsbMessage.HELLO, 42, payload)
const chunks = [frame.slice(0, 3), frame.slice(3, 17), frame.slice(17)]
const reader = new protocol.FrameReader({
  async read() {
    const value = chunks.shift()
    return value ? { value, done: false } : { done: true }
  }
})
const decoded = await reader.read()
assert.equal(decoded.type, protocol.UsbMessage.HELLO)
assert.equal(decoded.sequence, 42)
assert.deepEqual([...decoded.payload], [...payload])

const usbErrorMessages = new Map([
  [protocol.UsbErrorCode.BAD_FRAME, "The recorder rejected a corrupted USB command. Disconnect and reconnect it, then try again."],
  [protocol.UsbErrorCode.BAD_SEQUENCE, "The recorder USB session is no longer active. Disconnect and reconnect it, then try again."],
  [protocol.UsbErrorCode.NOT_READY, "The recorder is not ready yet. Wait a few seconds, then try again."],
  [protocol.UsbErrorCode.BAD_REQUEST, "Sillage and the recorder firmware do not support the same USB command. Update them to compatible versions."],
  [protocol.UsbErrorCode.STORAGE_ERROR, "The recorder microSD is unavailable. Check that the card and reader are connected, then try again."],
  [protocol.UsbErrorCode.HASH_MISMATCH, "The recorder rejected the synchronization acknowledgement because the file checksum did not match. The file remains on the recorder; reconnect and try again."],
  [protocol.UsbErrorCode.AUTHENTICATION_REQUIRED, "Sillage must authenticate this USB-C session before the recorder accepts synchronization or configuration commands."]
])
for (const [code, message] of usbErrorMessages) {
  const usbErrorPayload = new Uint8Array(8)
  const usbErrorView = new DataView(usbErrorPayload.buffer)
  usbErrorView.setUint16(0, code, true)
  usbErrorView.setUint8(2, protocol.UsbMessage.NEXT_FILE)
  const error = protocol.parseUsbDeviceError(usbErrorPayload)
  assert.equal(error.message, message)
  assert.equal(error.recorderCode, code)
  assert.equal(error.recorderRequestType, protocol.UsbMessage.NEXT_FILE)
  assert.equal(error.usbConnectionLost, code === protocol.UsbErrorCode.BAD_SEQUENCE ? true : undefined)
  assert.equal(
    protocol.formatUsbErrorDetails(error),
    `EXS1 · error ${Object.entries(protocol.UsbErrorCode).find(([, value]) => value === code)[0]} (${code}) · request NEXT_FILE (3)`
  )
}

const unknownUsbErrorPayload = new Uint8Array(8)
new DataView(unknownUsbErrorPayload.buffer).setUint16(0, 99, true)
assert.equal(
  protocol.parseUsbDeviceError(unknownUsbErrorPayload).message,
  "The recorder reported an unknown USB error. Disconnect and reconnect it, then try again."
)
assert.equal(
  protocol.formatUsbErrorDetails(protocol.parseUsbDeviceError(unknownUsbErrorPayload)),
  "EXS1 · error UNKNOWN_ERROR (99) · request UNKNOWN_REQUEST (0)"
)
assert.equal(protocol.formatUsbErrorDetails(new Error("Browser error")), "")

const status = new Uint8Array(20)
const statusView = new DataView(status.buffer)
statusView.setUint8(0, 1)
statusView.setUint8(1, 0x43)
statusView.setUint16(2, 0x7f, true)
statusView.setUint16(4, 0x08, true)
statusView.setUint16(6, 1200, true)
statusView.setUint16(8, 32000, true)
statusView.setUint8(10, 1)
statusView.setUint8(11, 1)
statusView.setUint32(12, 18, true)
statusView.setUint32(16, 17, true)
assert.deepEqual(protocol.parseBleStatus(status), {
  version: 1,
  stateFlags: 0x43,
  sensorValidity: 0x7f,
  alertFlags: 0x08,
  storageFreeMiB: 1200,
  storageTotalMiB: 32000,
  lastSyncResult: 1,
  securityState: 1,
  activeFileIndex: 18,
  lastSyncedFileIndex: 17
})
assert.equal(protocol.formatStorageCapacity(29906, 30429), "29.2 GiB free of 29.7 GiB")
assert.equal(protocol.formatStorageCapacity(512, 768), "512 MiB free of 768 MiB")

assert.deepEqual([...protocol.encodeBleConfig(10)], [1, 10, 1, 0, 0, 0, 0, 0])

const deviceInfo = new Uint8Array(64)
deviceInfo[0] = 1
deviceInfo[1] = 3
deviceInfo[2] = 5
deviceInfo.set(new TextEncoder().encode("EXOFDR-ABC123"), 4)
deviceInfo.set(new TextEncoder().encode("fdr_integrated/8"), 28)
deviceInfo.set(new TextEncoder().encode("XIAO ESP32S3"), 52)
assert.deepEqual(protocol.parseBleDeviceInfo(deviceInfo), {
  version: 1,
  capabilities: 3,
  maxWifiProfiles: 5,
  deviceId: "EXOFDR-ABC123",
  firmware: "fdr_integrated/8",
  model: "XIAO ESP32S3"
})

const staged = protocol.encodeWifiStageProfile({
  position: 1,
  ssid: "EXOPTER-LAB",
  security: 6,
  enabled: true,
  password: "hangar-secret"
})
assert.deepEqual([...staged.slice(0, 7)], [1, protocol.WifiCommand.STAGE_PROFILE, 1, 1, 6, 11, 13])
assert.equal(new TextDecoder().decode(staged.slice(7, 18)), "EXOPTER-LAB")
assert.equal(new TextDecoder().decode(staged.slice(18)), "hangar-secret")

const wifiStatus = new Uint8Array(20)
const wifiStatusView = new DataView(wifiStatus.buffer)
wifiStatus.set([1, protocol.WifiResponse.STATUS, 0, 2, protocol.WifiScanState.COMPLETE, 3, 1])
wifiStatusView.setUint32(8, 7, true)
wifiStatusView.setUint32(12, 4, true)
wifiStatusView.setInt16(16, -48, true)
wifiStatusView.setUint16(18, 1, true)
assert.deepEqual(protocol.parseWifiResponse(wifiStatus), {
  type: protocol.WifiResponse.STATUS,
  profileCount: 2,
  scanState: protocol.WifiScanState.COMPLETE,
  scanCount: 3,
  activeProfileIndex: 1,
  revision: 7,
  scanGeneration: 4,
  rssi: -48,
  connected: true
})

const usbWifiRequests = []
const usbWifiClient = new protocol.UsbWifiClient({
  async wifi(request) {
    usbWifiRequests.push(request)
    return wifiStatus
  }
})
assert.deepEqual(await usbWifiClient.status(), protocol.parseWifiResponse(wifiStatus))
assert.deepEqual([...usbWifiRequests[0]], [1, protocol.WifiCommand.GET_STATUS])

const sillageHeartbeatUrl = "https://sillage.exopter.com/api/v1/fdr-sillage-heartbeat"
const encodedSillage = protocol.encodeWifiSillage({ heartbeatUrl: sillageHeartbeatUrl })
assert.deepEqual([...encodedSillage.slice(0, 3)], [
  1,
  protocol.WifiCommand.SET_SILLAGE,
  new TextEncoder().encode(sillageHeartbeatUrl).length
])
assert.equal(
  new TextDecoder().decode(encodedSillage.slice(3)),
  sillageHeartbeatUrl
)

const sillageClient = new protocol.BleWifiClient(null)
sillageClient.request = async (payload, expectedType) => {
  assert.deepEqual(payload, encodedSillage)
  assert.equal(expectedType, protocol.WifiResponse.ACK)
  return { type: protocol.WifiResponse.ACK }
}
await sillageClient.configureSillage(sillageHeartbeatUrl)

const sillageResponse = new Uint8Array(5 + sillageHeartbeatUrl.length)
sillageResponse.set([1, protocol.WifiResponse.SILLAGE, 0, 1, sillageHeartbeatUrl.length])
sillageResponse.set(new TextEncoder().encode(sillageHeartbeatUrl), 5)
assert.deepEqual(protocol.parseWifiResponse(sillageResponse), {
  type: protocol.WifiResponse.SILLAGE,
  configured: true,
  url: sillageHeartbeatUrl
})

const authStatus = new Uint8Array(20)
authStatus.set([1, 0, 1, 0])
authStatus.set(Uint8Array.from({ length: 16 }, (_, index) => index), 4)
assert.deepEqual(protocol.parseBleAuthenticationStatus(authStatus), {
  version: 1,
  result: protocol.FdrAuthResult.OK,
  configured: true,
  authenticated: false,
  nonce: "000102030405060708090a0b0c0d0e0f"
})

const rawAuthKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const encodedAuthKey = Buffer.from(rawAuthKey).toString("base64url")
const usbNonce = Uint8Array.from({ length: 16 }, (_, index) => 15 - index)
const usbProof = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)
const usbSecurityClient = new protocol.UsbFdrClient({})
usbSecurityClient.request = async (type, requestPayload, expectedTypes) => {
  assert.equal(type, protocol.UsbMessage.SECURITY)
  assert.deepEqual(expectedTypes, [protocol.UsbMessage.SECURITY_DATA])
  const command = requestPayload[1]
  const response = new Uint8Array(20)
  response.set([1, protocol.FdrAuthResult.OK, 1, command === protocol.UsbSecurityCommand.AUTHENTICATE ? 1 : 0])
  if (command === protocol.UsbSecurityCommand.GET_CHALLENGE) {
    assert.deepEqual([...requestPayload], [1, protocol.UsbSecurityCommand.GET_CHALLENGE])
    response.set(usbNonce, 4)
  } else if (command === protocol.UsbSecurityCommand.INSTALL_KEY) {
    assert.deepEqual([...requestPayload.slice(2)], [...rawAuthKey])
  } else if (command === protocol.UsbSecurityCommand.AUTHENTICATE) {
    assert.deepEqual([...requestPayload.slice(2)], [...usbProof])
  } else {
    assert.fail(`Unexpected USB security command ${command}`)
  }
  return { payload: response }
}
assert.deepEqual(await usbSecurityClient.usbAuthenticationChallenge(), {
  version: 1,
  result: protocol.FdrAuthResult.OK,
  configured: true,
  authenticated: false,
  nonce: Buffer.from(usbNonce).toString("hex")
})
assert.equal((await usbSecurityClient.authenticateUsbSession(Buffer.from(usbProof).toString("hex"))).authenticated, true)
assert.deepEqual(await usbSecurityClient.installAuthenticationKey(encodedAuthKey), {
  version: 1,
  result: protocol.FdrAuthResult.OK,
  configured: true,
  authenticated: false,
  nonce: "00000000000000000000000000000000"
})

const missingChallengeClient = new protocol.UsbFdrClient({})
missingChallengeClient.request = async () => ({ payload: Uint8Array.from([1, 0, 1, 0, ...new Uint8Array(16)]) })
await assert.rejects(
  () => missingChallengeClient.usbAuthenticationChallenge(),
  { message: "The recorder did not provide a fresh authentication challenge. Disconnect and reconnect it, then try again." }
)

const wifiErrorMessages = new Map([
  [protocol.WifiResult.INVALID_COMMAND, "The recorder does not support this Wi-Fi command. Check that Sillage and the recorder firmware are compatible."],
  [protocol.WifiResult.INVALID_INDEX, "The selected Wi-Fi profile no longer exists. Refresh the page and try again."],
  [protocol.WifiResult.INVALID_DATA, "The recorder rejected the Wi-Fi settings. Check the network name, security type, and password."],
  [protocol.WifiResult.STORAGE_ERROR, "The recorder could not save the Wi-Fi settings. Restart it and try again."],
  [protocol.WifiResult.BUSY, "The recorder is busy with another Wi-Fi operation. Wait a few seconds and try again."],
  [protocol.WifiResult.NOT_READY, "The recorder is not ready for this Wi-Fi operation. Wait for the current scan or update to finish."],
  [protocol.WifiResult.UNAUTHORIZED, "Sillage has not authenticated this BLE session. Reconnect the recorder and try again."]
])
for (const [result, message] of wifiErrorMessages) {
  const wifiError = Uint8Array.from([1, protocol.WifiResponse.ERROR, result, protocol.WifiCommand.START_SCAN, 0, 0, 0, 0])
  assert.throws(
    () => protocol.parseWifiResponse(wifiError),
    (error) => error.message === message
      && error.recorderWifiResult === result
      && error.recorderWifiCommand === protocol.WifiCommand.START_SCAN
  )
}

const unknownWifiError = Uint8Array.from([1, protocol.WifiResponse.ERROR, 99, 0, 0, 0, 0, 0])
assert.throws(
  () => protocol.parseWifiResponse(unknownWifiError),
  { message: "The recorder reported an unknown Wi-Fi error. Reconnect it and try again." }
)

console.log("FDR synchronization protocol tests passed")

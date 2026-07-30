import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import vm from "node:vm"

const workerSource = await readFile(new URL("../../public/signal_serial_worker.js", import.meta.url), "utf8")
const messages = []
const writes = []
const captureHandle = {
  size: 0,
  flushed: false,
  closed: false,
  getSize() { return this.size },
  write(bytes, { at }) {
    writes.push({ at, bytes: Uint8Array.from(bytes) })
    this.size = Math.max(this.size, at + bytes.length)
  },
  flush() { this.flushed = true },
  close() { this.closed = true }
}
const scope = {
  self: { postMessage: (message) => messages.push(message) },
  navigator: {
    storage: {
      getDirectory: async () => ({
        getFileHandle: async () => ({ createSyncAccessHandle: async () => captureHandle })
      })
    }
  },
  Uint8Array,
  Int8Array,
  DataView,
  TextDecoder,
  BigInt,
  Date,
  Map,
  Math
}
vm.createContext(scope)
vm.runInContext(workerSource, scope, { filename: "signal_serial_worker.js" })

await scope.self.onmessage({ data: { type: "init-capture", filename: "test.mavcap" } })
assert.equal(messages.shift().type, "capture-ready")

const heartbeat = mavlinkV1Frame({ sequence: 10, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 })
await feed(heartbeat.slice(0, 5), "1000000")
assert.equal(frameMessages().length, 0, "fragmented frame must remain buffered")
await feed(heartbeat.slice(5), "1000001")
assert.equal(frameMessages().at(-1).decoded.name, "heartbeat")

const corrupted = Uint8Array.from(mavlinkV1Frame({ sequence: 11, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 }))
corrupted[corrupted.length - 1] ^= 0xff
await feed(corrupted, "1000002")
assert.equal(frameMessages().length, 1, "bad CRC must not emit telemetry")

await feed(mavlinkV1Frame({ sequence: 12, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 }), "1000003")
assert.equal(frameMessages().at(-1).parser.dropped, 1, "a missing sequence must be reported")
await feed(mavlinkV1Frame({ sequence: 12, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 }), "1000004")
assert.equal(frameMessages().at(-1).parser.dropped, 1, "a duplicate must not create a false gap")
await feed(mavlinkV1Frame({ sequence: 9, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 }), "1000005")
assert.equal(frameMessages().at(-1).parser.dropped, 1, "an out-of-order frame must not create a wrap-sized gap")

const signedFrame = mavlinkV2SignedFrame({ sequence: 13, messageId: 0, payload: new Uint8Array(9) })
const afterSigned = mavlinkV1Frame({ sequence: 14, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 })
await feed(join(signedFrame, afterSigned), "1000006")
assert.equal(frameMessages().at(-1).sequence, 14, "a signed frame must be consumed at its complete length")

const unknown = mavlinkV1Frame({ sequence: 15, messageId: 200, payload: new Uint8Array(0), crcExtra: 0 })
const writesBeforeUnknown = writes.length
await feed(unknown, "1000007")
assert.equal(writes.length, writesBeforeUnknown + 1, "unsupported messages must still enter the raw capture")

await scope.self.onmessage({ data: { type: "close" } })
assert.equal(messages.at(-1).type, "capture-closed")
assert.equal(captureHandle.flushed, true)
assert.equal(captureHandle.closed, true)

console.log("Signal serial worker tests passed")

async function feed(bytes, receivedAtUs) {
  await scope.self.onmessage({ data: { type: "bytes", bytes: exactArrayBuffer(bytes), receivedAtUs } })
}

function frameMessages() {
  return messages.filter((message) => message.type === "frame")
}

function exactArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function mavlinkV1Frame({ sequence, messageId, payload, crcExtra }) {
  const body = Uint8Array.from([ payload.length, sequence, 1, 1, messageId, ...payload ])
  const crc = x25Crc(body, crcExtra)
  return Uint8Array.from([ 0xfe, ...body, crc & 0xff, crc >> 8 ])
}

function mavlinkV2SignedFrame({ sequence, messageId, payload }) {
  const header = [ 0xfd, payload.length, 0x01, 0, sequence, 1, 1, messageId & 0xff, (messageId >> 8) & 0xff, (messageId >> 16) & 0xff ]
  return Uint8Array.from([ ...header, ...payload, 0, 0, ...new Uint8Array(13) ])
}

function join(...arrays) {
  const result = new Uint8Array(arrays.reduce((total, bytes) => total + bytes.length, 0))
  let offset = 0
  for (const bytes of arrays) {
    result.set(bytes, offset)
    offset += bytes.length
  }
  return result
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

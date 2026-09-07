import assert from "node:assert/strict"
import {authenticationHex, commandSequence, heartbeatPayloads, importReceipt, readResponse, registrationPayload} from "../../app/javascript/lib/fdr_api.js"

const sha256 = "a".repeat(64)
const assembly = {name: "EXOFDR-V0-PERF-03", identity_label: "EXOFDR-V0-PERF-03", serial_number: "EXOFDR-V0-PERF-03", functional_configuration: "V0", assembly_method: "PERF"}
const recorder = {device_id: "ECU-A172E0", assembly, initialization_confirmed: true, connectivity_url: "/hangar/controllers/1/connectivity", initialization_url: "/hangar/controllers/1/initialize"}
assert.deepEqual(registrationPayload({registered: false}), {registered: false})
assert.deepEqual(registrationPayload({registered: true, recorder}).recorder, recorder)
assert.equal(registrationPayload({registered: true, recorder: {...recorder, assembly: null}}).recorder.assembly, null)
assert.equal(registrationPayload({registered: true, recorder: {...recorder, assembly: undefined}}).recorder.assembly, undefined)
assert.throws(() => registrationPayload({registered: true, recorder: {...recorder, assembly: {name: "EXOFDR-V0-PERF-03"}}}))
for (const payload of [null, [], {}, {registered: true, recorder: {}}, {registered: true, recorder: {...recorder, connectivity_url: "//untrusted.example/"}}]) {
  assert.throws(() => registrationPayload(payload))
}
for (const status of ["pending", "processing", "imported", "failed"]) {
  assert.equal(importReceipt({sha256, import_status: status}).import_status, status)
}
for (const payload of [{sha256, import_status: "accepted"}, {sha256: "short", import_status: "imported"}, null]) {
  assert.throws(() => importReceipt(payload))
}
for (const value of [0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => commandSequence(value))
assert.equal(commandSequence(1), 1)
assert.equal(authenticationHex(sha256), sha256)
await assert.rejects(readResponse(new Response(JSON.stringify({error: "Import failed"}), {status: 422}), "Fallback"), /Import failed/)
await assert.rejects(readResponse(new Response("null"), "Fallback"), /invalid response object/)
const heartbeat = {recorder: {device_id: recorder.device_id, assembly}, seen_at: "2026-09-06T12:00:00Z", status: {recording: true, wifi_upload: {active: false, bytes: 10}}}
assert.deepEqual(heartbeatPayloads({heartbeats: [heartbeat]})[0].recorder.assembly, assembly)
assert.equal(heartbeatPayloads({heartbeats: [heartbeat]})[0].status.recording, true)
assert.throws(() => heartbeatPayloads({heartbeats: [{...heartbeat, status: {wifi_upload: {nested: {}}}}]}))
assert.throws(() => heartbeatPayloads({heartbeats: "invalid"}))
console.log("FDR API registration, receipts, commands and heartbeat boundary tests passed")

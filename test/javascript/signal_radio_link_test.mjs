import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
const source = await readFile(new URL("../../app/javascript/lib/signal_radio_link.js", import.meta.url), "utf8")
const {resolveRadioIdentity} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const deviceId = "ECU-441BF685BEC8"
const assignedWing = {deviceId, recorderLabel: "EXOFDR-V1-PCB-01", aircraftLabel: "Freak 6 Vincent · WS-F6-VD", registered: true, assemblyId: 42, canAcquire: true, modeControl: false}

// The same read-only registration endpoint owns the assembly-to-aircraft chain.
const originalFetch = globalThis.fetch
const registration = (id, name = "Freak 6 Vincent · WS-F6-VD") => ({registered:true,
  recorder:{device_id:id,assembly_id:42,acquisition_allowed:true,assembly:{serial_number:"EXOFDR-V1-PCB-01"}},aircraft:{display_name:name}})
globalThis.fetch = async (url, options) => {
  assert.equal(url, `/api/v1/fdr-registration?device_id=${encodeURIComponent(deviceId)}`)
  assert.equal(options.credentials,"same-origin"); assert.equal(options.cache,"no-store")
  assert.equal(options.method,undefined,"identity lookup must remain GET")
  return Response.json(registration(deviceId))
}
assert.deepEqual(await resolveRadioIdentity(deviceId),assignedWing)
globalThis.fetch = async () => Response.json(registration("ECU-FFFFFFFFFFFF"))
await assert.rejects(resolveRadioIdentity(deviceId),/does not match/)
globalThis.fetch = async () => Response.json({registered:false})
const unknown = await resolveRadioIdentity(deviceId)
assert.equal(unknown.aircraftLabel,null)
assert.equal(unknown.registered,false)
assert.equal(unknown.assemblyId,null,"a recorder Hangar does not know has no assembly")
assert.equal(unknown.canAcquire,true,"and can still be recorded: its ECU identity is enough")
globalThis.fetch = async () => new Response("", {status: 503})
await assert.rejects(resolveRadioIdentity(deviceId),/unavailable/)
globalThis.fetch = originalFetch
console.log("Signal installed-aircraft identity and exact ECU matching tests passed")

import assert from "node:assert/strict"

import {
  fdrApiErrorMessage,
  parseFdrAuthenticationProof,
  parseFdrWifiProvisioningBundle
} from "../../app/javascript/lib/fdr_wifi_provisioning.js"

const heartbeatUrl = "https://sillage.exopter.com/api/v1/fdr-sillage-heartbeat"
const bundle = parseFdrWifiProvisioningBundle({
  version: 1,
  assembly_id: "ASY-001",
  profiles: [{
    position: 0,
    ssid: "EXOPTER-LAB",
    security: 6,
    enabled: true,
    password: "hangar-secret"
  }],
  sillage: { heartbeat_url: heartbeatUrl }
})

assert.equal(bundle.sillage.heartbeat_url, heartbeatUrl)
assert.equal(bundle.profiles[0].ssid, "EXOPTER-LAB")
assert.throws(
  () => parseFdrWifiProvisioningBundle({
    version: 1,
    assembly_id: "ASY-001",
    profiles: [],
    sillage: { heartbeatUrl }
  }),
  { message: "Sillage returned an invalid Wi-Fi provisioning bundle: sillage.heartbeat_url must be a string." }
)
assert.throws(
  () => parseFdrWifiProvisioningBundle({
    version: 1,
    assembly_id: "ASY-001",
    profiles: [{ position: 0, ssid: "EXOPTER-LAB", security: 6, enabled: true }],
    sillage: { heartbeat_url: heartbeatUrl }
  }),
  { message: "Sillage returned an invalid Wi-Fi provisioning bundle: profiles[0].password must be a string." }
)

const proof = "ab".repeat(32)
assert.equal(parseFdrAuthenticationProof({ proof }), proof)
assert.throws(
  () => parseFdrAuthenticationProof({ proof: "not-a-proof" }),
  { message: "Sillage returned an invalid recorder authentication proof." }
)
assert.equal(fdrApiErrorMessage({ error: "Recorder mismatch" }), "Recorder mismatch")
assert.equal(fdrApiErrorMessage({ error: 409 }), null)

console.log("FDR Wi-Fi provisioning contract tests passed")

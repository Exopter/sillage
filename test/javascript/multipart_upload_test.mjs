import assert from "node:assert/strict"
import { uploadInParts, retryable } from "../../app/javascript/lib/multipart_upload.js"

const file = new File([new Uint8Array(25)], "jump.mp4", { type: "video/mp4", lastModified: 1 })
const calls = []
let dropped = false
let denied = false
let signatures = 0
const transport = async ({ method, url, body, csrfToken, onProgress }) => {
  calls.push(`${method} ${url}`)
  if (url === "/v") return { status: 201, json: { id: "abc", part_size: 10, received: [1] } }
  if (url === "/v/abc/sign") {
    signatures += 1
    return { status: 200, json: { urls: Object.fromEntries(body.get("parts").split(",").map((part) => [part, `https://s3/${part}?v=${signatures}`])) } }
  }
  if (url.startsWith("https://s3/")) {
    assert.equal(csrfToken, undefined, "the CSRF token never reaches storage")
    if (url.startsWith("https://s3/2") && !dropped) { dropped = true; return { status: 0, json: {} } }
    if (url.startsWith("https://s3/3") && !denied) { denied = true; return { status: 403, json: {} } }
    onProgress?.(body.size)
    return { status: 200, json: {} }
  }
  return { status: 200, json: { redirect_url: "/flights/1" } }
}
const percents = []
let retries = 0
const result = await uploadInParts({ file, url: "/v", csrfToken: "t", transport, wait: async () => {},
  onProgress: (percent) => percents.push(percent), onRetry: (retrying) => { if (retrying) retries += 1 } })

assert.equal(result.redirect_url, "/flights/1")
assert.equal(calls.some((call) => call.startsWith("PUT https://s3/1?")), false, "a received part is not sent again")
assert.equal(calls.filter((call) => call.startsWith("PUT https://s3/2?")).length, 2, "a dropped part is retried")
assert.ok(signatures >= 2, "an expired signature is renewed")
assert.equal(retries, 2)
assert.equal(calls.at(-1), "POST /v/abc/complete")
assert.ok(Math.max(...percents) <= 99)
assert.equal(retryable(413), false)
assert.equal(retryable(502), true)

// Parallel workers share signing requests instead of each asking for the same URLs.
const large = new File([new Uint8Array(160)], "large.mp4", { type: "video/mp4", lastModified: 1 })
let signRequests = 0
let active = 0
let peak = 0
await uploadInParts({ file: large, url: "/v", csrfToken: "t", wait: async () => {}, transport: async ({ url, body }) => {
  if (url === "/v") return { status: 201, json: { id: "abc", part_size: 10, received: [] } }
  if (url === "/v/abc/sign") {
    signRequests += 1
    await new Promise((resolve) => setTimeout(resolve, 1))
    return { status: 200, json: { urls: Object.fromEntries(body.get("parts").split(",").map((part) => [part, `https://s3/${part}`])) } }
  }
  if (url.startsWith("https://s3/")) {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
  }
  return { status: 200, json: {} }
} })
assert.equal(peak, 16)
assert.equal(signRequests, 1)

await assert.rejects(uploadInParts({ file, url: "/v", csrfToken: "t", wait: async () => {},
  transport: async () => ({ status: 422, json: { error: "Choose a video file." } }) }), /Choose a video file/)

import assert from "node:assert/strict"
import { uploadInChunks, retryable } from "../../app/javascript/lib/chunked_upload.js"

const file = new File([new Uint8Array(25)], "jump.mp4", { type: "video/mp4", lastModified: 1 })
const calls = []
let dropped = false
const transport = async ({ method, url, body, onProgress }) => {
  calls.push(`${method} ${url}`)
  if (url === "/v") return { status: 201, json: { id: "abc", chunk_size: 10, received: [0] } }
  if (url.endsWith("/chunks/1") && !dropped) { dropped = true; return { status: 0, json: {} } }
  if (url.includes("/chunks/")) { onProgress?.(body.size); return { status: 204, json: {} } }
  return { status: 200, json: { redirect_url: "/flights/1" } }
}
const percents = []
let retries = 0
const result = await uploadInChunks({ file, url: "/v", csrfToken: "t", transport, wait: async () => {},
  onProgress: (percent) => percents.push(percent), onRetry: (retrying) => { if (retrying) retries += 1 } })

assert.equal(result.redirect_url, "/flights/1")
assert.equal(calls.some((call) => call.endsWith("/chunks/0")), false, "a received chunk is not sent again")
assert.equal(calls.filter((call) => call.endsWith("/chunks/1")).length, 2, "a dropped chunk is retried")
assert.equal(retries, 1)
assert.equal(calls.at(-1), "POST /v/abc/complete")
assert.ok(Math.max(...percents) <= 99)
assert.equal(retryable(413), false)
assert.equal(retryable(502), true)

await assert.rejects(uploadInChunks({ file, url: "/v", csrfToken: "t", wait: async () => {},
  transport: async () => ({ status: 422, json: { error: "Choose a video file." } }) }), /Choose a video file/)

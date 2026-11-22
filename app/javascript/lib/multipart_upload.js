const CONCURRENCY = 4
const SIGNED_BATCH = 8
const MAX_ATTEMPTS = 8
const STALL_MS = 30000

export class UploadError extends Error {}

/** @param {number} attempt */
export function retryDelay(attempt) {
  return Math.min(1000 * 2 ** attempt, 15000)
}

/** @param {number} status */
export function retryable(status) {
  return status === 0 || status === 403 || status === 408 || status === 425 || status === 429 || status >= 500
}

/**
 * Sends a request and aborts it when no byte moves for too long, so a silent network drop becomes a retry.
 * @param {{method:string,url:string,csrfToken?:string,body?:Blob|URLSearchParams,onProgress?:(loaded:number)=>void}} options
 * @returns {Promise<{status:number,json:any}>}
 */
function xhrTransport({ method, url, csrfToken, body, onProgress }) {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest()
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer
    const watch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => request.abort(), STALL_MS)
    }
    const settle = () => {
      clearTimeout(timer)
      let json = {}
      try { json = JSON.parse(request.responseText) || {} } catch { json = {} }
      resolve({ status: request.status, json })
    }
    request.open(method, url)
    // Storage requests carry only their signed URL.
    if (csrfToken) {
      request.setRequestHeader("Accept", "application/json")
      request.setRequestHeader("X-CSRF-Token", csrfToken)
      request.setRequestHeader("X-Requested-With", "XMLHttpRequest")
    }
    request.upload.addEventListener("progress", (event) => { watch(); onProgress?.(event.loaded) })
    request.addEventListener("load", settle)
    request.addEventListener("error", settle)
    request.addEventListener("abort", () => { clearTimeout(timer); resolve({ status: 0, json: {} }) })
    watch()
    request.send(body)
  })
}

/**
 * Uploads a file straight to storage through URLs signed by the application.
 * @param {{file:File,url:string,csrfToken:string,params?:Record<string,string>,onProgress?:(percent:number)=>void,onRetry?:(retrying:boolean)=>void,transport?:typeof xhrTransport,wait?:(ms:number)=>Promise<void>}} options
 */
export async function uploadInParts({ file, url, csrfToken, params = {}, onProgress, onRetry, transport = xhrTransport, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  /** @param {() => Parameters<typeof xhrTransport>[0] | Promise<Parameters<typeof xhrTransport>[0]>} build @param {() => void} [onDenied] */
  const withRetries = async (build, onDenied) => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await transport(await build())
      if (response.status >= 200 && response.status < 300) {
        onRetry?.(false)
        return response
      }
      if (!retryable(response.status) || attempt + 1 >= MAX_ATTEMPTS) throw new UploadError(response.json.error || "")
      if (response.status === 403) onDenied?.()
      onRetry?.(true)
      await wait(retryDelay(attempt))
    }
  }
  /** @param {string} method @param {string} target @param {URLSearchParams} [body] */
  const app = (method, target, body) => withRetries(() => ({ method, url: target, csrfToken, body }))

  const started = await app("POST", url, new URLSearchParams({
    filename: file.name, content_type: file.type, byte_size: String(file.size), last_modified: String(file.lastModified)
  }))
  const { id, part_size: partSize, received } = started.json
  const uploadUrl = `${url}/${id}`
  const partCount = Math.ceil(file.size / partSize)
  const done = new Set(received)
  const inFlight = new Map()
  const report = () => {
    const finished = [...done].reduce((sum, number) => sum + Math.min(partSize, file.size - (number - 1) * partSize), 0)
    const moving = [...inFlight.values()].reduce((sum, loaded) => sum + loaded, 0)
    // The last percent is kept for finishing the upload on the server.
    onProgress?.(Math.min(99, Math.floor(((finished + moving) / file.size) * 100)))
  }
  const pending = Array.from({ length: partCount }, (_, index) => index + 1).filter((number) => !done.has(number))
  /** @type {Map<number,string>} */
  const signed = new Map()
  report()

  /** @param {number} number */
  const signedUrl = async (number) => {
    if (!signed.has(number)) {
      const parts = [number, ...pending.filter((other) => !signed.has(other)).slice(0, SIGNED_BATCH - 1)].join(",")
      const response = await app("POST", `${uploadUrl}/sign`, new URLSearchParams({ parts }))
      Object.entries(response.json.urls).forEach(([part, value]) => signed.set(Number(part), String(value)))
    }
    return /** @type {string} */ (signed.get(number))
  }

  const worker = async () => {
    while (pending.length > 0) {
      const number = /** @type {number} */ (pending.shift())
      await withRetries(async () => {
        inFlight.delete(number)
        return {
          method: "PUT", url: await signedUrl(number), body: file.slice((number - 1) * partSize, number * partSize),
          onProgress: (loaded) => { inFlight.set(number, loaded); report() }
        }
      }, () => signed.delete(number))
      inFlight.delete(number)
      signed.delete(number)
      done.add(number)
      report()
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(pending.length, 1)) }, worker))

  const finished = await app("POST", `${uploadUrl}/complete`, new URLSearchParams(params))
  return finished.json
}

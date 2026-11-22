const CONCURRENCY = 2
const MAX_ATTEMPTS = 8
const STALL_MS = 30000
const FINISH_MS = 110000

export class UploadError extends Error {}

/** @param {number} attempt */
export function retryDelay(attempt) {
  return Math.min(1000 * 2 ** attempt, 15000)
}

/** @param {number} status */
export function retryable(status) {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500
}

/**
 * Sends a request and aborts it when no byte moves for too long, so a silent network drop becomes a retry.
 * @param {{method:string,url:string,csrfToken:string,body?:Blob|URLSearchParams,timeout?:number,onProgress?:(loaded:number)=>void}} options
 * @returns {Promise<{status:number,json:any}>}
 */
function xhrTransport({ method, url, csrfToken, body, timeout = STALL_MS, onProgress }) {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest()
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer
    const watch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => request.abort(), timeout)
    }
    const settle = () => {
      clearTimeout(timer)
      let json = {}
      try { json = JSON.parse(request.responseText) || {} } catch { json = {} }
      resolve({ status: request.status, json })
    }
    request.open(method, url)
    request.setRequestHeader("Accept", "application/json")
    request.setRequestHeader("X-CSRF-Token", csrfToken)
    request.setRequestHeader("X-Requested-With", "XMLHttpRequest")
    if (body instanceof Blob) request.setRequestHeader("Content-Type", "application/octet-stream")
    request.upload.addEventListener("progress", (event) => { watch(); onProgress?.(event.loaded) })
    request.addEventListener("load", settle)
    request.addEventListener("error", settle)
    request.addEventListener("abort", () => { clearTimeout(timer); resolve({ status: 0, json: {} }) })
    watch()
    request.send(body)
  })
}

/**
 * Uploads a file in resumable chunks and resolves with the server's final response.
 * @param {{file:File,url:string,csrfToken:string,params?:Record<string,string>,onProgress?:(percent:number)=>void,onRetry?:(retrying:boolean)=>void,transport?:typeof xhrTransport,wait?:(ms:number)=>Promise<void>}} options
 */
export async function uploadInChunks({ file, url, csrfToken, params = {}, onProgress, onRetry, transport = xhrTransport, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  /** @param {Omit<Parameters<typeof xhrTransport>[0], "csrfToken">} request */
  const withRetries = async (request) => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await transport({ ...request, csrfToken })
      if (response.status >= 200 && response.status < 300) {
        onRetry?.(false)
        return response
      }
      if (!retryable(response.status) || attempt + 1 >= MAX_ATTEMPTS) throw new UploadError(response.json.error || "")
      onRetry?.(true)
      await wait(retryDelay(attempt))
    }
  }

  const started = await withRetries({ method: "POST", url, body: new URLSearchParams({
    filename: file.name, content_type: file.type, byte_size: String(file.size), last_modified: String(file.lastModified)
  }) })
  const { id, chunk_size: chunkSize, received } = started.json
  const uploadUrl = `${url}/${id}`
  const chunkCount = Math.ceil(file.size / chunkSize)
  const done = new Set(received)
  const inFlight = new Map()
  const report = () => {
    const finished = [...done].reduce((sum, index) => sum + Math.min(chunkSize, file.size - index * chunkSize), 0)
    const moving = [...inFlight.values()].reduce((sum, loaded) => sum + loaded, 0)
    // The last percent is kept for assembling the file on the server.
    onProgress?.(Math.min(99, Math.floor(((finished + moving) / file.size) * 100)))
  }
  const pending = Array.from({ length: chunkCount }, (_, index) => index).filter((index) => !done.has(index))
  report()

  const worker = async () => {
    while (pending.length > 0) {
      const index = /** @type {number} */ (pending.shift())
      await withRetries({
        method: "PUT", url: `${uploadUrl}/chunks/${index}`, body: file.slice(index * chunkSize, (index + 1) * chunkSize),
        onProgress: (loaded) => { inFlight.set(index, loaded); report() }
      })
      inFlight.delete(index)
      done.add(index)
      report()
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(pending.length, 1)) }, worker))

  const finished = await withRetries({ method: "POST", url: `${uploadUrl}/complete`, body: new URLSearchParams(params), timeout: FINISH_MS })
  return finished.json
}

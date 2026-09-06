/** @type {Promise<typeof import("cesium")> | null} */
let cesiumPromise = null

/** @template T @param {Promise<T>} promise @param {string} label @param {number} [timeoutMs] @returns {Promise<T>} */
export function withTimeout(promise, label, timeoutMs = 15000) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs) })
  return /** @type {Promise<T>} */ (Promise.race([promise, timeout])).finally(() => clearTimeout(timer))
}

/**
 * @param {string} baseUrl
 * @param {{document?: Document, global?: {Cesium?: typeof import("cesium"), CESIUM_BASE_URL?: string}, timeoutMs?: number}} [options]
 * @returns {Promise<typeof import("cesium")>}
 */
export function loadCesiumLibrary(baseUrl, { document: doc = globalThis.document, global = globalThis.window, timeoutMs = 15000 } = {}) {
  if (global.Cesium) return Promise.resolve(global.Cesium)
  if (cesiumPromise) return cesiumPromise

  // An element left by an older failed visit has already emitted its error.
  doc.querySelector("script[data-sillage-cesium]")?.remove()
  cesiumPromise = new Promise((/** @type {(value: typeof import("cesium")) => void} */ resolve, reject) => {
    const script = doc.createElement("script")
    let settled = false
    const finish = (/** @type {Error | null} */ error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      script.removeEventListener("load", loaded)
      script.removeEventListener("error", failed)
      if (error) { script.remove(); reject(error) }
      else if (global.Cesium) resolve(global.Cesium)
    }
    const loaded = () => finish(global.Cesium ? null : new Error("Cesium loaded without its API"))
    const failed = () => finish(new Error("Cesium could not be loaded"))
    const timer = setTimeout(() => finish(new Error("Cesium load timed out")), timeoutMs)
    global.CESIUM_BASE_URL = baseUrl
    script.src = `${baseUrl}Cesium.js`
    script.async = true
    script.dataset.sillageCesium = "true"
    script.addEventListener("load", loaded)
    script.addEventListener("error", failed)
    try { doc.head.appendChild(script) }
    catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
  }).catch((error) => {
    cesiumPromise = null
    throw error
  })
  return cesiumPromise
}

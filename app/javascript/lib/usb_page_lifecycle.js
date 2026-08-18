const pageReleaseCallbacks = new Set()
/** @type {Promise<void> | null} */
let pageReleasePromise = null

/**
 * Register a Web Serial cleanup that must finish before Turbo renders another page.
 *
 * @param {() => Promise<void>} release
 * @returns {() => void}
 */
export function registerUsbPageRelease(release) {
  if (pageReleaseCallbacks.size === 0) {
    document.addEventListener("turbo:before-render", handleBeforeRender)
  }

  pageReleaseCallbacks.add(release)

  return () => {
    pageReleaseCallbacks.delete(release)
    if (pageReleaseCallbacks.size === 0) {
      document.removeEventListener("turbo:before-render", handleBeforeRender)
    }
  }
}

/** @param {Event} event */
function handleBeforeRender(event) {
  if (pageReleaseCallbacks.size === 0) return

  const turboEvent = /** @type {CustomEvent<{ resume: () => void }>} */ (event)
  event.preventDefault()
  void releasePageConnections().finally(() => turboEvent.detail.resume())
}

async function releasePageConnections() {
  if (pageReleasePromise) return pageReleasePromise

  pageReleasePromise = Promise.allSettled(
    Array.from(pageReleaseCallbacks, (release) => Promise.resolve().then(release))
  ).then(() => undefined)

  try {
    await pageReleasePromise
  } finally {
    pageReleasePromise = null
  }
}

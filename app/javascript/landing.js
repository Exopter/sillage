/** Landing-only enhancement; navigation and imagery remain usable without it. */
/** @type {import("landing_scene").LandingScene | undefined} */
let scene
/** @type {IntersectionObserver | undefined} */
let revealObserver
let generation = 0

async function mount() {
  const element = document.querySelector("[data-flight-scene]")
  if (!(element instanceof HTMLElement) || scene) return
  const current = ++generation
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  if (!reduced) {
    revealObserver?.disconnect()
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof HTMLElement) {
          entry.target.dataset.reveal = "visible"
          revealObserver?.unobserve(entry.target)
        }
      }
    }, { threshold: 0.08 })
    document.querySelectorAll("[data-reveal]").forEach((item) => {
      if (item instanceof HTMLElement && item.getBoundingClientRect().top > innerHeight) {
        item.dataset.reveal = "pending"
        revealObserver?.observe(item)
      }
    })
  }
  try {
    const { LandingScene } = await import("landing_scene")
    if (current !== generation) return
    scene = new LandingScene(element)
    await scene.start()
  } catch {
    element.dataset.sceneState = "static"
  }
}

function unmount() {
  generation++
  scene?.dispose()
  scene = undefined
  revealObserver?.disconnect()
  document.querySelectorAll("[data-reveal]").forEach((element) => {
    if (element instanceof HTMLElement) element.dataset.reveal = "visible"
  })
}

window.addEventListener("pagehide", unmount)
window.addEventListener("pageshow", mount)
document.addEventListener("turbo:before-cache", unmount)
document.addEventListener("turbo:load", mount)
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true })
else mount()

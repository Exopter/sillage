import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/audio_duration_controller.js", import.meta.url), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace(/const TypedController = .*$/m, "const TypedController = class {}")
const { default: AudioDuration } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

function player(duration) {
  const listeners = new Map()
  return { duration, paused: true, currentTime: 0, readyState: 0, seeks: [],
    addEventListener(name, handler) { listeners.set(name, handler) }, removeEventListener(name) { listeners.delete(name) },
    emit(name) { listeners.get(name)?.() }, has(name) { return listeners.has(name) } }
}

// A browser recording reports no length: the player seeks past the end, learns it, and returns to the start.
const recorded = player(Infinity)
const controller = new AudioDuration()
controller.element = recorded
Object.defineProperty(recorded, "currentTime", { get() { return this.position ?? 0 }, set(value) { this.seeks.push(value); this.position = value } })
controller.connect()
recorded.emit("loadedmetadata")
assert.deepEqual(recorded.seeks, [1e101])
recorded.emit("durationchange")
assert.deepEqual(recorded.seeks, [1e101], "still unknown: keep waiting")
recorded.duration = 72.4
recorded.emit("durationchange")
assert.deepEqual(recorded.seeks, [1e101, 0])
assert.equal(recorded.has("durationchange"), false)

// A file with a known length, or one already playing, is left alone.
for (const setup of [audio => { audio.duration = 60 }, audio => { audio.paused = false }]) {
  const audio = player(Infinity)
  setup(audio)
  const untouched = new AudioDuration()
  untouched.element = audio
  untouched.connect()
  audio.emit("loadedmetadata")
  assert.equal(audio.currentTime, 0)
  assert.equal(audio.has("durationchange"), false)
}
console.log("Recorded audio duration recovery passed")

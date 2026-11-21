import assert from "node:assert/strict"
import { MAX_ZOOM, centeredFrame, clampFrame, coverScale, scaleFrame, sourceSquare, zoomFrame } from "../../app/javascript/lib/avatar_crop.js"

const stage = 192
const [width, height] = [3000, 4000]

assert.equal(coverScale(width, height, stage), stage / width, "the shorter side fills the circle")
const centered = centeredFrame(width, height, stage)
assert.deepEqual(sourceSquare(centered, stage), { x: 0, y: 500, size: 3000 }, "a portrait photo starts centred on its middle square")
assert.deepEqual(sourceSquare(centeredFrame(4000, 3000, stage), stage), { x: 500, y: 0, size: 3000 })

const dragged = clampFrame({ ...centered, y: centered.y + 10_000 }, width, height, stage)
assert.equal(sourceSquare(dragged, stage).y, 0, "dragging stops at the photo edge")
assert.equal(sourceSquare(clampFrame({ ...centered, y: -10_000 }, width, height, stage), stage).y, 1000)

const zoomed = zoomFrame(centered, centered.scale * 2, stage / 2, stage / 2, width, height, stage)
assert.deepEqual(sourceSquare(zoomed, stage), { x: 750, y: 1250, size: 1500 }, "zooming keeps the centre in place")
const corner = zoomFrame(centered, centered.scale * 2, 0, 0, width, height, stage)
assert.deepEqual(sourceSquare(corner, stage), { x: 0, y: 500, size: 1500 }, "zooming keeps the point under the pointer in place")

assert.equal(zoomFrame(centered, 1e9, 0, 0, width, height, stage).scale, centered.scale * MAX_ZOOM)
const out = zoomFrame(corner, 0, 0, 0, width, height, stage)
assert.equal(out.scale, centered.scale, "zooming out never uncovers the circle")
assert.ok(out.x <= 0 && out.y <= 0 && out.x + width * out.scale >= stage && out.y + height * out.scale >= stage)
assert.deepEqual(sourceSquare(scaleFrame(zoomed, 1.5), stage * 1.5), sourceSquare(zoomed, stage), "resizing the stage keeps the framing")
console.log("Avatar crop: cover, clamping, pivot zoom and source square passed")

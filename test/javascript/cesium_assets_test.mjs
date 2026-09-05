import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"

const root = new URL("../../", import.meta.url)
const version = JSON.parse(readFileSync(new URL("package.json", root))).dependencies.cesium
const source = new URL("node_modules/cesium/", root)
const destination = new URL(`public/vendor/cesium/${version}/`, root)
assert.equal(JSON.parse(readFileSync(new URL("package.json", source))).version, version)

function verify(path) {
  assert.deepEqual(readFileSync(new URL(path, destination)), readFileSync(new URL(`Build/Cesium/${path}`, source)), `${path} must be served unchanged`)
}
verify("Cesium.js")
for (const directory of ["Workers", "Assets", "Widgets", "ThirdParty"]) {
  const files = readdirSync(new URL(`Build/Cesium/${directory}/`, source), { recursive: true, withFileTypes: true })
  assert.ok(files.length, `${directory} must be present`)
  for (const file of files.filter((entry) => entry.isFile())) {
    const relative = `${file.parentPath}/${file.name}`.split("/Build/Cesium/")[1]
    verify(relative)
  }
}
for (const file of ["LICENSE.md", "ThirdParty.json", "ThirdParty.extra.json"]) {
  assert.deepEqual(readFileSync(new URL(file, destination)), readFileSync(new URL(file, source)))
}
const loader = readFileSync(new URL("app/javascript/lib/viewer_resources.js", root), "utf8")
const view = readFileSync(new URL("app/views/flights/show.html.erb", root), "utf8")
assert.doesNotMatch(loader + view, /https:\/\/[^"\s]*cesium@/)
console.log(`Cesium ${version}: engine, workers, styles, resources and licenses verified`)

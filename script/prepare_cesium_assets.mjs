import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const version = JSON.parse(readFileSync(`${root}/package.json`, "utf8")).dependencies.cesium
const source = `${root}/node_modules/cesium`
const installedVersion = JSON.parse(readFileSync(`${source}/package.json`, "utf8")).version
if (installedVersion !== version) throw new Error("Run npm ci to install the pinned Cesium version")

const destination = `${root}/public/vendor/cesium/${version}`
rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })
for (const file of ["Cesium.js", "Assets", "Workers", "Widgets", "ThirdParty"]) {
  cpSync(`${source}/Build/Cesium/${file}`, `${destination}/${file}`, { recursive: true })
}
for (const file of ["LICENSE.md", "ThirdParty.json", "ThirdParty.extra.json"]) {
  cpSync(`${source}/${file}`, `${destination}/${file}`)
}
console.log(`Prepared Cesium ${version} in public/vendor/cesium/${version}`)

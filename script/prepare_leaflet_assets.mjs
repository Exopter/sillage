import { cpSync, mkdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const version = JSON.parse(readFileSync(`${root}/package.json`, "utf8")).dependencies.leaflet
const source = `${root}/node_modules/leaflet`
if (JSON.parse(readFileSync(`${source}/package.json`, "utf8")).version !== version) throw new Error("Run npm ci for the pinned Leaflet version")
const destination = `${root}/public/vendor/leaflet/${version}`
mkdirSync(destination, { recursive: true })
for (const file of ["leaflet-src.esm.js", "leaflet-src.esm.js.map", "leaflet.css", "images"]) cpSync(`${source}/dist/${file}`, `${destination}/${file}`, { recursive: true })
cpSync(`${source}/LICENSE`, `${destination}/LICENSE`)
console.log(`Prepared Leaflet ${version}`)

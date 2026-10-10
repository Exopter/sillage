import { cpSync, mkdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const version = JSON.parse(readFileSync(`${root}/package.json`, "utf8")).dependencies.three
const source = `${root}/node_modules/three`
if (JSON.parse(readFileSync(`${source}/package.json`, "utf8")).version !== version) {
  throw new Error("Run npm ci to install the pinned Three.js version")
}
const destination = `${root}/public/vendor/three/${version}`
for (const file of ["build/three.module.js", "build/three.core.js", "examples/jsm/loaders/GLTFLoader.js", "examples/jsm/utils/BufferGeometryUtils.js", "examples/jsm/utils/SkeletonUtils.js", "examples/jsm/environments/RoomEnvironment.js", "LICENSE"]) {
  const target = `${destination}/${file}`
  mkdirSync(resolve(target, ".."), { recursive: true })
  cpSync(`${source}/${file}`, target)
}
console.log(`Prepared Three.js ${version} in public/vendor/three/${version}`)

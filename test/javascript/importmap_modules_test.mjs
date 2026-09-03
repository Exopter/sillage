import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const javascriptRoot = path.join(projectRoot, "app/javascript")
const importmap = JSON.parse(execFileSync("bin/importmap", ["json"], {
  cwd: projectRoot,
  encoding: "utf8"
})).imports

const javascriptFiles = await collectJavascriptFiles(javascriptRoot)
for (const file of javascriptFiles) {
  const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" })
  assert.equal(syntax.status, 0, `${path.relative(projectRoot, file)} has invalid syntax:\n${syntax.stderr}`)

  const source = await readFile(file, "utf8")
  for (const specifier of importSpecifiers(source)) {
    assert.ok(
      !specifier.startsWith("."),
      `${path.relative(projectRoot, file)} uses relative browser import ${JSON.stringify(specifier)}; pin it in config/importmap.rb and use its bare name`
    )
    if (!specifier.startsWith("/") && !specifier.match(/^https?:/)) {
      assert.ok(importmap[specifier], `${path.relative(projectRoot, file)} imports unpinned module ${JSON.stringify(specifier)}`)
    }
  }

  for (const target of stimulusDeclarations(source, "targets")) {
    const capitalizedTarget = `${target[0].toUpperCase()}${target.slice(1)}`
    assert.match(
      source,
      new RegExp(`\\b(?:${target}Target|${target}Targets|has${capitalizedTarget}Target)\\b`),
      `${path.relative(projectRoot, file)} declares unused Stimulus target ${JSON.stringify(target)}`
    )
  }

  for (const value of stimulusDeclarations(source, "values")) {
    const capitalizedValue = `${value[0].toUpperCase()}${value.slice(1)}`
    assert.match(
      source,
      new RegExp(`\\b(?:${value}Value|has${capitalizedValue}Value)\\b`),
      `${path.relative(projectRoot, file)} declares unused Stimulus value ${JSON.stringify(value)}`
    )
  }
}

async function collectJavascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const destination = path.join(directory, entry.name)
    return entry.isDirectory() ? collectJavascriptFiles(destination) : destination
  }))
  return files.flat().filter((file) => file.endsWith(".js")).sort()
}

function importSpecifiers(source) {
  return [
    ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s+["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)
  ].map((match) => match[1])
}

function stimulusDeclarations(source, kind) {
  const delimiters = kind === "targets" ? ["\\[", "\\]"] : ["\\{", "\\}"]
  const block = source.match(new RegExp(`static ${kind}\\s*=\\s*${delimiters[0]}([\\s\\S]*?)${delimiters[1]}`))?.[1]
  if (!block) return []

  return kind === "targets"
    ? [...block.matchAll(/["']([^"']+)["']/g)].map((match) => match[1])
    : [...block.matchAll(/(?:^|,)\\s*([A-Za-z_$][\\w$]*)\\s*:/g)].map((match) => match[1])
}

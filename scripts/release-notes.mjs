/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Extract versioned release notes from CHANGELOG.md.
 * Usage:
 *   node scripts/release-notes.mjs --version 1.1.0
 *   node scripts/release-notes.mjs --version Unreleased --out release-notes.md
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let i = 2; i < process.argv.length; i++) {
  const item = process.argv[i]
  if (!item.startsWith('--')) continue
  const [key, inlineValue] = item.slice(2).split('=')
  const value = inlineValue ?? (process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i] ?? 'true')
  args.set(key, value)
}

const version = String(args.get('version') || 'Unreleased')
const changelogPath = path.join(repo, 'CHANGELOG.md')
const text = fs.readFileSync(changelogPath, 'utf8')
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const heading = new RegExp(`^## \\[${escaped}\\](?: - .*?)?$`, 'm')
const match = heading.exec(text)

if (!match) {
  console.error(`Could not find CHANGELOG section for ${version}`)
  process.exit(1)
}

const start = match.index
const next = text.slice(start + match[0].length).search(/^## \[/m)
const section = (next === -1 ? text.slice(start) : text.slice(start, start + match[0].length + next)).trim()
const out = String(args.get('out') || '')

function resolveInsideRepo(value) {
  const resolved = path.resolve(repo, value)
  if (resolved !== repo && !resolved.startsWith(`${repo}${path.sep}`)) {
    console.error(`Refusing to write outside the repository: ${value}`)
    process.exit(1)
  }
  return resolved
}

if (out) {
  const outPath = resolveInsideRepo(out)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${section}\n`, 'utf8')
  console.log(`Wrote ${path.relative(repo, outPath)}`)
} else {
  console.log(section)
}

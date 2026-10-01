/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import fs from 'node:fs'
import path from 'node:path'

function parseDotEnv(text) {
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[match[1]] = value
  }
  return out
}

export function loadLocalEnv(repo) {
  const original = new Set(Object.keys(process.env))
  for (const name of ['.env', '.env.local']) {
    const file = path.join(repo, name)
    if (!fs.existsSync(file)) continue
    const parsed = parseDotEnv(fs.readFileSync(file, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (!original.has(key)) process.env[key] = value
    }
  }
}

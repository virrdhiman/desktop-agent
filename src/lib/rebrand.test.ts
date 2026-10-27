import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { APP_NAME, LEGACY_APP_NAME } from '../../shared/brand'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function sourceFiles(root: string): string[] {
  const result: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...sourceFiles(target))
    else if (/\.(ts|tsx)$/.test(entry.name)) result.push(target)
  }
  return result
}

describe('PIT Agent identity', () => {
  it('uses one shared visible name while keeping package and app identifiers stable', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
    expect(APP_NAME).toBe('PIT Agent')
    expect(LEGACY_APP_NAME).not.toBe(APP_NAME)
    expect(packageJson.productName).toBe(APP_NAME)
    expect(packageJson.build.productName).toBe(APP_NAME)
    expect(packageJson.build.appId).toBe('com.vd.agent')
    expect(packageJson.name).toBe('vd-agent')
  })

  it('has no stale visible legacy name in source or Electron code', () => {
    const allowed = new Set(['electron/userDataPath.ts', 'electron/handlers/settings.ts'])
    const hits: string[] = []
    for (const root of ['src', 'electron']) {
      for (const file of sourceFiles(path.join(repoRoot, root))) {
        const relative = path.relative(repoRoot, file).split(path.sep).join('/')
        fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
          if (!line.includes(LEGACY_APP_NAME)) return
          const internalKeyring = relative === 'electron/handlers/settings.ts' && line.includes('local keyring')
          if (!allowed.has(relative) || (!internalKeyring && relative !== 'electron/userDataPath.ts')) {
            hits.push(`${relative}:${index + 1}`)
          }
        })
      }
    }
    expect(hits).toEqual([])
  })
})

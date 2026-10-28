import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { APP_NAME, LEGACY_APP_NAME } from '../../shared/brand'
import { REPO_URL } from './brand'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function sourceFiles(root: string): string[] {
  const result: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...sourceFiles(target))
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) result.push(target)
  }
  return result
}

describe('PIT Agent identity', () => {
  it('uses one shared visible name while keeping package and app identifiers stable', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
    const extensionPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vscode-extension/package.json'), 'utf8'))
    const userDataSource = fs.readFileSync(path.join(repoRoot, 'electron/userDataPath.ts'), 'utf8')
    expect(APP_NAME).toBe('PIT Agent')
    expect(LEGACY_APP_NAME).not.toBe(APP_NAME)
    expect(packageJson.productName).toBe(APP_NAME)
    expect(packageJson.build.productName).toBe(APP_NAME)
    expect(packageJson.version).toBe('1.2.0')
    expect(packageJson.author.name).toBe('Productive IT')
    expect(REPO_URL).toBe('https://github.com/Productive-iT/pit-agent')
    expect(packageJson.homepage).toBe(REPO_URL)
    expect(packageJson.repository.url).toBe(`${REPO_URL}.git`)
    expect(packageJson.bugs.url).toBe(`${REPO_URL}/issues`)
    expect(packageJson.build.publish).toMatchObject({ provider: 'github', owner: 'Productive-iT', repo: 'pit-agent' })
    expect(packageJson.build.appId).toBe('com.vd.agent')
    expect(packageJson.name).toBe('vd-agent')
    expect(extensionPackage.displayName).toBe(`${APP_NAME} Bridge`)
    expect(userDataSource).toContain("LEGACY_USER_DATA_FOLDER = 'VD Agent'")
    expect(fs.readFileSync(path.join(repoRoot, 'build/installer.nsh'), 'utf8')).toContain('Delete "$DESKTOP\\VD Agent.lnk"')
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

  it('does not expose the old short name in VS Code command labels', () => {
    const extensionPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vscode-extension/package.json'), 'utf8'))
    const visibleCommands = JSON.stringify(extensionPackage.contributes)
    expect(visibleCommands).not.toMatch(/Fix with VD|VD Agent:/)
    expect(visibleCommands).toContain(`${APP_NAME}: Fix selection`)
  })
})

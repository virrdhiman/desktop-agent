import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseUpdateFeed, validateUpdateFeed } from './update-feed-qa.mjs'

function fixtureRoot() {
  // Fixtures remain in temp so this test never removes or overwrites user data.
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vd-agent-update-feed-'))
}

function metadataFor(content, version = '1.1.0') {
  const digest = crypto.createHash('sha512').update(content).digest('base64')
  return `version: ${version}
files:
  - url: VD-Agent-Setup-${version}.exe
    sha512: ${digest}
    size: ${Buffer.byteLength(content)}
path: VD-Agent-Setup-${version}.exe
sha512: ${digest}
releaseDate: '2026-10-11T04:53:50.886Z'
`
}

describe('local update-feed QA', () => {
  it('parses and validates the metadata-only fixture without an installer', async () => {
    const text = metadataFor('metadata-only-fixture', '1.0.1')
    const parsed = parseUpdateFeed(text)
    expect(parsed.version).toBe('1.0.1')
    expect(parsed.files).toHaveLength(1)
    const report = await validateUpdateFeed({ text })
    expect(report.ok).toBe(true)
    expect(report.checks.find((item) => item.label === 'installer verification')?.level).toBe('WARN')
  })

  it('verifies an explicit local artifact without network or installer execution', async () => {
    const root = fixtureRoot()
    const version = '1.1.0'
    const name = `VD-Agent-Setup-${version}.exe`
    const content = Buffer.from('local-fixture-installer-bytes')
    fs.writeFileSync(path.join(root, name), content)
    const report = await validateUpdateFeed({
      text: metadataFor(content, version),
      artifactsDir: root,
      expectedVersion: version,
    })
    expect(report.ok).toBe(true)
    expect(report.failures).toEqual([])
    expect(fs.existsSync(path.join(root, name))).toBe(true)
  })

  it('rejects traversal and digest mismatches', async () => {
    const content = metadataFor('bytes').replace('VD-Agent-Setup-1.1.0.exe', '../outside.exe')
    const report = await validateUpdateFeed({ text: content })
    expect(report.ok).toBe(false)
    expect(report.failures.map((item) => item.label)).toContain('feed file 1 URL')
  })
})

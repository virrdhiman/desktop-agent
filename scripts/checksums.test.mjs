import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyChecksums, writeChecksums } from './checksums-lib.mjs'

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-agent-checksums-'))
  fs.writeFileSync(path.join(root, 'PIT Agent Setup 1.1.0.exe'), 'installer')
  fs.writeFileSync(path.join(root, 'PIT Agent-1.1.0.AppImage'), 'linux')
  return root
}

describe('release checksums', () => {
  it('writes and verifies the versioned downloadable artifacts', async () => {
    const releaseDir = fixture()
    const result = await writeChecksums(releaseDir, '1.1.0')
    expect(result.files).toEqual(['PIT Agent Setup 1.1.0.exe', 'PIT Agent-1.1.0.AppImage'])
    expect(await verifyChecksums(releaseDir)).toEqual({ ok: true, checked: 2, failures: [] })
  })

  it('detects a changed artifact', async () => {
    const releaseDir = fixture()
    await writeChecksums(releaseDir, '1.1.0')
    fs.appendFileSync(path.join(releaseDir, 'PIT Agent Setup 1.1.0.exe'), 'changed')
    const result = await verifyChecksums(releaseDir)
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('PIT Agent Setup 1.1.0.exe')
  })

  it('reports a missing checksum manifest', async () => {
    const result = await verifyChecksums(fixture())
    expect(result).toEqual({ ok: false, checked: 0, failures: ['SHA256SUMS.txt is missing'] })
  })

  it('reports an artifact removed after the manifest was written', async () => {
    const releaseDir = fixture()
    await writeChecksums(releaseDir, '1.1.0')
    fs.unlinkSync(path.join(releaseDir, 'PIT Agent-1.1.0.AppImage'))
    const result = await verifyChecksums(releaseDir)
    expect(result.ok).toBe(false)
    expect(result.failures).toContain('Missing artifact: PIT Agent-1.1.0.AppImage')
  })
})

import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseArguments,
  runPackagePreflight,
} from './package-preflight.mjs'

function fixtureRoot() {
  // Keep fixtures in temp and intentionally do not remove them. This test
  // proves the preflight is read-only and must not need cleanup commands.
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vd-agent-package-preflight-'))
}

function packageFixture(root, sourceName = 'bridge-0.4.6.vsix') {
  const source = path.join(root, 'vscode-extension', sourceName)
  const ocr = path.join(root, 'assets', 'tessdata', 'eng.traineddata')
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.mkdirSync(path.dirname(ocr), { recursive: true })
  fs.writeFileSync(source, 'fixture-vsix')
  fs.writeFileSync(ocr, 'fixture-ocr')
  const ocrHash = crypto.createHash('sha256').update(fs.readFileSync(ocr)).digest('hex')
  fs.writeFileSync(path.join(path.dirname(ocr), 'manifest.json'), JSON.stringify({ sha256: ocrHash, size: fs.statSync(ocr).size }, null, 2))
  fs.writeFileSync(path.join(path.dirname(ocr), 'LICENSE.apache-2.0.txt'), 'Apache License 2.0 fixture')
  return {
    version: '1.1.0',
    build: {
      directories: { output: 'release' },
      extraResources: [
        { from: `vscode-extension/${sourceName}`, to: sourceName },
        { from: 'assets/tessdata/eng.traineddata', to: 'tessdata/eng.traineddata' },
        { from: 'assets/tessdata/manifest.json', to: 'tessdata/manifest.json' },
        { from: 'assets/tessdata/LICENSE.apache-2.0.txt', to: 'tessdata/LICENSE.apache-2.0.txt' },
      ],
    },
  }
}

describe('package preflight', () => {
  it('rejects absolute CLI output and accepts explicit repository-relative output', () => {
    expect(() => parseArguments(['--output', path.resolve('release')])).toThrow('--output')
    expect(parseArguments(['--output', '.work/package-test', '--json'])).toMatchObject({
      output: '.work/package-test',
      json: true,
    })
  })

  it('reports a clean missing output and recommends a unique .work path', async () => {
    const root = fixtureRoot()
    const pkg = packageFixture(root)
    const now = new Date('2026-10-11T12:34:56.000Z')
    const report = await runPackagePreflight({
      root,
      pkg,
      outputPath: 'release',
      now,
      processEvidence: { available: true, packaging: [] },
    })

    expect(report.ok).toBe(true)
    expect(report.recommendation).toContain(path.join('.work', 'package-1.1.0-'))
    expect(report.recommendation).toMatch(/-\d+-[0-9a-f]{8}$/)
    expect(report.checks.map((item) => item.label)).toContain('output lock evidence')
    expect(fs.existsSync(path.join(root, '.work'))).toBe(false)
  })

  it('reports active/stale artifacts and leaves every fixture in place', async () => {
    const root = fixtureRoot()
    const pkg = packageFixture(root)
    const output = path.join(root, 'release')
    fs.mkdirSync(output, { recursive: true })
    const active = path.join(output, 'VD Agent Setup 1.1.0.exe')
    const stale = path.join(output, 'latest.yml')
    fs.writeFileSync(active, 'active-artifact')
    fs.writeFileSync(stale, 'stale-metadata')
    const now = new Date('2026-10-11T12:00:00.000Z')
    fs.utimesSync(active, now, now)
    const old = new Date('2026-10-10T00:00:00.000Z')
    fs.utimesSync(stale, old, old)

    const report = await runPackagePreflight({
      root,
      pkg,
      outputPath: 'release',
      now,
      activeWindowMs: 60_000,
      processEvidence: { available: true, packaging: [] },
    })

    expect(report.ok).toBe(true)
    expect(report.checks.find((item) => item.label === 'active package artifacts')?.detail).toContain('VD Agent Setup 1.1.0.exe')
    expect(report.checks.find((item) => item.label === 'stale package/temp entries')?.detail).toContain('latest.yml')
    expect(fs.existsSync(active)).toBe(true)
    expect(fs.existsSync(stale)).toBe(true)
  })

  it('fails closed when the configured source VSIX is absent', async () => {
    const root = fixtureRoot()
    const pkg = {
      version: '1.1.0',
      build: {
        directories: { output: 'release' },
        extraResources: [
          { from: 'vscode-extension/missing-0.4.6.vsix', to: 'missing-0.4.6.vsix' },
          { from: 'assets/tessdata/missing.traineddata', to: 'tessdata/eng.traineddata' },
        ],
      },
    }
    const report = await runPackagePreflight({
      root,
      pkg,
      outputPath: 'release',
      processEvidence: { available: true, packaging: [] },
    })
    expect(report.ok).toBe(false)
    expect(report.failures.map((item) => item.label)).toContain('source VSIX')
    expect(report.failures.map((item) => item.label)).toContain('source English OCR data')
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateVmChecklist, inspectVmQaInputs, parseArguments } from './vm-qa-harness.mjs'

function fixtureRoot() {
  // This harness test only creates fixtures and never removes them.
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vd-agent-vm-harness-'))
}

describe('explicit-path VM QA harness', () => {
  it('requires platform, artifact directory, and checklist output', () => {
    expect(() => parseArguments(['--platform', 'windows'])).toThrow('--artifacts')
    expect(() => parseArguments(['--platform', 'macos', '--artifacts', 'release', '--output', '.work/a.md'])).toThrow('windows or ubuntu')
  })

  it('inspects Windows artifacts without invoking a VM manager', () => {
    const root = fixtureRoot()
    fs.writeFileSync(path.join(root, 'PIT Agent Setup 1.2.0.exe'), 'installer')
    fs.writeFileSync(path.join(root, 'PIT Agent 1.2.0.exe'), 'portable')
    const evidence = inspectVmQaInputs({ platform: 'windows', artifactRoot: root, version: '1.2.0' })
    expect(evidence.artifacts.every((item) => item.file && item.size > 0)).toBe(true)
    expect(evidence.vsix.path).toContain('vscode-extension')
  })

  it('writes an explicit Ubuntu checklist once and preserves it', () => {
    const root = fixtureRoot()
    fs.writeFileSync(path.join(root, 'PIT Agent-1.2.0.AppImage'), 'appimage')
    fs.writeFileSync(path.join(root, 'vd-agent_1.2.0_amd64.deb'), 'deb')
    const output = path.join(root, 'ubuntu-checklist.md')
    const evidence = inspectVmQaInputs({ platform: 'ubuntu', artifactRoot: root })
    generateVmChecklist({ evidence, output })
    const before = fs.readFileSync(output, 'utf8')
    expect(before).toContain('Ubuntu 22.04 or later')
    expect(() => generateVmChecklist({ evidence, output })).toThrow('Refusing to overwrite')
    expect(fs.readFileSync(output, 'utf8')).toBe(before)
  })
})

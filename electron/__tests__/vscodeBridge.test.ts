// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { formatVsCodeContext, loadVsCodeBridgeState } from '../vscodeBridge'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-vscode-bridge-'))
  fs.mkdirSync(path.join(root, '.vd-agent'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export const app = 1\n')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('vscodeBridge', () => {
  it('loads exported VS Code editor context as workspace-relative state', async () => {
    fs.writeFileSync(path.join(root, '.vd-agent', 'vscode-bridge.json'), JSON.stringify({
      version: 1,
      workspacePath: root,
      updatedAt: 123,
      activeFile: path.join(root, 'src', 'app.ts'),
      activeLanguage: 'typescript',
      selection: { text: 'const app', startLine: 1, startColumn: 8, endLine: 1, endColumn: 11 },
      visibleFiles: [path.join(root, 'src', 'app.ts')],
      openFiles: [path.join(root, 'src', 'app.ts'), path.join(root, '..', 'outside.ts')],
    }))

    const state = await loadVsCodeBridgeState(root)
    expect(state?.activeFile).toBe('src/app.ts')
    expect(state?.visibleFiles).toEqual(['src/app.ts'])
    expect(state?.openFiles).toEqual(['src/app.ts'])

    const formatted = await formatVsCodeContext(root)
    expect(formatted).toContain('Active file: src/app.ts')
    expect(formatted).toContain('Selection 1:8-1:11')
  })

  it('returns setup guidance when no bridge file exists', async () => {
    fs.rmSync(path.join(root, '.vd-agent'), { recursive: true, force: true })
    await expect(formatVsCodeContext(root)).resolves.toContain('No VS Code bridge state found')
  })
})

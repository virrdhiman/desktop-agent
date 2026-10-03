// @vitest-environment node
import { describe, expect, it } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { assessToolPolicy, checkpointTargets, isPathInsideWorkspace, resolvesInsideWorkspace } from '../toolPolicy'

const workspace = path.resolve('C:/work/project')

describe('tool policy', () => {
  it('allows read-only workspace tools without a dialog', () => {
    const decision = assessToolPolicy('read_file', { path: path.join(workspace, 'src/a.ts') }, workspace)
    expect(decision).toMatchObject({ risk: 'read', needsApproval: false, outsideWorkspace: [] })
  })

  it('requires approval for dangerous tools and all writes in strict mode', () => {
    expect(assessToolPolicy('run_command', { command: 'npm install x', cwd: workspace }, workspace).needsApproval).toBe(true)
    expect(assessToolPolicy('write_file', { path: path.join(workspace, 'a.ts') }, workspace, 'ask-all-writes').needsApproval).toBe(true)
  })

  it('classifies VS Code bridge edit and command tools by side effect risk', () => {
    const ws = path.resolve('/tmp/work')
    const edit = assessToolPolicy('vscode_apply_edit', { path: path.join(ws, 'src/app.ts') }, ws)
    expect(edit.risk).toBe('write')
    expect(edit.needsApproval).toBe(false)

    const command = assessToolPolicy('vscode_command', { command: 'workbench.action.reloadWindow' }, ws)
    expect(command.risk).toBe('dangerous')
    expect(command.needsApproval).toBe(true)
  })

  it('detects workspace escapes and checkpoint targets', () => {
    const outside = path.resolve(workspace, '..', 'secret.txt')
    expect(isPathInsideWorkspace(workspace, outside)).toBe(false)
    expect(assessToolPolicy('write_file', { path: outside }, workspace).outsideWorkspace).toEqual([outside])
    expect(checkpointTargets('multi_file_edit', { edits: [{ path: 'a' }, { path: 'b' }] })).toEqual(['a', 'b'])
  })

  it('requires approval for every shell command, including command chains with safe-looking prefixes', () => {
    expect(assessToolPolicy('run_command', { command: 'npm test', cwd: workspace }, workspace).needsApproval).toBe(true)
    expect(assessToolPolicy('run_command', { command: 'npm test && remove-important-files', cwd: workspace }, workspace).needsApproval).toBe(true)
  })

  it('treats archive inspection as read-only and extraction as a workspace write', () => {
    const archive = path.join(workspace, 'orders.zip')
    const output = path.join(workspace, 'orders-extracted')
    expect(assessToolPolicy('archive_list', { archive_path: archive }, workspace).risk).toBe('read')
    expect(assessToolPolicy('archive_extract', { archive_path: archive, output_path: output }, workspace)).toMatchObject({
      risk: 'write', outsideWorkspace: [], needsApproval: false,
    })
    expect(assessToolPolicy('archive_extract', { archive_path: archive, output_path: path.resolve(workspace, '..', 'outside') }, workspace).outsideWorkspace).toHaveLength(1)
  })

  it('resolves the nearest existing parent for new mutation targets', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-policy-'))
    try {
      expect(await resolvesInsideWorkspace(root, path.join(root, 'new', 'file.txt'))).toBe(true)
      expect(await resolvesInsideWorkspace(root, path.join(root, '..', 'outside.txt'))).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

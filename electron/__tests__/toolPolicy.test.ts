// @vitest-environment node
import { describe, expect, it } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { assessRestrictedCommand, assessToolPolicy, checkpointTargets, isPathInsideWorkspace, resolvesInsideWorkspace, toolApprovalDetail } from '../toolPolicy'

const workspace = path.resolve('C:/work/project')

describe('tool policy', () => {
  it('allows read-only workspace tools without a dialog', () => {
    const decision = assessToolPolicy('read_file', { path: path.join(workspace, 'src/a.ts') }, workspace)
    expect(decision).toMatchObject({ risk: 'read', needsApproval: false, outsideWorkspace: [] })
  })

  it('requires approval for dangerous tools and all writes in strict mode', () => {
    expect(assessToolPolicy('run_command', { command: 'npm install x', cwd: workspace }, workspace).needsApproval).toBe(true)
    expect(assessToolPolicy('browser', { operation: 'open_url', url: 'https://example.test' }, workspace).needsApproval).toBe(true)
    expect(assessToolPolicy('write_file', { path: path.join(workspace, 'a.ts') }, workspace, 'ask-all-writes').needsApproval).toBe(true)
  })

  it('uses always, ask-risky, and auto without allowing auto to bypass risky actions', () => {
    const write = { path: path.join(workspace, 'a.ts'), content: 'new' }
    expect(assessToolPolicy('write_file', write, workspace, 'always').needsApproval).toBe(true)
    expect(assessToolPolicy('write_file', write, workspace, 'ask-risky').needsApproval).toBe(false)
    expect(assessToolPolicy('write_file', write, workspace, 'auto').needsApproval).toBe(false)
    expect(assessToolPolicy('run_command', { command: 'npm test', cwd: workspace }, workspace, 'auto').needsApproval).toBe(true)
  })

  it('keeps browser classified as dangerous while trusted mode only affects approval', () => {
    const trusted = assessToolPolicy('browser', { operation: 'read_page_text' }, workspace, 'trusted', false, true)
    expect(trusted.risk).toBe('dangerous')
    expect(trusted.needsApproval).toBe(false)
    expect(trusted.browserToolBlocked).toBe(false)
    expect(toolApprovalDetail('browser', { operation: 'open_url', url: 'https://example.test/page?token=secret' }, trusted))
      .toContain('open_url https://example.test/page')
    expect(toolApprovalDetail('browser', { operation: 'open_url', url: 'https://example.test/page?token=secret' }, trusted))
      .not.toContain('token=secret')
  })

  it.each(['ask-risky', 'ask-all-writes', 'trusted'] as const)('requires explicit browser opt-in even in %s mode', (mode) => {
    expect(assessToolPolicy('browser', {}, workspace, mode).browserToolBlocked).toBe(true)
    expect(assessToolPolicy('browser', {}, workspace, mode, false, false).browserToolBlocked).toBe(true)
    expect(assessToolPolicy('browser', {}, workspace, mode, false, 'true').browserToolBlocked).toBe(true)
    expect(assessToolPolicy('browser', {}, workspace, mode, false, true)).toMatchObject({
      browserToolBlocked: false, needsApproval: mode !== 'trusted', risk: 'dangerous',
    })
    expect(assessToolPolicy('api_request', {}, workspace, mode).browserToolBlocked).toBe(false)
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

  it('blocks traversal for every file-facing tool family', () => {
    const outside = path.resolve(workspace, '..', 'outside.txt')
    const fileTools = ['read_file', 'write_file', 'edit_file', 'create_file', 'delete_file', 'multi_file_edit', 'archive_extract', 'vscode_apply_edit', 'spreadsheet_write', 'pdf_extract_text', 'ocr_image']
    for (const name of fileTools) {
      const args = name === 'multi_file_edit'
        ? { edits: [{ path: outside }] }
        : name === 'archive_extract'
          ? { archive_path: outside, output_path: path.join(workspace, 'out') }
          : { path: outside }
      expect(assessToolPolicy(name, args, workspace).outsideWorkspace).toContain(outside)
    }
  })

  it('includes the full shell command in the approval text', () => {
    const command = `echo ${'x'.repeat(900)}`
    const decision = assessToolPolicy('run_command', { command, cwd: workspace }, workspace)
    expect(toolApprovalDetail('run_command', { command }, decision)).toContain(command)
  })

  it('requires approval for every shell command, including command chains with safe-looking prefixes', () => {
    expect(assessToolPolicy('run_command', { command: 'npm test', cwd: workspace }, workspace).needsApproval).toBe(true)
    expect(assessToolPolicy('run_command', { command: 'npm test && remove-important-files', cwd: workspace }, workspace).needsApproval).toBe(true)
  })

  it('keeps restricted command mode opt-in and blocks shell escape patterns', () => {
    expect(assessToolPolicy('run_command', { command: 'npm test', cwd: workspace }, workspace).restrictedCommandBlocked).toBe(false)
    expect(assessRestrictedCommand('npm test', workspace, workspace).blocked).toBe(false)
    expect(assessRestrictedCommand('npm install left-pad', workspace, workspace).reason).toMatch(/package installation/)
    expect(assessRestrictedCommand('npm test && echo done', workspace, workspace).reason).toMatch(/chaining/)
    expect(assessRestrictedCommand('curl https://example.com', workspace, workspace).reason).toMatch(/network/)
    expect(assessRestrictedCommand('npm test', workspace, path.resolve(workspace, '..')).reason).toMatch(/cwd/)
    expect(assessToolPolicy('run_command', { command: 'npm test', cwd: workspace }, workspace, 'ask-risky', true).restrictedCommandBlocked).toBe(false)
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

  it('requires dangerous approval for optional data reads and spreadsheet writes', () => {
    const sqlite = assessToolPolicy('sqlite_query', { path: path.join(workspace, 'data.db'), query: 'SELECT 1' }, workspace)
    expect(sqlite).toMatchObject({ risk: 'dangerous', needsApproval: true, outsideWorkspace: [] })
    const csv = assessToolPolicy('spreadsheet_write', { path: path.join(workspace, 'out.csv') }, workspace)
    expect(csv).toMatchObject({ risk: 'dangerous', needsApproval: true, outsideWorkspace: [] })
    const outside = assessToolPolicy('pdf_extract_text', { path: path.resolve(workspace, '..', 'private.pdf') }, workspace)
    expect(outside.outsideWorkspace).toHaveLength(1)
  })

  it('redacts Postgres connection secrets in approval details', () => {
    const decision = assessToolPolicy('postgres_query', {}, workspace)
    const detail = toolApprovalDetail('postgres_query', {
      connection_string: 'postgresql://readonly:super-secret@example.test/db?password=other-secret',
      query: 'SELECT 1',
    }, decision)
    expect(detail).not.toContain('super-secret')
    expect(detail).not.toContain('other-secret')
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

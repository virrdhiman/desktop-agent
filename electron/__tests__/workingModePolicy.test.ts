import { describe, expect, it } from 'vitest'
import { assessToolPolicy } from '../../electron/toolPolicy'

describe('tool policy working mode enforcement', () => {
  it('blocks write and dangerous tools in read-only modes', () => {
    expect(assessToolPolicy('write_file', { path: '/workspace/a' }, '/workspace', 'trusted', false, false, 'plan').reason).toMatch(/read-only/)
    expect(assessToolPolicy('read_file', { path: '/workspace/a' }, '/workspace', 'trusted', false, false, 'review').risk).toBe('read')
  })

  it.each(['plan', 'ask', 'review'] as const)('blocks every write-capable tool in %s mode', (mode) => {
    const writeTools = ['write_file', 'edit_file', 'create_file', 'multi_file_edit', 'delete_file', 'archive_extract', 'vscode_apply_edit', 'spreadsheet_write', 'run_command', 'git_commit', 'git_branch', 'git_stash', 'vscode_command']
    for (const name of writeTools) {
      expect(assessToolPolicy(name, { path: '/workspace/a', cwd: '/workspace' }, '/workspace', 'trusted', false, true, mode).reason).toMatch(/read-only/)
    }
  })

  it.each(['build', 'debug', 'multitask'] as const)('allows write-capable tools in %s mode subject to normal approval', (mode) => {
    const decision = assessToolPolicy('write_file', { path: '/workspace/a' }, '/workspace', 'trusted', false, true, mode)
    expect(decision.risk).toBe('write')
    expect(decision.reason).not.toMatch(/read-only/)
  })
})

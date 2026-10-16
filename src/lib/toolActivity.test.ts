import { describe, expect, it } from 'vitest'
import { toolActivityArgs, toolActivityResult } from './toolActivity'

describe('browser activity privacy', () => {
  it('retains only a recognized operation in activity arguments', () => {
    expect(toolActivityArgs('browser', { operation: 'open_url', url: 'https://user:secret@example.test/?token=secret', session: 'private', width: 'private', other: 'secret' }))
      .toEqual({ operation: 'open_url' })
    expect(toolActivityArgs('browser', { operation: 'secret' })).toEqual({ operation: 'invalid' })
  })

  it('omits page bodies, screenshots, and navigation error details from activity results', () => {
    expect(toolActivityResult('browser', 'secret page text', true)).toContain('completed')
    expect(toolActivityResult('browser', 'secret page text', true)).not.toContain('secret')
    expect(toolActivityResult('browser', 'ERR_FAILED https://example.test/private-token', false)).not.toContain('private-token')
  })

  it('preserves existing logs for other tools', () => {
    expect(toolActivityArgs('run_command', { command: 'npm test' })).toEqual({ command: 'npm test' })
    expect(toolActivityResult('run_command', 'Tests passed', true)).toBe('Tests passed')
  })
})

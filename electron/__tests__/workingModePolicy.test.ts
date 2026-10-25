import { describe, expect, it } from 'vitest'
import { assessToolPolicy } from '../../electron/toolPolicy'

describe('tool policy working mode enforcement', () => {
  it('blocks write and dangerous tools in read-only modes', () => {
    expect(assessToolPolicy('write_file', { path: '/workspace/a' }, '/workspace', 'trusted', false, false, 'plan').reason).toMatch(/read-only/)
    expect(assessToolPolicy('read_file', { path: '/workspace/a' }, '/workspace', 'trusted', false, false, 'review').risk).toBe('read')
  })
})

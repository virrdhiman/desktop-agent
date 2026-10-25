import { describe, expect, it } from 'vitest'
import { canRunToolInWorkingMode, isWorkingModeReadOnly } from './workingModePolicy'

describe('working mode policy', () => {
  it('blocks writes in Plan, Ask, and Review', () => {
    for (const mode of ['plan', 'ask', 'review'] as const) {
      expect(isWorkingModeReadOnly(mode)).toBe(true)
      expect(canRunToolInWorkingMode(mode, 'write')).toBe(false)
      expect(canRunToolInWorkingMode(mode, 'dangerous')).toBe(false)
      expect(canRunToolInWorkingMode(mode, 'read')).toBe(true)
    }
  })
  it('allows writes in Build and Debug', () => {
    expect(canRunToolInWorkingMode('build', 'write')).toBe(true)
    expect(canRunToolInWorkingMode('debug', 'dangerous')).toBe(true)
  })
})

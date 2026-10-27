import { describe, expect, it } from 'vitest'
import { initialSharedStateReady, shouldAcceptSharedStateUpdate } from './sharedStateSync'

describe('shared window state hydration', () => {
  it('waits for the main window snapshot before an IDE publishes', () => {
    expect(initialSharedStateReady(true, null)).toBe(false)
    expect(initialSharedStateReady(true, { version: 1 })).toBe(true)
  })

  it('allows the main window to establish the initial shared state', () => {
    expect(initialSharedStateReady(false, null)).toBe(true)
  })

  it('does not let a stale empty snapshot erase the active workspace', () => {
    expect(shouldAcceptSharedStateUpdate('ide', 'C:/workspace', '')).toBe(false)
    expect(shouldAcceptSharedStateUpdate('ide', '', '')).toBe(false)
    expect(shouldAcceptSharedStateUpdate('ide', 'C:/workspace', 'C:/other')).toBe(true)
    expect(shouldAcceptSharedStateUpdate('main', 'C:/workspace', '')).toBe(false)
    expect(shouldAcceptSharedStateUpdate('main', '', '')).toBe(true)
    expect(shouldAcceptSharedStateUpdate('main', '', 'C:/workspace')).toBe(true)
  })
})

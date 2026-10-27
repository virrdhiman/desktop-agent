import { describe, expect, it } from 'vitest'
import { initialSharedStateReady } from './sharedStateSync'

describe('shared window state hydration', () => {
  it('waits for the main window snapshot before an IDE publishes', () => {
    expect(initialSharedStateReady(true, null)).toBe(false)
    expect(initialSharedStateReady(true, { version: 1 })).toBe(true)
  })

  it('allows the main window to establish the initial shared state', () => {
    expect(initialSharedStateReady(false, null)).toBe(true)
  })
})

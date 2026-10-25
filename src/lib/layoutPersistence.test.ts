import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT_PREFERENCES, mergeLayoutPreferences, normalizeLayoutPreferences } from './layoutPersistence'

describe('layout persistence', () => {
  it('normalizes invalid persisted dimensions and modes', () => {
    expect(normalizeLayoutPreferences({ sidebarWidth: 2, historyWidth: 9999, workingMode: 'invalid' })).toMatchObject({ sidebarWidth: 180, historyWidth: 460, workingMode: 'build' })
  })
  it('merges a compatible layout patch', () => {
    expect(mergeLayoutPreferences(DEFAULT_LAYOUT_PREFERENCES, { sidebarCollapsed: true }).sidebarCollapsed).toBe(true)
  })
})

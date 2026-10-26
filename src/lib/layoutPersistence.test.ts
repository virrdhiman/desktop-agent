import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT_PREFERENCES, isTerminalPanelShortcut, mergeLayoutPreferences, normalizeLayoutPreferences } from './layoutPersistence'

describe('layout persistence', () => {
  it('normalizes invalid persisted dimensions and modes', () => {
    expect(normalizeLayoutPreferences({ sidebarWidth: 2, historyWidth: 9999, workingMode: 'invalid' })).toMatchObject({ sidebarWidth: 180, historyWidth: 460, workingMode: 'build' })
  })
  it('merges a compatible layout patch', () => {
    expect(mergeLayoutPreferences(DEFAULT_LAYOUT_PREFERENCES, { sidebarCollapsed: true, rightPanelTab: 'files', rightPanelWidth: 900 }).rightPanelTab).toBe('files')
    expect(mergeLayoutPreferences(DEFAULT_LAYOUT_PREFERENCES, { rightPanelWidth: 900 }).rightPanelWidth).toBe(560)
  })
  it('keeps the history pane collapsed by default and recognizes the terminal shortcut', () => {
    expect(DEFAULT_LAYOUT_PREFERENCES.historyCollapsed).toBe(true)
    expect(isTerminalPanelShortcut({ key: '`', ctrlKey: true })).toBe(true)
    expect(isTerminalPanelShortcut({ key: '`', ctrlKey: false, metaKey: false })).toBe(false)
  })

  it('migrates old settings without a layout and clamps corrupt pane values', () => {
    const migrated = normalizeLayoutPreferences(undefined)
    expect(migrated).toEqual(DEFAULT_LAYOUT_PREFERENCES)
    const corrupt = normalizeLayoutPreferences({
      sidebarWidth: Number.POSITIVE_INFINITY,
      historyWidth: -100,
      rightPanelWidth: 'wide',
      terminalHeight: 999999,
      historyCollapsed: false,
    })
    expect(corrupt.sidebarWidth).toBe(260)
    expect(corrupt.historyWidth).toBe(220)
    expect(corrupt.rightPanelWidth).toBe(340)
    expect(corrupt.terminalHeight).toBe(480)
    expect(corrupt.historyCollapsed).toBe(false)
  })
})

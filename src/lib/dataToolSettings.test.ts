import { describe, expect, it } from 'vitest'
import { DATA_TOOL_FLAGS, DATA_TOOL_FLAGS_BY_NAME, dataToolDisabledReason, normalizeDataToolSettings } from './dataToolSettings'

describe('data tool settings', () => {
  it('keeps every optional tool disabled unless the stored value is exactly true', () => {
    const defaults = normalizeDataToolSettings()
    expect(DATA_TOOL_FLAGS.every((flag) => defaults[flag] === false)).toBe(true)
    expect(normalizeDataToolSettings({ sqliteToolEnabled: 1, pdfToolEnabled: true }).sqliteToolEnabled).toBe(false)
    expect(normalizeDataToolSettings({ pdfToolEnabled: true }).pdfToolEnabled).toBe(true)
  })

  it('maps tools to independent opt-ins and a separate spreadsheet write opt-in', () => {
    expect(DATA_TOOL_FLAGS_BY_NAME.sqlite_query).toBe('sqliteToolEnabled')
    expect(DATA_TOOL_FLAGS_BY_NAME.spreadsheet_write).toBe('spreadsheetToolEnabled')
    expect(dataToolDisabledReason('sqlite_query', {})).toMatch(/disabled/i)
    expect(dataToolDisabledReason('spreadsheet_write', { spreadsheetToolEnabled: true })).toMatch(/writes are disabled/i)
    expect(dataToolDisabledReason('spreadsheet_write', { spreadsheetToolEnabled: true, dataWriteEnabled: true })).toBeUndefined()
  })
})

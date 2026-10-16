import { describe, expect, it } from 'vitest'
import { normalizeAdvancedSettings } from './advancedSettings'

describe('advanced feature opt-ins', () => {
  it('defaults missing and malformed values off, with stable updates', () => {
    expect(normalizeAdvancedSettings()).toEqual({ autocompleteEnabled: false, indexingEnabled: false, telemetryEnabled: false, updateChannel: 'stable' })
    expect(normalizeAdvancedSettings({ autocompleteEnabled: 'true', indexingEnabled: 1, telemetryEnabled: null, updateChannel: 'unknown' }))
      .toEqual(normalizeAdvancedSettings())
  })

  it('preserves explicit opt-ins and beta channel', () => {
    expect(normalizeAdvancedSettings({ autocompleteEnabled: true, indexingEnabled: true, telemetryEnabled: true, updateChannel: 'beta' }))
      .toEqual({ autocompleteEnabled: true, indexingEnabled: true, telemetryEnabled: true, updateChannel: 'beta' })
  })
})

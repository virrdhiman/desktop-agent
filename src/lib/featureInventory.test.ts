import { describe, expect, it } from 'vitest'
import { CURRENT_FEATURE_IDS, REQUIRED_LAYOUT_FEATURES, hasAllRequiredFeatures } from './featureInventory'

describe('feature inventory', () => {
  it('keeps every existing panel and required destination represented', () => {
    expect(CURRENT_FEATURE_IDS).toEqual(expect.arrayContaining(['chat', 'files', 'git', 'branches', 'tasks', 'sessions', 'vscode', 'terminal', 'settings', 'help']))
    expect(hasAllRequiredFeatures(REQUIRED_LAYOUT_FEATURES)).toBe(true)
  })
})

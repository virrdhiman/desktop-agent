import { describe, expect, it } from 'vitest'
import {
  COMPOSER_ADD_ITEMS,
  contextHint,
  filterComposerItems,
  getComposerMenuItems,
  isAllowedContextPath,
  isProtectedContextPath,
} from './composerAddMenu'

describe('composer add menu registry', () => {
  it('keeps add items and exposes only capabilities that exist', () => {
    const items = getComposerMenuItems(['pdf_extract_text', 'web_search'])
    expect(items.filter((item) => item.section === 'add')).toHaveLength(COMPOSER_ADD_ITEMS.length)
    expect(items.map((item) => item.id)).toEqual(expect.arrayContaining(['pdf', 'web']))
    expect(items.map((item) => item.id)).not.toContain('spreadsheets')
  })

  it('filters by label, description, id, or hint', () => {
    const items = getComposerMenuItems(['spreadsheet_read'])
    expect(filterComposerItems(items, 'sheet').map((item) => item.id)).toEqual(['spreadsheets'])
    expect(filterComposerItems(items, 'goal')).toHaveLength(1)
    expect(filterComposerItems(items, '   ')).toHaveLength(items.length)
  })
})

describe('composer context paths', () => {
  it('allows only paths below the open workspace', () => {
    expect(isAllowedContextPath('C:\\work\\src\\app.ts', 'C:\\work')).toBe(true)
    expect(isAllowedContextPath('C:\\other\\app.ts', 'C:\\work')).toBe(false)
  })

  it('rejects protected locations and secret-looking files', () => {
    for (const value of ['D:\\PIT\\private.txt', 'C:\\work\\.env.local', 'C:\\work\\api-key.txt', 'C:\\work\\cert.pem']) {
      expect(isProtectedContextPath(value)).toBe(true)
      expect(isAllowedContextPath(value, 'C:\\work')).toBe(false)
    }
  })

  it('formats unique context hints', () => {
    expect(contextHint(['C:\\work\\a.ts', 'C:\\work\\a.ts', ''])).toBe('Attached context:\n- C:\\work\\a.ts')
  })
})

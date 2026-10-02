import { describe, expect, it } from 'vitest'
import { buildPreview, summarizeInlineEdit } from './inlineEdits'

describe('inlineEdits', () => {
  it('summarizes changed, added, and removed lines', () => {
    expect(summarizeInlineEdit('a\nb\nc', 'a\nB\nc\nd')).toEqual({
      changedLines: 2,
      addedLines: 1,
      removedLines: 0,
      firstChangedLine: 2,
    })
  })

  it('builds a compact preview around the first edit', () => {
    const preview = buildPreview('one\ntwo\nthree', 'one\nTWO\nthree')
    expect(preview).toContain('- 2: two')
    expect(preview).toContain('+ 2: TWO')
  })
})

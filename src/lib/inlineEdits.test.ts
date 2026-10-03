import { describe, expect, it } from 'vitest'
import { buildInlineEditHunks, buildPreview, rejectInlineEditHunk, summarizeInlineEdit } from './inlineEdits'

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

  it('splits separate changes into reviewable hunks', () => {
    const hunks = buildInlineEditHunks('a\nb\nc\nd', 'a\nB\nc\nD', 0)
    expect(hunks).toHaveLength(2)
    expect(hunks[0]).toMatchObject({
      oldStart: 2,
      newStart: 2,
      beforeLines: ['b'],
      afterLines: ['B'],
    })
    expect(hunks[1]).toMatchObject({
      oldStart: 4,
      newStart: 4,
      beforeLines: ['d'],
      afterLines: ['D'],
    })
  })

  it('rejects one hunk while preserving the rest of the proposed edit', () => {
    const hunks = buildInlineEditHunks('a\nb\nc\nd', 'a\nB\nc\nD', 0)
    expect(rejectInlineEditHunk('a\nB\nc\nD', hunks[0])).toBe('a\nb\nc\nD')
  })

  it('keeps insertions scoped to inserted lines', () => {
    const hunks = buildInlineEditHunks('a\nc', 'a\nb\nc', 0)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({
      oldStart: 2,
      oldEnd: 1,
      newStart: 2,
      newEnd: 2,
      beforeLines: [],
      afterLines: ['b'],
    })
    expect(rejectInlineEditHunk('a\nb\nc', hunks[0])).toBe('a\nc')
  })

  it('keeps deletions scoped to deleted lines', () => {
    const hunks = buildInlineEditHunks('a\nb\nc', 'a\nc', 0)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({
      oldStart: 2,
      oldEnd: 2,
      newStart: 2,
      newEnd: 1,
      beforeLines: ['b'],
      afterLines: [],
    })
    expect(rejectInlineEditHunk('a\nc', hunks[0])).toBe('a\nb\nc')
  })

  it('rejects a later hunk after an earlier rejected hunk shifts line numbers', () => {
    const hunks = buildInlineEditHunks('a\nc\nd', 'a\nb\nc\nD', 0)
    const withoutInsertedLine = rejectInlineEditHunk('a\nb\nc\nD', hunks[0])
    expect(withoutInsertedLine).toBe('a\nc\nD')
    expect(rejectInlineEditHunk(withoutInsertedLine, hunks[1])).toBe('a\nc\nd')
  })
})

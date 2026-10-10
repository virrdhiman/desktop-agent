// @vitest-environment node
import { createRequire } from 'module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { lineDiffHunks, discardHunk, diffStats, compatibleUrl, contentHash } = require('../../vscode-extension/previewDiff.js')

describe('VS Code patch preview diff', () => {
  it('keeps distant edits independent after insertions', () => {
    const before = 'alpha\nbeta\ngamma\ndelta\nepsilon\n'
    const after = 'intro\nalpha\nbeta\ngamma\nDELTA\nepsilon\n'
    expect(lineDiffHunks(before, after)).toHaveLength(2)
    expect(discardHunk(before, after, 0)).toBe('alpha\nbeta\ngamma\nDELTA\nepsilon\n')
    expect(discardHunk(before, after, 1)).toBe('intro\nalpha\nbeta\ngamma\ndelta\nepsilon\n')
    expect(diffStats(before, after)).toEqual({ hunks: 2, additions: 2, deletions: 1 })
  })

  it('preserves CRLF and accurately handles deletions', () => {
    const before = 'one\r\ntwo\r\nthree\r\nfour\r\n'
    const after = 'one\r\nthree\r\nFOUR\r\n'
    expect(lineDiffHunks(before, after)).toHaveLength(2)
    expect(discardHunk(before, after, 0)).toBe('one\r\ntwo\r\nthree\r\nFOUR\r\n')
    expect(discardHunk(before, after, 1)).toBe('one\r\nthree\r\nfour\r\n')
  })

  it('treats a very large changed region as one safe hunk', () => {
    const before = Array.from({ length: 600 }, (_, i) => `old ${i}`).join('\n')
    const after = Array.from({ length: 600 }, (_, i) => `new ${i}`).join('\n')
    expect(lineDiffHunks(before, after)).toHaveLength(1)
    expect(discardHunk(before, after, 0)).toBe(before)
  })

  it('normalizes versioned OpenAI-compatible URLs and detects changed baselines', () => {
    expect(compatibleUrl('https://example.test/v1/', 'models')).toBe('https://example.test/v1/models')
    expect(compatibleUrl('https://example.test', 'chat/completions')).toBe('https://example.test/v1/chat/completions')
    expect(contentHash('original')).not.toBe(contentHash('changed'))
  })
})

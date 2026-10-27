import { describe, expect, it } from 'vitest'
import { ensureMonacoLanguage } from './monacoEditor'
import { completionWords, filterCompletionWords } from './editorCompletions'

describe('offline editor completion support', () => {
  it.each(['typescript', 'javascript', 'json'])('loads the %s Monaco contribution without a network request', async (language) => {
    await expect(ensureMonacoLanguage(language)).resolves.toBeDefined()
  })

  it('returns bounded local completions for TS, JS and JSON-like content', () => {
    const words = completionWords('const workspaceValue = Promise.resolve({ enabled: true })', ['src/workspace.ts', 'package.json'], [])
    expect(filterCompletionWords(words, 'work')).toEqual(expect.arrayContaining(['workspaceValue', 'workspace']))
    expect(filterCompletionWords(words, 'prom')).toContain('Promise')
    expect(filterCompletionWords(words, 'json')).toContain('json')
    expect(filterCompletionWords(words, '').length).toBeLessThanOrEqual(80)
  })
})

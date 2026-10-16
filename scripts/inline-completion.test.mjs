import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { cleanInlineCompletion, isCompletionCurrent } = require('../vscode-extension/inlineCompletionCore.js')

describe('VS Code inline completion guardrails', () => {
  it('rejects a stale or cancelled request', () => {
    expect(isCompletionCurrent(4, 4, false)).toBe(true)
    expect(isCompletionCurrent(4, 5, false)).toBe(false)
    expect(isCompletionCurrent(4, 4, true)).toBe(false)
  })

  it('removes duplicated context and keeps suggestions bounded', () => {
    const result = cleanInlineCompletion('```ts\ncustomerName + "!"\n```', 'const customerName = customerName')
    expect(result).toBe(' + "!"')
    expect(cleanInlineCompletion('x\n'.repeat(20), '') .split('\n')).toHaveLength(8)
    expect(cleanInlineCompletion('a'.repeat(700), '')).toHaveLength(600)
  })
})

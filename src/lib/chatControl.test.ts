import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../types'
import { compactConversation, contextLevel, contextWindowForModel, estimateTokens, summarizeMessages } from './chatControl'

const messages = (count: number): ChatMessage[] => Array.from({ length: count }, (_, index) => ({
  id: `m-${index}`, role: index % 2 ? 'assistant' : 'user', content: `message ${index}`, timestamp: index,
}))

describe('long chat controls', () => {
  it('estimates tokens and applies amber/red thresholds', () => {
    expect(estimateTokens([{ content: '1234' }])).toBe(1)
    expect(contextLevel(70, 100)).toBe('amber')
    expect(contextLevel(85, 100)).toBe('red')
    expect(contextWindowForModel('gpt-4o-mini')).toBe(128000)
    expect(contextWindowForModel('unknown-local-model')).toBeUndefined()
  })

  it('keeps the latest six messages and retains earlier messages for recovery', () => {
    const result = compactConversation(messages(10), 'ship safely', 'Use tests', 6)
    expect(result.recent.map((message) => message.id)).toEqual(['m-4', 'm-5', 'm-6', 'm-7', 'm-8', 'm-9'])
    expect(result.earlier.map((message) => message.id)).toEqual(['m-0', 'm-1', 'm-2', 'm-3'])
    expect(result.summary).toContain('Goal: ship safely')
    expect(result.summary).toContain('Pinned project notes: Use tests')
  })

  it('summaries an empty history without inventing file evidence', () => {
    expect(summarizeMessages([], '', '')).toContain('Files mentioned: none recorded')
  })
})

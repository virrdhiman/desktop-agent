import type { ChatMessage } from '../types'

export type ContextLevel = 'normal' | 'amber' | 'red'

export function estimateTokens(messages: Array<Pick<ChatMessage, 'content'>>): number {
  return Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4)
}

export function contextWindowForModel(model?: string): number | undefined {
  const value = model?.toLowerCase() || ''
  if (!value) return undefined
  if (/gpt-4o|gpt-4\.1|claude-3|claude-4|gemini-2|gemini-1\.5|mistral-large|qwen2\.5|deepseek/.test(value)) return 128_000
  if (/llama-3|mixtral|command-r/.test(value)) return 32_000
  return undefined
}

export function contextLevel(tokens: number, window?: number): ContextLevel {
  if (!window) return 'normal'
  const ratio = tokens / window
  if (ratio >= 0.85) return 'red'
  if (ratio >= 0.70) return 'amber'
  return 'normal'
}

export function summarizeMessages(messages: ChatMessage[], goal = '', projectNotes = ''): string {
  const userMessages = messages.filter((message) => message.role === 'user')
  const assistantMessages = messages.filter((message) => message.role === 'assistant')
  const files = [...new Set(messages.flatMap((message) => (message.fileContext || '').split(/\r?\n/).filter(Boolean)))].slice(0, 20)
  const decisions = assistantMessages.slice(-8).map((message) => message.content.replace(/\s+/g, ' ').trim().slice(0, 240)).filter(Boolean)
  return [
    'Pinned conversation summary',
    goal.trim() ? `Goal: ${goal.trim().slice(0, 500)}` : '',
    projectNotes.trim() ? `Pinned project notes: ${projectNotes.trim().slice(0, 800)}` : '',
    `User requests covered: ${userMessages.length}`,
    files.length ? `Files mentioned: ${files.join(', ')}` : 'Files mentioned: none recorded',
    decisions.length ? `Recent decisions and outcomes:\n${decisions.map((item) => `- ${item}`).join('\n')}` : 'Recent decisions and outcomes: none recorded',
    'Open tasks: continue from the latest messages and verify every file, command, or test claim with a tool result.',
  ].filter(Boolean).join('\n')
}

export function compactConversation(messages: ChatMessage[], goal = '', projectNotes = '', keepRecent = 6): { summary: string; recent: ChatMessage[]; earlier: ChatMessage[] } {
  const recent = messages.slice(-keepRecent)
  return { summary: summarizeMessages(messages.slice(0, -keepRecent), goal, projectNotes), recent, earlier: messages.slice(0, -keepRecent) }
}

/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license MIT
 */
/**
 * Chat history persistence in the store: auto-save, stable session identity, load, delete, restore.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AUTOSAVE_DELAY_MS, useStore } from '../store'
import type { ChatMessage } from '../types'

const api = window.api as unknown as Record<string, ReturnType<typeof vi.fn>>

const user = (id: string, content: string): ChatMessage => ({ id, role: 'user', content, timestamp: Date.now() })
const assistant = (id: string, content: string): ChatMessage => ({ id, role: 'assistant', content, timestamp: Date.now() })

beforeEach(() => {
  vi.useFakeTimers()
  useStore.setState({ messages: [], sessions: [], currentSessionId: null, chatLoading: false })
  api.saveConversation.mockClear()
  api.deleteConversation.mockClear()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('session auto-save', () => {
  it('saves automatically after chat updates, debounced into one write', async () => {
    const s = useStore.getState()
    s.addMessage(user('1', 'Fix the login bug'))
    s.addMessage(assistant('2', 'Looking at auth.ts'))
    expect(api.saveConversation).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)

    expect(api.saveConversation).toHaveBeenCalledTimes(1)
    const saved = api.saveConversation.mock.calls[0][0]
    expect(saved.title).toBe('Fix the login bug')
    expect(saved.messages).toHaveLength(2)
    expect(useStore.getState().sessions).toHaveLength(1)
  })

  it('keeps the same session id across saves instead of creating duplicates', async () => {
    const s = useStore.getState()
    s.addMessage(user('1', 'hello'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)
    s.addMessage(assistant('2', 'hi'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)

    const ids = api.saveConversation.mock.calls.map((c) => c[0].id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(1)
    expect(useStore.getState().sessions).toHaveLength(1)
    expect(useStore.getState().sessions[0].messages).toHaveLength(2)
  })

  it('does not persist chats that only contain system notices', async () => {
    useStore.getState().addMessage({ id: 'n', role: 'system', content: 'No API key configured.', timestamp: Date.now() })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)
    expect(api.saveConversation).not.toHaveBeenCalled()
  })

  it('only sends message fields to disk (no extra state)', async () => {
    useStore.getState().addMessage({ ...user('1', 'q'), fileContext: 'big file', streaming: true })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)
    expect(Object.keys(api.saveConversation.mock.calls[0][0].messages[0]).sort()).toEqual(['content', 'id', 'role', 'timestamp'])
  })
})

describe('new chat, load, delete', () => {
  it('New chat flushes the pending save and starts a fresh session', async () => {
    const s = useStore.getState()
    s.addMessage(user('1', 'first'))
    const firstId = useStore.getState().currentSessionId
    await s.newChat()

    expect(api.saveConversation).toHaveBeenCalledTimes(1)
    expect(useStore.getState().messages).toEqual([])
    expect(useStore.getState().currentSessionId).toBeNull()

    s.addMessage(user('2', 'second'))
    expect(useStore.getState().currentSessionId).not.toBe(firstId)
  })

  it('loads a saved session into the chat', async () => {
    useStore.getState().hydrateSessions([
      { id: 'session-old', title: 'Old', createdAt: 1, updatedAt: 2, messages: [user('1', 'old question')] },
    ])
    await useStore.getState().loadSession('session-old')
    expect(useStore.getState().currentSessionId).toBe('session-old')
    expect(useStore.getState().messages[0].content).toBe('old question')
  })

  it('deleting a session removes it from the list and from disk, and clears it if active', async () => {
    useStore.getState().hydrateSessions(
      [{ id: 'session-1', title: 'One', createdAt: 1, updatedAt: 2, messages: [user('1', 'x')] }],
      { restoreLatest: true }
    )
    expect(useStore.getState().currentSessionId).toBe('session-1')

    await useStore.getState().deleteSession('session-1')

    expect(api.deleteConversation).toHaveBeenCalledWith('session-1')
    expect(useStore.getState().sessions).toEqual([])
    expect(useStore.getState().messages).toEqual([])
    expect(useStore.getState().currentSessionId).toBeNull()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)
    expect(api.saveConversation).not.toHaveBeenCalled()
  })
})

describe('hydrateSessions (startup)', () => {
  it('sorts newest first, skips malformed records, and restores the latest chat', () => {
    useStore.getState().hydrateSessions(
      [
        { id: 'older', title: 'Older', createdAt: 1, updatedAt: 10, messages: [user('1', 'a')] },
        { id: 'newer', title: 'Newer', createdAt: 1, updatedAt: 20, messages: [user('1', 'b')] },
        { id: 'empty', title: 'Empty', createdAt: 1, updatedAt: 30, messages: [] },
        null,
        { title: 'no id', messages: [user('1', 'c')] },
      ],
      { restoreLatest: true }
    )
    const state = useStore.getState()
    expect(state.sessions.map((s) => s.id)).toEqual(['newer', 'older'])
    expect(state.currentSessionId).toBe('newer')
    expect(state.messages[0].content).toBe('b')
  })

  it('does not overwrite a chat the user already started', () => {
    useStore.setState({ messages: [user('1', 'typing already')], currentSessionId: 'session-live' })
    useStore.getState().hydrateSessions(
      [{ id: 'saved', title: 'Saved', createdAt: 1, updatedAt: 2, messages: [user('1', 'saved')] }],
      { restoreLatest: true }
    )
    expect(useStore.getState().currentSessionId).toBe('session-live')
    expect(useStore.getState().messages[0].content).toBe('typing already')
  })
})

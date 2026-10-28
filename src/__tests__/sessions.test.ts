/**
 * @author Virender Dhiman
 * @year 2026
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
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
  useStore.setState({
    messages: [], sessions: [], currentSessionId: null, chatLoading: false,
    workspacePath: '', selectedFile: null, openFiles: [], tasks: [], toolExecutions: [],
    projectMemory: '', latestCheckpoint: undefined, lastVerification: undefined,
    projectNotes: '', earlierMessages: [], pinnedSummary: '', parentSessionId: undefined, forkedFromMessageId: undefined,
  })
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

  it('persists bounded activity with the assistant message while older messages remain valid', async () => {
    useStore.getState().addMessage(user('1', 'Inspect the file'))
    useStore.getState().addMessage({
      ...assistant('2', 'The file contains one export.'),
      activity: {
        id: 'run-1', startedAt: 1, updatedAt: 3, status: 'done', durationMs: 2,
        steps: [{ id: 'step-1', kind: 'tool', label: 'Reading src/index.ts', status: 'done', startedAt: 1, finishedAt: 3, details: 'Read file' }],
      },
    })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)

    const saved = api.saveConversation.mock.calls[0][0]
    expect(saved.messages[0]).not.toHaveProperty('activity')
    expect(saved.messages[1].activity).toMatchObject({ id: 'run-1', status: 'done', steps: [{ label: 'Reading src/index.ts' }] })
    expect(useStore.getState().sessions[0].messages[1].activity?.steps).toHaveLength(1)
  })

  it('persists bounded resume context alongside the messages', async () => {
    const history = [user('1', 'resume this work'), ...Array.from({ length: 20 }, (_, index) => assistant(`a-${index}`, `progress ${index}`))]
    useStore.setState({
      messages: history,
      workspacePath: 'C:\\work\\vd',
      selectedFile: 'src/app.ts',
      openFiles: ['src/app.ts'],
      projectMemory: 'TypeScript desktop app',
      latestCheckpoint: { id: 'cp-1', sessionId: 'session', createdAt: 10, label: 'Before edit', files: ['src/app.ts'] },
      lastVerification: { command: 'npm test', ok: true, timestamp: 11, summary: '263 passed' },
    })
    useStore.getState().scheduleSessionSave()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)

    const saved = api.saveConversation.mock.calls[0][0]
    expect(saved.summary).toContain('resume this work')
    expect(saved.resume).toMatchObject({
      workspacePath: 'C:\\work\\vd',
      selectedFile: 'src/app.ts',
      openFiles: ['src/app.ts'],
      projectMemory: 'TypeScript desktop app',
      checkpoint: { id: 'cp-1' },
      lastVerification: { command: 'npm test', ok: true },
    })
  })

  it('flushes a submitted marker before restart and lists it after hydration', async () => {
    let persisted: any
    let releaseWrite!: () => void
    const writeFinished = new Promise<void>((resolve) => { releaseWrite = resolve })
    api.saveConversation.mockImplementation(async (session) => {
      persisted = session
      await writeFinished
      return { success: true, id: session.id, updatedAt: Date.now() }
    })
    api.listConversations.mockImplementation(async () => persisted ? [persisted] : [])

    useStore.getState().addMessage(user('submitted-marker', 'QA resume marker'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)
    let flushCompleted = false
    const flush = useStore.getState().flushSessionSave().then(() => { flushCompleted = true })
    await Promise.resolve()
    const completedBeforeWriteFinished = flushCompleted
    releaseWrite()
    await flush

    expect(completedBeforeWriteFinished).toBe(false)
    expect(persisted.messages[0]).toMatchObject({ id: 'submitted-marker', content: 'QA resume marker' })

    useStore.setState({ messages: [], sessions: [], currentSessionId: null })
    await useStore.getState().reloadSessions()
    expect(useStore.getState().sessions[0].messages[0].content).toBe('QA resume marker')
    api.saveConversation.mockResolvedValue({ success: true })
    api.listConversations.mockResolvedValue([])
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

  it('restores workspace, task, tool, checkpoint, and verification state', () => {
    useStore.getState().hydrateSessions(
      [{
        id: 'resume', title: 'Resume', createdAt: 1, updatedAt: 2, messages: [user('1', 'continue')],
        resume: {
          workspacePath: 'D:\\repo', selectedFile: 'src/main.ts', openFiles: ['src/main.ts'],
          tasks: [{ id: 'task-1', title: 'Fix build', status: 'running', steps: [] }],
          toolExecutions: [{ name: 'read_file', ok: true, timestamp: 3, argsSummary: 'src/main.ts', resultSummary: 'ok' }],
          projectMemory: 'Electron project',
          checkpoint: { id: 'cp-1', sessionId: 'resume', createdAt: 4, label: 'Before edit', files: ['src/main.ts'] },
          lastVerification: { command: 'npm test', ok: false, timestamp: 5, summary: 'one failure' },
        },
      }],
      { restoreLatest: true }
    )

    const state = useStore.getState()
    expect(state.workspacePath).toBe('D:\\repo')
    expect(state.selectedFile).toBe('src/main.ts')
    expect(state.tasks[0].title).toBe('Fix build')
    expect(state.toolExecutions[0].name).toBe('read_file')
    expect(state.projectMemory).toBe('Electron project')
    expect(state.latestCheckpoint?.id).toBe('cp-1')
    expect(state.lastVerification?.ok).toBe(false)
  })

  it('marks a restored session as recovered and restores checklist state without starting work', () => {
    useStore.getState().hydrateSessions(
      [{
        id: 'recovered', title: 'Recovered', createdAt: 1, updatedAt: 2, messages: [user('1', 'continue')],
        resume: {
          workspacePath: 'C:\\repo', providerId: 'groq', model: 'model-1',
          checklistState: { setupChecklistDismissed: true },
          terminalTabs: [{ id: 'term-1', name: 'Terminal 1', cwd: 'C:\\repo' }],
        },
      }],
      { restoreLatest: true }
    )

    const state = useStore.getState()
    expect(state.sessions[0].recovered).toBe(true)
    expect(state.settings.setupChecklistDismissed).toBe(true)
    expect(state.settings.activeProvider).toBe('groq')
    expect(api.aiChat).not.toHaveBeenCalled()
    expect(api.terminalCreate).not.toHaveBeenCalled()
  })

  it('loads legacy chats without long-chat fields unchanged', () => {
    const legacy = user('legacy-1', 'continue the old task')
    useStore.getState().hydrateSessions([{ id: 'legacy', title: 'Legacy', createdAt: 1, updatedAt: 2, messages: [legacy] }], { restoreLatest: true })
    const state = useStore.getState()
    expect(state.messages).toEqual([legacy])
    expect(state.earlierMessages).toEqual([])
    expect(state.pinnedSummary).toBe('')
    expect(state.parentSessionId).toBeUndefined()
  })

  it('summarizes while keeping six recent messages and a recoverable transcript', async () => {
    const history = [user('u-0', 'start'), ...Array.from({ length: 9 }, (_, index) => assistant(`a-${index}`, `answer ${index}`))]
    useStore.setState({ messages: history, currentSessionId: 'long', projectNotes: 'Keep the API stable' })
    await useStore.getState().summarizeAndContinue()
    const state = useStore.getState()
    expect(state.messages).toHaveLength(7)
    expect(state.messages[0].role).toBe('system')
    expect(state.messages.slice(1).map((message) => message.id)).toEqual(['a-3', 'a-4', 'a-5', 'a-6', 'a-7', 'a-8'])
    expect(state.earlierMessages).toHaveLength(4)
    expect(state.pinnedSummary).toContain('Keep the API stable')
    expect(state.earlierMessages.concat(state.messages.slice(1)).map((message) => message.id)).toEqual(['u-0', 'a-0', 'a-1', 'a-2', 'a-3', 'a-4', 'a-5', 'a-6', 'a-7', 'a-8'])
  })

  it('forks from the current chat without changing the parent record', async () => {
    const history = [user('u-0', 'parent request'), ...Array.from({ length: 7 }, (_, index) => assistant(`a-${index}`, `answer ${index}`))]
    useStore.setState({ messages: history, currentSessionId: 'parent', sessions: [{ id: 'parent', title: 'Parent', createdAt: 1, updatedAt: 1, messages: history }] })
    await useStore.getState().forkChat()
    const state = useStore.getState()
    expect(state.currentSessionId).not.toBe('parent')
    expect(state.parentSessionId).toBe('parent')
    expect(state.sessions.find((session) => session.id === 'parent')?.messages).toEqual(history)
    expect(state.messages.slice(1)).toEqual(history.slice(-6))
  })
})

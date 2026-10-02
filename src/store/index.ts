/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * VD Agent — Zustand State Store
 *
 * Centralized state management for the entire application.
 * All UI state flows through this store — no prop drilling.
 *
 * State slices:
 * - Workspace: current directory, workspace path
 * - Navigation: active panel, command palette visibility
 * - Layout: terminal visibility, editor height
 * - File Browser: files, selected file, open tabs, dirty state
 * - Git: status, log, diff, branches, repo detection
 * - Chat: messages, streaming, loading state
 * - Tasks: agent task tracking with steps
 * - Terminal: tab management, PTY instances
 * - Sessions: conversation history persistence
 * - Plan Mode: toggle for plan-before-execute mode
 * - Settings: providers, API keys, workspace, custom rules
 */
import { create } from 'zustand'
import type {
  FileEntry, GitStatus, GitLogEntry, GitBranchInfo, ChatMessage, ChatSession, TerminalEntry, TerminalTab,
  Settings, ProviderConfig, Panel, AgentTask, CheckpointSummary, ToolExecutionSummary, VerificationSummary,
} from '../types'

export const AUTOSAVE_DELAY_MS = 800
export const MAX_SESSIONS_IN_MEMORY = 100

let autosaveTimer: ReturnType<typeof setTimeout> | null = null

function newSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function sessionTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content.trim() || ''
  const line = first.split('\n')[0].trim()
  return line ? line.slice(0, 80) : 'Untitled chat'
}

/** Only conversations with at least one user message are worth keeping. */
function isPersistable(messages: ChatMessage[]) {
  return messages.some((m) => m.role === 'user')
}

function toStoredMessages(messages: ChatMessage[]) {
  return messages.map(({ id, role, content, timestamp }) => ({ id, role, content, timestamp }))
}

export function buildConversationSummary(messages: ChatMessage[], keepRecent = 20): string {
  const older = messages.filter((m) => m.role !== 'system').slice(0, Math.max(0, messages.length - keepRecent))
  if (older.length === 0) return ''
  const lines = older.slice(-24).map((message) => {
    const content = message.content.replace(/```tool[\s\S]*?```/g, '[tool call]').replace(/\s+/g, ' ').trim()
    return `${message.role}: ${content.slice(0, 320)}`
  })
  return `Earlier conversation (${older.length} messages summarized locally):\n${lines.join('\n')}`.slice(0, 8_000)
}

interface AppState {
  // Workspace
  workspacePath: string
  setWorkspacePath: (path: string) => void

  // Navigation
  activePanel: Panel
  setActivePanel: (panel: Panel) => void

  // Command Palette
  showCommandPalette: boolean
  toggleCommandPalette: () => void
  setShowCommandPalette: (show: boolean) => void

  // Layout
  showTerminal: boolean
  toggleTerminal: () => void
  editorHeight: number
  setEditorHeight: (h: number) => void

  // File Browser
  currentDirectory: string
  setCurrentDirectory: (path: string) => void
  files: FileEntry[]
  setFiles: (files: FileEntry[]) => void
  selectedFile: string | null
  setSelectedFile: (path: string | null) => void
  openFiles: string[]
  addOpenFile: (path: string) => void
  closeOpenFile: (path: string) => void
  fileContent: string
  setFileContent: (content: string) => void
  fileDirty: boolean
  setFileDirty: (dirty: boolean) => void
  expandedDirs: Set<string>
  toggleDir: (path: string) => void

  // All files (for search)
  allFiles: { name: string; path: string; isDirectory: boolean }[]
  setAllFiles: (files: { name: string; path: string; isDirectory: boolean }[]) => void

  // Search results
  searchResults: string | null
  setSearchResults: (results: string | null) => void

  // Git
  refreshGit: () => Promise<void>
  gitStatus: GitStatus | null
  setGitStatus: (status: GitStatus | null) => void
  gitLog: GitLogEntry[]
  setGitLog: (log: GitLogEntry[]) => void
  gitDiff: string
  setGitDiff: (diff: string) => void
  isRepo: boolean
  setIsRepo: (val: boolean) => void
  gitBranches: GitBranchInfo | null
  setGitBranches: (info: GitBranchInfo | null) => void

  // Chat
  messages: ChatMessage[]
  addMessage: (msg: ChatMessage) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  clearMessages: () => void
  chatLoading: boolean
  setChatLoading: (loading: boolean) => void
  streamingContent: string
  setStreamingContent: (content: string) => void
  appendStreamingContent: (token: string) => void

  // Tool calls
  toolResults: Map<string, string>
  setToolResult: (id: string, result: string) => void
  toolExecutions: ToolExecutionSummary[]
  recordToolExecution: (run: ToolExecutionSummary) => void
  latestCheckpoint: CheckpointSummary | undefined
  setLatestCheckpoint: (checkpoint: CheckpointSummary | undefined) => void
  lastVerification: VerificationSummary | undefined
  setLastVerification: (verification: VerificationSummary | undefined) => void
  projectMemory: string
  setProjectMemory: (memory: string) => void

  // Tasks
  tasks: AgentTask[]
  addTask: (task: AgentTask) => void
  updateTask: (id: string, updates: Partial<AgentTask>) => void
  addStepToTask: (taskId: string, step: any) => void

  // Terminal
  terminalTabs: TerminalTab[]
  addTerminalTab: (tab: TerminalTab) => void
  removeTerminalTab: (id: string) => void
  activeTerminalTab: string | null
  setActiveTerminalTab: (id: string | null) => void
  terminalEntries: TerminalEntry[]
  addTerminalEntry: (entry: TerminalEntry) => void
  clearTerminal: () => void

  // Plan Mode
  planMode: boolean
  setPlanMode: (mode: boolean) => void

  // Stop Generation
  cancelRequested: boolean
  setCancelRequested: (value: boolean) => void
  stopGeneration: () => void

  // Sessions (persisted to userData/conversations by the main process)
  sessions: ChatSession[]
  currentSessionId: string | null
  saveSession: () => Promise<void>
  scheduleSessionSave: () => void
  flushSessionSave: () => Promise<void>
  loadSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  newChat: () => Promise<void>
  hydrateSessions: (records: unknown[], options?: { restoreLatest?: boolean }) => void
  renameSession: (id: string, title: string) => Promise<void>
  toggleSessionPin: (id: string) => Promise<void>
  reloadSessions: () => Promise<void>

  // Settings
  settings: Settings
  setSettings: (settings: Settings) => void
  getActiveProvider: () => ProviderConfig | undefined

  // Session Stats (token tracking)
  sessionStats: { inputTokens: number; outputTokens: number; estimatedCost: number; providerUsed: string; toolsExecuted: number }
  addTokens: (input: number, output: number) => void
  addToolExecution: (providerName: string) => void

  // File Edit History (for diff viewer)
  fileEditHistory: { path: string; before: string; after: string; timestamp: number }[]
  addFileEdit: (edit: { path: string; before: string; after: string }) => void
  removeFileEdit: (timestamp: number) => void
  clearEditHistory: () => void
}

export const useStore = create<AppState>((set, get) => ({
  // Workspace
  workspacePath: '',
  setWorkspacePath: (path) => set({ workspacePath: path, currentDirectory: path, projectMemory: '' }),

  // Navigation
  activePanel: 'chat',
  setActivePanel: (panel) => set({ activePanel: panel }),

  // Command Palette
  showCommandPalette: false,
  toggleCommandPalette: () => set((s) => ({ showCommandPalette: !s.showCommandPalette })),
  setShowCommandPalette: (show) => set({ showCommandPalette: show }),

  // Layout
  showTerminal: true,
  toggleTerminal: () => set((s) => ({ showTerminal: !s.showTerminal })),
  editorHeight: 60,
  setEditorHeight: (h) => set({ editorHeight: h }),

  // File Browser
  currentDirectory: '',
  setCurrentDirectory: (path) => set({ currentDirectory: path }),
  files: [],
  setFiles: (files) => set({ files }),
  selectedFile: null,
  setSelectedFile: (path) => { set({ selectedFile: path }); get().scheduleSessionSave() },
  openFiles: [],
  addOpenFile: (path) => {
    set((s) => ({ openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path] }))
    get().scheduleSessionSave()
  },
  closeOpenFile: (path) => {
    set((s) => ({ openFiles: s.openFiles.filter((f) => f !== path) }))
    get().scheduleSessionSave()
  },
  fileContent: '',
  setFileContent: (content) => set({ fileContent: content, fileDirty: false }),
  fileDirty: false,
  setFileDirty: (dirty) => set({ fileDirty: dirty }),
  expandedDirs: new Set<string>(),
  toggleDir: (path) =>
    set((s) => {
      const next = new Set(s.expandedDirs)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { expandedDirs: next }
    }),

  // All files
  allFiles: [],
  setAllFiles: (files) => set({ allFiles: files }),

  // Search results
  searchResults: null,
  setSearchResults: (results) => set({ searchResults: results }),

  // Git
  refreshGit: async () => { const s = get(); if (!s.workspacePath) return; const status = await window.api.gitStatus(s.workspacePath); if (!('error' in status)) s.setGitStatus(status as any); },
  gitStatus: null,
  setGitStatus: (status) => set({ gitStatus: status }),
  gitLog: [],
  setGitLog: (log) => set({ gitLog: log }),
  gitDiff: '',
  setGitDiff: (diff) => set({ gitDiff: diff }),
  isRepo: false,
  setIsRepo: (val) => set({ isRepo: val }),
  gitBranches: null,
  setGitBranches: (info) => set({ gitBranches: info }),

  // Chat
  messages: [],
  addMessage: (msg) => {
    set((s) => ({
      messages: [...s.messages, msg],
      currentSessionId: s.currentSessionId || newSessionId(),
    }))
    get().scheduleSessionSave()
  },
  updateMessage: (id, updates) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }))
    get().scheduleSessionSave()
  },
  /** Starts a fresh chat. The previous conversation stays in history. */
  clearMessages: () => { void get().newChat() },
  chatLoading: false,
  setChatLoading: (loading) => set({ chatLoading: loading }),
  streamingContent: '',
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (token) =>
    set((s) => ({ streamingContent: s.streamingContent + token })),

  // Tool calls
  toolResults: new Map(),
  setToolResult: (id, result) =>
    set((s) => {
      const next = new Map(s.toolResults)
      next.set(id, result)
      return { toolResults: next }
    }),
  toolExecutions: [],
  recordToolExecution: (run) => {
    set((s) => ({ toolExecutions: [...s.toolExecutions, run].slice(-100) }))
    get().scheduleSessionSave()
  },
  latestCheckpoint: undefined,
  setLatestCheckpoint: (checkpoint) => { set({ latestCheckpoint: checkpoint }); get().scheduleSessionSave() },
  lastVerification: undefined,
  setLastVerification: (verification) => { set({ lastVerification: verification }); get().scheduleSessionSave() },
  projectMemory: '',
  setProjectMemory: (memory) => { set({ projectMemory: memory }); get().scheduleSessionSave() },

  // Tasks
  tasks: [],
  addTask: (task) => { set((s) => ({ tasks: [...s.tasks, task] })); get().scheduleSessionSave() },
  updateTask: (id, updates) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)) }))
    get().scheduleSessionSave()
  },
  addStepToTask: (taskId, step) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, steps: [...t.steps, step] } : t
      ),
    }))
    get().scheduleSessionSave()
  },

  // Terminal
  terminalTabs: [{ id: 'term-1', name: 'Terminal 1', cwd: '' }],
  addTerminalTab: (tab) => {
    set((s) => ({ terminalTabs: [...s.terminalTabs, tab], activeTerminalTab: tab.id }))
    get().scheduleSessionSave()
  },
  removeTerminalTab: (id) => {
    set((s) => {
      const remaining = s.terminalTabs.filter((t) => t.id !== id)
      return {
        terminalTabs: remaining,
        activeTerminalTab: remaining.length > 0
          ? (s.activeTerminalTab === id ? remaining[0].id : s.activeTerminalTab)
          : null,
      }
    })
    get().scheduleSessionSave()
  },
  activeTerminalTab: 'term-1',
  setActiveTerminalTab: (id) => set({ activeTerminalTab: id }),

  terminalEntries: [],
  addTerminalEntry: (entry) => {
    set((s) => ({ terminalEntries: [...s.terminalEntries, entry].slice(-200) }))
    get().scheduleSessionSave()
  },
  clearTerminal: () => set({ terminalEntries: [] }),

  // Plan Mode
  planMode: false,
  setPlanMode: (mode) => set({ planMode: mode }),

  // Stop Generation
  cancelRequested: false,
  setCancelRequested: (value) => set({ cancelRequested: value }),
  stopGeneration: () => {
    set({ cancelRequested: true, chatLoading: false, streamingContent: '' })
    Promise.resolve()
      .then(() => window.api.aiCancel())
      .catch(() => {})
  },

  // Sessions
  sessions: [],
  currentSessionId: null,
  saveSession: async () => {
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null }
    const state = get()
    const { messages, sessions } = state
    if (!isPersistable(messages)) return
    const id = state.currentSessionId || newSessionId()
    const existing = sessions.find((s) => s.id === id)
    const now = Date.now()
    const activeProvider = state.settings.providers.find((provider) => provider.id === state.settings.activeProvider)
    const summary = buildConversationSummary(messages)
    const session: ChatSession = {
      id,
      title: existing?.title || sessionTitle(messages),
      createdAt: existing?.createdAt ?? messages[0]?.timestamp ?? now,
      updatedAt: now,
      messages,
      pinned: existing?.pinned,
      summary,
      resume: {
        workspacePath: state.workspacePath || undefined,
        selectedFile: state.selectedFile,
        openFiles: state.openFiles.slice(-30),
        tasks: state.tasks.slice(-20).map((task) => ({ ...task, steps: task.steps.slice(-60) })),
        terminalTabs: state.terminalTabs.slice(-10),
        terminalEntries: state.terminalEntries.slice(-100),
        toolExecutions: state.toolExecutions.slice(-100),
        providerId: state.settings.activeProvider,
        model: activeProvider?.model,
        projectMemory: state.projectMemory.slice(0, 12_000),
        conversationSummary: summary,
        checkpoint: state.latestCheckpoint,
        lastVerification: state.lastVerification,
        git: state.gitStatus ? {
          branch: state.gitStatus.branch,
          dirty: !state.gitStatus.isClean,
        } : undefined,
      },
    }
    set({
      sessions: [session, ...sessions.filter((s) => s.id !== id)]
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
        .slice(0, MAX_SESSIONS_IN_MEMORY),
      currentSessionId: id,
    })
    try {
      const result = await window.api.saveConversation({
        id,
        title: session.title,
        createdAt: session.createdAt,
        messages: toStoredMessages(messages),
        pinned: session.pinned,
        summary: session.summary,
        resume: session.resume as unknown as Record<string, unknown>,
      })
      if (result && 'error' in result) console.warn(`Failed to save chat history: ${result.error}`)
    } catch (err: any) {
      console.warn(`Failed to save chat history: ${err?.message || err}`)
    }
  },
  scheduleSessionSave: () => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null
      void get().saveSession()
    }, AUTOSAVE_DELAY_MS)
  },
  flushSessionSave: async () => {
    if (!autosaveTimer) return
    await get().saveSession()
  },
  loadSession: async (id) => {
    if (get().chatLoading) get().stopGeneration()
    await get().flushSessionSave()
    const session = get().sessions.find((s) => s.id === id)
    if (session) {
      const resume = session.resume
      set({
        messages: session.messages,
        currentSessionId: id,
        streamingContent: '',
        ...(resume?.workspacePath ? { workspacePath: resume.workspacePath, currentDirectory: resume.workspacePath } : {}),
        selectedFile: resume?.selectedFile ?? null,
        openFiles: resume?.openFiles || [],
        tasks: resume?.tasks || [],
        terminalTabs: resume?.terminalTabs?.length ? resume.terminalTabs : [{ id: 'term-1', name: 'Terminal 1', cwd: resume?.workspacePath || '' }],
        activeTerminalTab: resume?.terminalTabs?.[0]?.id || 'term-1',
        terminalEntries: resume?.terminalEntries || [],
        toolExecutions: resume?.toolExecutions || [],
        projectMemory: resume?.projectMemory || '',
        latestCheckpoint: resume?.checkpoint,
        lastVerification: resume?.lastVerification,
      })
      if (resume?.workspacePath || resume?.providerId) {
        const currentSettings = get().settings
        const nextSettings = {
          ...currentSettings,
          workspacePath: resume.workspacePath || currentSettings.workspacePath,
          ...(resume.providerId ? { activeProvider: resume.providerId } : {}),
          providers: currentSettings.providers.map((provider) => (
            provider.id === resume.providerId && resume.model ? { ...provider, model: resume.model } : provider
          )),
        }
        set({ settings: nextSettings })
        void window.api.saveSettings(nextSettings)
        if (resume.workspacePath) void window.api.walkDirectory(resume.workspacePath).then((files) => set({ allFiles: files }))
      }
    }
  },
  deleteSession: async (id) => {
    const wasCurrent = get().currentSessionId === id
    if (wasCurrent && get().chatLoading) get().stopGeneration()
    if (wasCurrent && autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null }
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      ...(wasCurrent ? { messages: [], currentSessionId: null, streamingContent: '' } : {}),
    }))
    try {
      const result = await window.api.deleteConversation(id)
      if (result && 'error' in result) console.warn(`Failed to delete chat history: ${result.error}`)
    } catch (err: any) {
      console.warn(`Failed to delete chat history: ${err?.message || err}`)
    }
  },
  newChat: async () => {
    if (get().chatLoading) get().stopGeneration()
    await get().flushSessionSave()
    set({
      messages: [], currentSessionId: null, streamingContent: '', tasks: [], toolExecutions: [],
      latestCheckpoint: undefined, lastVerification: undefined,
    })
  },
  hydrateSessions: (records, options) => {
    const sessions: ChatSession[] = []
    for (const r of Array.isArray(records) ? records : []) {
      const rec = r as Partial<ChatSession> | null
      if (!rec || typeof rec.id !== 'string' || !Array.isArray(rec.messages) || rec.messages.length === 0) continue
      const updatedAt = typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now()
      sessions.push({
        id: rec.id,
        title: typeof rec.title === 'string' && rec.title ? rec.title : sessionTitle(rec.messages),
        createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : updatedAt,
        updatedAt,
        messages: rec.messages,
        pinned: rec.pinned === true,
        summary: typeof rec.summary === 'string' ? rec.summary : undefined,
        resume: rec.resume && typeof rec.resume === 'object' ? rec.resume : undefined,
      })
    }
    sessions.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
    const { messages } = get()
    const restore = options?.restoreLatest && messages.length === 0 ? sessions[0] : undefined
    const resume = restore?.resume
    const currentSettings = get().settings
    const restoredSettings = resume && (resume.workspacePath || resume.providerId) ? {
      ...currentSettings,
      workspacePath: resume.workspacePath || currentSettings.workspacePath,
      ...(resume.providerId ? { activeProvider: resume.providerId } : {}),
      providers: currentSettings.providers.map((provider) => (
        provider.id === resume.providerId && resume.model ? { ...provider, model: resume.model } : provider
      )),
    } : currentSettings
    set({
      sessions: sessions.slice(0, MAX_SESSIONS_IN_MEMORY),
      ...(restore ? {
        messages: restore.messages,
        currentSessionId: restore.id,
        ...(resume?.workspacePath ? { workspacePath: resume.workspacePath, currentDirectory: resume.workspacePath } : {}),
        tasks: resume?.tasks || [],
        terminalTabs: resume?.terminalTabs?.length ? resume.terminalTabs : [{ id: 'term-1', name: 'Terminal 1', cwd: resume?.workspacePath || '' }],
        activeTerminalTab: resume?.terminalTabs?.[0]?.id || 'term-1',
        terminalEntries: resume?.terminalEntries || [],
        toolExecutions: resume?.toolExecutions || [],
        selectedFile: resume?.selectedFile ?? null,
        openFiles: resume?.openFiles || [],
        projectMemory: resume?.projectMemory || '',
        latestCheckpoint: resume?.checkpoint,
        lastVerification: resume?.lastVerification,
        settings: restoredSettings,
      } : {}),
    })
    if (restore && resume && (resume.workspacePath || resume.providerId)) {
      void window.api.saveSettings(restoredSettings)
      if (resume.workspacePath) void window.api.walkDirectory(resume.workspacePath).then((files) => set({ allFiles: files }))
    }
  },
  renameSession: async (id, title) => {
    const clean = title.trim().slice(0, 80)
    if (!clean) return
    set((s) => ({ sessions: s.sessions.map((session) => session.id === id ? { ...session, title: clean } : session) }))
    const result = await window.api.updateConversation(id, { title: clean })
    if (result && 'error' in result) console.warn(`Failed to rename chat: ${result.error}`)
  },
  toggleSessionPin: async (id) => {
    const session = get().sessions.find((candidate) => candidate.id === id)
    if (!session) return
    const pinned = !session.pinned
    set((s) => ({
      sessions: s.sessions.map((candidate) => candidate.id === id ? { ...candidate, pinned } : candidate)
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt),
    }))
    const result = await window.api.updateConversation(id, { pinned })
    if (result && 'error' in result) console.warn(`Failed to pin chat: ${result.error}`)
  },
  reloadSessions: async () => {
    const records = await window.api.listConversations()
    if (Array.isArray(records)) get().hydrateSessions(records)
  },

  // Settings
  settings: {
    providers: [],
    activeProvider: 'groq',
    workspacePath: '',
  },
  setSettings: (settings) => set({ settings }),
  getActiveProvider: () => {
    const { settings } = get()
    return settings.providers.find((p) => p.id === settings.activeProvider)
  },

  // Session Stats
  sessionStats: { inputTokens: 0, outputTokens: 0, estimatedCost: 0, providerUsed: '', toolsExecuted: 0 },
  addTokens: (input, output) => set((s) => {
    const provider = s.settings.providers.find(p => p.id === s.settings.activeProvider)
    // Rough cost estimates per 1M tokens
    const costs: Record<string, { input: number; output: number }> = {
      groq: { input: 0.05, output: 0.08 },
      cerebras: { input: 0.1, output: 0.1 },
      deepseek: { input: 0.14, output: 0.28 },
      gemini: { input: 0.075, output: 0.3 },
      mistral: { input: 0.25, output: 0.25 },
      together: { input: 0.1, output: 0.1 },
      fireworks: { input: 0.2, output: 0.2 },
      deepinfra: { input: 0.07, output: 0.07 },
      openai: { input: 2.5, output: 10 },
      anthropic: { input: 3, output: 15 },
    }
    const rate = costs[s.settings.activeProvider] || costs.groq
    const cost = (input / 1_000_000) * rate.input + (output / 1_000_000) * rate.output
    return {
      sessionStats: {
        ...s.sessionStats,
        inputTokens: s.sessionStats.inputTokens + input,
        outputTokens: s.sessionStats.outputTokens + output,
        estimatedCost: s.sessionStats.estimatedCost + cost,
        providerUsed: provider?.name || s.settings.activeProvider,
      },
    }
  }),
  addToolExecution: (providerName) => set((s) => ({
    sessionStats: { ...s.sessionStats, toolsExecuted: s.sessionStats.toolsExecuted + 1, providerUsed: providerName },
  })),

  // File Edit History
  fileEditHistory: [],
  addFileEdit: (edit) => set((s) => ({
    fileEditHistory: [...s.fileEditHistory.slice(-20), { ...edit, timestamp: Date.now() }],
  })),
  removeFileEdit: (timestamp) => set((s) => ({
    fileEditHistory: s.fileEditHistory.filter((edit) => edit.timestamp !== timestamp),
  })),
  clearEditHistory: () => set({ fileEditHistory: [] }),
}))

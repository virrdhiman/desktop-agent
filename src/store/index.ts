/**
 * Freebuff Agent — Zustand State Store
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
  FileEntry, GitStatus, GitLogEntry, GitBranchInfo, ChatMessage, TerminalEntry, TerminalTab,
  Settings, ProviderConfig, Panel, AgentTask,
} from '../types'

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
  abortController: AbortController | null
  setAbortController: (ac: AbortController | null) => void
  stopGeneration: () => void

  // Sessions
  sessions: { id: string; title: string; timestamp: number; messages: ChatMessage[] }[]
  saveSession: () => void
  loadSession: (id: string) => void
  deleteSession: (id: string) => void
  currentSessionId: string | null

  // Settings
  settings: Settings
  setSettings: (settings: Settings) => void
  getActiveProvider: () => ProviderConfig | undefined
}

export const useStore = create<AppState>((set, get) => ({
  // Workspace
  workspacePath: '',
  setWorkspacePath: (path) => set({ workspacePath: path, currentDirectory: path }),

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
  setSelectedFile: (path) => set({ selectedFile: path }),
  openFiles: [],
  addOpenFile: (path) =>
    set((s) => ({ openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path] })),
  closeOpenFile: (path) =>
    set((s) => ({ openFiles: s.openFiles.filter((f) => f !== path) })),
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
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  clearMessages: () => set({ messages: [] }),
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

  // Tasks
  tasks: [],
  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
  updateTask: (id, updates) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),
  addStepToTask: (taskId, step) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, steps: [...t.steps, step] } : t
      ),
    })),

  // Terminal
  terminalTabs: [{ id: 'term-1', name: 'Terminal 1', cwd: '' }],
  addTerminalTab: (tab) => set((s) => ({
    terminalTabs: [...s.terminalTabs, tab],
    activeTerminalTab: tab.id,
  })),
  removeTerminalTab: (id) => set((s) => {
    const remaining = s.terminalTabs.filter((t) => t.id !== id)
    return {
      terminalTabs: remaining,
      activeTerminalTab: remaining.length > 0
        ? (s.activeTerminalTab === id ? remaining[0].id : s.activeTerminalTab)
        : null,
    }
  }),
  activeTerminalTab: 'term-1',
  setActiveTerminalTab: (id) => set({ activeTerminalTab: id }),

  terminalEntries: [],
  addTerminalEntry: (entry) => set((s) => ({ terminalEntries: [...s.terminalEntries, entry] })),
  clearTerminal: () => set({ terminalEntries: [] }),

  // Plan Mode
  planMode: false,
  setPlanMode: (mode) => set({ planMode: mode }),

  // Stop Generation
  abortController: null,
  setAbortController: (ac) => set({ abortController: ac }),
  stopGeneration: () => {
    const { abortController } = get()
    if (abortController) abortController.abort()
    set({ abortController: null, chatLoading: false, streamingContent: '' })
  },

  // Sessions
  sessions: [],
  currentSessionId: null,
  saveSession: () => {
    const { messages, sessions, currentSessionId } = get()
    if (messages.length === 0) return
    const id = currentSessionId || `session-${Date.now()}`
    const title = messages.find(m => m.role === 'user')?.content.slice(0, 60) || 'Untitled'
    const session = { id, title, timestamp: Date.now(), messages }
    const updated = sessions.filter(s => s.id !== id)
    updated.unshift(session)
    set({ sessions: updated.slice(0, 50), currentSessionId: id })
    // Save to disk
    window.api.saveConversations({ messages, taskId: id }).catch(() => {})
  },
  loadSession: (id) => {
    const { sessions } = get()
    const session = sessions.find(s => s.id === id)
    if (session) {
      set({ messages: session.messages, currentSessionId: id })
    }
  },
  deleteSession: (id) => {
    const { sessions } = get()
    set({ sessions: sessions.filter(s => s.id !== id) })
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
}))

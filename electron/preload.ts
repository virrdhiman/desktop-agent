/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * VD Agent — Preload Script
 *
 * Exposes a safe, typed API bridge between the renderer (React app)
 * and the main process (Node.js). Uses contextBridge for security.
 *
 * All methods are invoked via invokeWithTimeout() and return promises.
 * Event listeners (onAIStream, onTerminalData) use ipcRenderer.on().
 */
import { contextBridge, ipcRenderer } from 'electron'

/** Invoke with a timeout — prevents renderer from hanging if main process stalls */
function invokeWithTimeout(channel: string, ...args: any[]): Promise<any> {
  // tool:execute outlives run_command's own 30 s limit so its clearer timeout message wins.
  const ms = channel === 'ai:chat' ? 10 * 60 * 1000 : channel === 'tool:execute' ? 60_000 : 30_000
  return Promise.race([
    ipcRenderer.invoke(channel, ...args),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`IPC timeout: ${channel} did not respond in ${ms / 1000}s`)), ms)),
  ])
}

contextBridge.exposeInMainWorld('api', {
  // ═══ File System ══════════════════════════════════════════════════════════════
  // Browse, read, write, create, delete files and directories
  // File System
  openDirectory: () => invokeWithTimeout('fs:openDirectory'),
  readDirectory: (dirPath: string) => invokeWithTimeout('fs:readDirectory', dirPath),
  readFile: (filePath: string) => invokeWithTimeout('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) => invokeWithTimeout('fs:writeFile', filePath, content),
  getParentPath: (dirPath: string) => invokeWithTimeout('fs:getParentPath', dirPath),
  createFile: (filePath: string) => invokeWithTimeout('fs:createFile', filePath),
  createDirectory: (dirPath: string) => invokeWithTimeout('fs:createDirectory', dirPath),
  deleteFile: (filePath: string) => invokeWithTimeout('fs:deleteFile', filePath),
  rename: (oldPath: string, newPath: string) => invokeWithTimeout('fs:rename', oldPath, newPath),
  walkDirectory: (dirPath: string) => invokeWithTimeout('fs:walkDirectory', dirPath),

  // ═══ Git ══════════════════════════════════════════════════════════════════════
  // Full git operations: status, diff, commit, push, pull, branches, stash
  gitStatus: (repoPath: string) => invokeWithTimeout('git:status', repoPath),
  gitDiff: (repoPath: string, filePath?: string) => invokeWithTimeout('git:diff', repoPath, filePath),
  gitDiffStaged: (repoPath: string) => invokeWithTimeout('git:diffStaged', repoPath),
  gitCommit: (repoPath: string, message: string) => invokeWithTimeout('git:commit', repoPath, message),
  gitCommitStaged: (repoPath: string, message: string) => invokeWithTimeout('git:commitStaged', repoPath, message),
  gitPush: (repoPath: string, branch?: string) => invokeWithTimeout('git:push', repoPath, branch),
  gitPull: (repoPath: string) => invokeWithTimeout('git:pull', repoPath),
  gitInit: (repoPath: string) => invokeWithTimeout('git:init', repoPath),
  gitLog: (repoPath: string, count?: number) => invokeWithTimeout('git:log', repoPath, count),
  gitIsRepo: (dirPath: string) => invokeWithTimeout('git:isRepo', dirPath),
  gitBranches: (repoPath: string) => invokeWithTimeout('git:branches', repoPath),
  gitCreateBranch: (repoPath: string, branchName: string) => invokeWithTimeout('git:createBranch', repoPath, branchName),
  gitSwitchBranch: (repoPath: string, branchName: string) => invokeWithTimeout('git:switchBranch', repoPath, branchName),
  gitDeleteBranch: (repoPath: string, branchName: string) => invokeWithTimeout('git:deleteBranch', repoPath, branchName),
  gitStash: (repoPath: string) => invokeWithTimeout('git:stash', repoPath),
  gitStashPop: (repoPath: string) => invokeWithTimeout('git:stashPop', repoPath),
  gitStage: (repoPath: string, files: string[]) => invokeWithTimeout('git:stage', repoPath, files),
  gitUnstage: (repoPath: string, files: string[]) => invokeWithTimeout('git:unstage', repoPath, files),

  // ═══ Terminal ══════════════════════════════════════════════════════════════════
  // Real shell terminals via node-pty (PowerShell/bash)
  terminalCreate: (termId: string, cwd: string) => invokeWithTimeout('terminal:create', termId, cwd),
  terminalWrite: (termId: string, data: string) => invokeWithTimeout('terminal:write', termId, data),
  terminalResize: (termId: string, cols: number, rows: number) => invokeWithTimeout('terminal:resize', termId, cols, rows),
  terminalKill: (termId: string) => invokeWithTimeout('terminal:kill', termId),
  onTerminalData: (cb: (termId: string, data: string) => void) => {
    ipcRenderer.on('terminal:data', (_e, termId, data) => cb(termId, data))
  },
  onTerminalExit: (cb: (termId: string, exitCode: number) => void) => {
    ipcRenderer.on('terminal:exit', (_e, termId, exitCode) => cb(termId, exitCode))
  },

  // ═══ Agent Tools ══════════════════════════════════════════════════════════════
  // Tools the agent calls autonomously (definitions in src/types AGENT_TOOLS)
  toolExecute: (tool: { name: string; args: Record<string, any>; workspace?: string }) => invokeWithTimeout('tool:execute', tool),

  // ═══ Settings ══════════════════════════════════════════════════════════════════
  // API keys, providers, workspace config
  loadSettings: () => invokeWithTimeout('settings:load'),
  saveSettings: (settings: any) => invokeWithTimeout('settings:save', settings),

  // ═══ AI ════════════════════════════════════════════════════════════════════════
  // Streaming chat completions, per-key model discovery, cancellation
  aiChat: (config: { provider: string; apiKey: string; baseUrl: string; model: string; messages: any[]; stream?: boolean; autoSelect?: boolean }) =>
    invokeWithTimeout('ai:chat', config),
  aiCancel: () => invokeWithTimeout('ai:cancel'),
  aiListModels: (config: { provider: string; apiKey: string; baseUrl: string }) => invokeWithTimeout('ai:listModels', config),
  onAIStream: (cb: (token: string) => void) => {
    const listener = (_e: unknown, token: string) => cb(token)
    ipcRenderer.on('ai:stream', listener)
    return () => { ipcRenderer.removeListener('ai:stream', listener) }
  },

  // ═══ OS Shell ══════════════════════════════════════════════════════════════════
  // Open files and folders in native OS apps
  openPath: (targetPath: string) => invokeWithTimeout('shell:openPath', targetPath),
  showItemInFolder: (targetPath: string) => invokeWithTimeout('shell:showItemInFolder', targetPath),

  // ═══ Conversations ═════════════════════════════════════════════════════════════
  // Chat history stored locally in userData/conversations (one file per session)
  saveConversation: (session: ConversationInput) => invokeWithTimeout('conversations:save', session),
  listConversations: () => invokeWithTimeout('conversations:list'),
  deleteConversation: (id: string) => invokeWithTimeout('conversations:delete', id),
})

export type ConversationMessage = { id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }
export type ConversationInput = { id: string; title?: string; createdAt?: number; messages: ConversationMessage[] }
export type ConversationRecord = { version: number; id: string; title: string; createdAt: number; updatedAt: number; messages: ConversationMessage[] }
export type AiChatResult =
  | { content: string; model?: string }
  | { error: string; kind?: 'auth' | 'retry-model' | 'other' | 'cancelled'; status?: number }

export type ElectronAPI = {
  openDirectory: () => Promise<string | null>
  readDirectory: (dirPath: string) => Promise<FileEntry[] | { error: string }>
  readFile: (filePath: string) => Promise<{ content: string; path: string } | { error: string }>
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean } | { error: string }>
  getParentPath: (dirPath: string) => Promise<string>
  createFile: (filePath: string) => Promise<{ success: boolean } | { error: string }>
  createDirectory: (dirPath: string) => Promise<{ success: boolean } | { error: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean } | { error: string }>
  rename: (oldPath: string, newPath: string) => Promise<{ success: boolean } | { error: string }>
  walkDirectory: (dirPath: string) => Promise<{ name: string; path: string; isDirectory: boolean }[]>
  gitStatus: (repoPath: string) => Promise<GitStatus | { error: string }>
  gitDiff: (repoPath: string, filePath?: string) => Promise<string | { error: string }>
  gitDiffStaged: (repoPath: string) => Promise<string | { error: string }>
  gitCommit: (repoPath: string, message: string) => Promise<{ success: boolean; summary?: string } | { error: string }>
  gitCommitStaged: (repoPath: string, message: string) => Promise<{ success: boolean; summary?: string } | { error: string }>
  gitPush: (repoPath: string, branch?: string) => Promise<{ success: boolean } | { error: string }>
  gitPull: (repoPath: string) => Promise<{ success: boolean; summary?: string } | { error: string }>
  gitInit: (repoPath: string) => Promise<{ success: boolean } | { error: string }>
  gitLog: (repoPath: string, count?: number) => Promise<GitLogEntry[] | { error: string }>
  gitIsRepo: (dirPath: string) => Promise<boolean>
  gitBranches: (repoPath: string) => Promise<{ current: string; branches: string[] } | { error: string }>
  gitCreateBranch: (repoPath: string, branchName: string) => Promise<{ success: boolean } | { error: string }>
  gitSwitchBranch: (repoPath: string, branchName: string) => Promise<{ success: boolean } | { error: string }>
  gitDeleteBranch: (repoPath: string, branchName: string) => Promise<{ success: boolean } | { error: string }>
  gitStash: (repoPath: string) => Promise<{ success: boolean; message?: string } | { error: string }>
  gitStashPop: (repoPath: string) => Promise<{ success: boolean } | { error: string }>
  gitStage: (repoPath: string, files: string[]) => Promise<{ success: boolean } | { error: string }>
  gitUnstage: (repoPath: string, files: string[]) => Promise<{ success: boolean } | { error: string }>
  terminalCreate: (termId: string, cwd: string) => Promise<{ success: boolean } | { error: string }>
  terminalWrite: (termId: string, data: string) => Promise<void>
  terminalResize: (termId: string, cols: number, rows: number) => Promise<void>
  terminalKill: (termId: string) => Promise<void>
  onTerminalData: (cb: (termId: string, data: string) => void) => void
  onTerminalExit: (cb: (termId: string, exitCode: number) => void) => void
  toolExecute: (tool: { name: string; args: Record<string, any>; workspace?: string }) => Promise<{ result?: string; error?: string }>
  loadSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<{ success: boolean } | { error: string }>
  aiChat: (config: { provider: string; apiKey: string; baseUrl: string; model: string; messages: any[]; stream?: boolean; autoSelect?: boolean }) =>
    Promise<AiChatResult>
  aiCancel: () => Promise<{ success: boolean }>
  aiListModels: (config: { provider: string; apiKey: string; baseUrl: string }) => Promise<string[]>
  onAIStream: (cb: (token: string) => void) => () => void
  openPath: (targetPath: string) => Promise<void>
  showItemInFolder: (targetPath: string) => Promise<void>
  saveConversation: (session: ConversationInput) => Promise<{ success: boolean; id: string; updatedAt: number } | { error: string }>
  listConversations: () => Promise<ConversationRecord[] | { error: string }>
  deleteConversation: (id: string) => Promise<{ success: boolean } | { error: string }>
}

type FileEntry = { name: string; isDirectory: boolean; path: string }
type GitStatus = {
  branch: string; tracking: string; ahead: number; behind: number;
  staged: string[]; modified: string[]; not_added: string[]; deleted: string[];
  renamed: { from: string; to: string }[]; isClean: boolean
}
type GitLogEntry = { hash: string; date: string; message: string; author: string }
type ProviderConfig = { id: string; name: string; apiKey: string; baseUrl: string; model: string }
type Settings = { providers: ProviderConfig[]; activeProvider: string; workspacePath: string; customRules?: string; planMode?: boolean }

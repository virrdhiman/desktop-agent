import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // File System
  openDirectory: () => ipcRenderer.invoke('fs:openDirectory'),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('fs:readDirectory', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  getParentPath: (dirPath: string) => ipcRenderer.invoke('fs:getParentPath', dirPath),
  createFile: (filePath: string) => ipcRenderer.invoke('fs:createFile', filePath),
  createDirectory: (dirPath: string) => ipcRenderer.invoke('fs:createDirectory', dirPath),
  deleteFile: (filePath: string) => ipcRenderer.invoke('fs:deleteFile', filePath),
  rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  walkDirectory: (dirPath: string) => ipcRenderer.invoke('fs:walkDirectory', dirPath),

  // Git
  gitStatus: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
  gitDiff: (repoPath: string, filePath?: string) => ipcRenderer.invoke('git:diff', repoPath, filePath),
  gitDiffStaged: (repoPath: string) => ipcRenderer.invoke('git:diffStaged', repoPath),
  gitCommit: (repoPath: string, message: string) => ipcRenderer.invoke('git:commit', repoPath, message),
  gitCommitStaged: (repoPath: string, message: string) => ipcRenderer.invoke('git:commitStaged', repoPath, message),
  gitPush: (repoPath: string, branch?: string) => ipcRenderer.invoke('git:push', repoPath, branch),
  gitPull: (repoPath: string) => ipcRenderer.invoke('git:pull', repoPath),
  gitInit: (repoPath: string) => ipcRenderer.invoke('git:init', repoPath),
  gitLog: (repoPath: string, count?: number) => ipcRenderer.invoke('git:log', repoPath, count),
  gitIsRepo: (dirPath: string) => ipcRenderer.invoke('git:isRepo', dirPath),
  gitBranches: (repoPath: string) => ipcRenderer.invoke('git:branches', repoPath),
  gitCreateBranch: (repoPath: string, branchName: string) => ipcRenderer.invoke('git:createBranch', repoPath, branchName),
  gitSwitchBranch: (repoPath: string, branchName: string) => ipcRenderer.invoke('git:switchBranch', repoPath, branchName),
  gitDeleteBranch: (repoPath: string, branchName: string) => ipcRenderer.invoke('git:deleteBranch', repoPath, branchName),
  gitStash: (repoPath: string) => ipcRenderer.invoke('git:stash', repoPath),
  gitStashPop: (repoPath: string) => ipcRenderer.invoke('git:stashPop', repoPath),
  gitStage: (repoPath: string, files: string[]) => ipcRenderer.invoke('git:stage', repoPath, files),
  gitUnstage: (repoPath: string, files: string[]) => ipcRenderer.invoke('git:unstage', repoPath, files),

  // Terminal PTY
  terminalCreate: (termId: string, cwd: string) => ipcRenderer.invoke('terminal:create', termId, cwd),
  terminalWrite: (termId: string, data: string) => ipcRenderer.invoke('terminal:write', termId, data),
  terminalResize: (termId: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', termId, cols, rows),
  terminalKill: (termId: string) => ipcRenderer.invoke('terminal:kill', termId),
  onTerminalData: (cb: (termId: string, data: string) => void) => {
    ipcRenderer.on('terminal:data', (_e, termId, data) => cb(termId, data))
  },
  onTerminalExit: (cb: (termId: string, exitCode: number) => void) => {
    ipcRenderer.on('terminal:exit', (_e, termId, exitCode) => cb(termId, exitCode))
  },

  // Tool Execution (agent can call these autonomously)
  toolExecute: (tool: { name: string; args: Record<string, any> }) => ipcRenderer.invoke('tool:execute', tool),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),

  // AI (with streaming support)
  aiChat: (config: { provider: string; apiKey: string; baseUrl: string; model: string; messages: any[]; stream?: boolean }) =>
    ipcRenderer.invoke('ai:chat', config),
  onAIStream: (cb: (token: string) => void) => {
    ipcRenderer.on('ai:stream', (_e, token) => cb(token))
  },

  // Shell
  openPath: (targetPath: string) => ipcRenderer.invoke('shell:openPath', targetPath),
  showItemInFolder: (targetPath: string) => ipcRenderer.invoke('shell:showItemInFolder', targetPath),

  // Conversations
  saveConversations: (data: { messages: any[]; taskId: string }) => ipcRenderer.invoke('conversations:save', data),
  loadConversations: () => ipcRenderer.invoke('conversations:load'),
})

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
  toolExecute: (tool: { name: string; args: Record<string, any> }) => Promise<{ result?: string; error?: string }>
  loadSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<{ success: boolean } | { error: string }>
  aiChat: (config: { provider: string; apiKey: string; baseUrl: string; model: string; messages: any[]; stream?: boolean }) =>
    Promise<{ content: string } | { error: string }>
  onAIStream: (cb: (token: string) => void) => void
  openPath: (targetPath: string) => Promise<void>
  showItemInFolder: (targetPath: string) => Promise<void>
}

type FileEntry = { name: string; isDirectory: boolean; path: string }
type GitStatus = {
  branch: string; tracking: string; ahead: number; behind: number;
  staged: string[]; modified: string[]; not_added: string[]; deleted: string[];
  renamed: { from: string; to: string }[]; isClean: boolean
}
type GitLogEntry = { hash: string; date: string; message: string; author: string }
type ProviderConfig = { id: string; name: string; apiKey: string; baseUrl: string; model: string }
type Settings = { providers: ProviderConfig[]; activeProvider: string; workspacePath: string }

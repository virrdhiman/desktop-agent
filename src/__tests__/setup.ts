/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.api for all DOM tests (node-environment tests have no window)
if (typeof window !== 'undefined') Object.defineProperty(window, 'api', {
  value: {
    openDirectory: vi.fn(),
    readDirectory: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    getParentPath: vi.fn(),
    createFile: vi.fn(),
    createDirectory: vi.fn(),
    deleteFile: vi.fn(),
    rename: vi.fn(),
    walkDirectory: vi.fn().mockResolvedValue([]),
    gitStatus: vi.fn(),
    gitDiff: vi.fn(),
    gitDiffStaged: vi.fn(),
    gitApplyPatch: vi.fn(),
    gitCommit: vi.fn(),
    gitCommitStaged: vi.fn(),
    gitPush: vi.fn(),
    gitPull: vi.fn(),
    gitInit: vi.fn(),
    gitLog: vi.fn(),
    gitIsRepo: vi.fn(),
    gitBranches: vi.fn(),
    gitCreateBranch: vi.fn(),
    gitSwitchBranch: vi.fn(),
    gitDeleteBranch: vi.fn(),
    gitStash: vi.fn(),
    gitStashPop: vi.fn(),
    gitStage: vi.fn(),
    gitUnstage: vi.fn(),
    terminalCreate: vi.fn(),
    terminalWrite: vi.fn(),
    terminalResize: vi.fn(),
    terminalKill: vi.fn(),
    onTerminalData: vi.fn(),
    onTerminalExit: vi.fn(),
    toolExecute: vi.fn(),
    vscodeStatus: vi.fn().mockResolvedValue({
      connected: false,
      bridgeFile: '',
      commandsPending: 0,
      message: 'Not connected',
      setup: {
        vscodeAvailable: false,
        vsixPath: '',
        installReady: false,
        downloadUrl: 'https://code.visualstudio.com/Download',
        message: 'VS Code not found',
      },
      state: null,
    }),
    vscodeInstallBridge: vi.fn().mockResolvedValue({ result: 'Installed' }),
    vscodeOpenWorkspace: vi.fn().mockResolvedValue({ result: 'Opened' }),
    onCheckpointCreated: vi.fn(() => () => {}),
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    aiChat: vi.fn(),
    aiCancel: vi.fn().mockResolvedValue({ success: true }),
    aiListModels: vi.fn().mockResolvedValue([]),
    onAIStream: vi.fn(() => () => {}),
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
    saveConversation: vi.fn().mockResolvedValue({ success: true }),
    listConversations: vi.fn().mockResolvedValue([]),
    deleteConversation: vi.fn().mockResolvedValue({ success: true }),
    updateConversation: vi.fn().mockResolvedValue({ version: 2 }),
    exportConversation: vi.fn().mockResolvedValue({ success: true }),
    importConversations: vi.fn().mockResolvedValue([]),
    lspDiagnostics: vi.fn().mockResolvedValue([]),
    lspDefinition: vi.fn().mockResolvedValue(null),
    lspReferences: vi.fn().mockResolvedValue([]),
    lspRename: vi.fn().mockResolvedValue({ replacements: 0, updatedFiles: [], errors: [] }),
    projectMemoryLoad: vi.fn().mockResolvedValue({ content: '', updatedAt: 0, fingerprint: '' }),
    listCheckpoints: vi.fn().mockResolvedValue([]),
    restoreCheckpoint: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue({ state: 'idle', message: 'Not checked' }),
    checkForUpdates: vi.fn().mockResolvedValue({ state: 'current', message: 'Current' }),
    installUpdate: vi.fn(),
    onUpdateStatus: vi.fn(() => () => {}),
  },
  writable: true,
})

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock IntersectionObserver
Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  value: class IntersectionObserver {
    root = null
    rootMargin = ''
    thresholds = []
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  },
})

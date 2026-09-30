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
    walkDirectory: vi.fn(),
    gitStatus: vi.fn(),
    gitDiff: vi.fn(),
    gitDiffStaged: vi.fn(),
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

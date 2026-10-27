/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * VD Agent — Electron Main Process (Slim Orchestrator)
 *
 * Creates the BrowserWindow and registers all IPC handler modules:
 * - handlers/fs.ts     — File system operations
 * - handlers/git.ts    — Git operations
 * - handlers/terminal.ts — Terminal PTY management
 * - handlers/tools.ts  — Agent tool execution
 * - handlers/settings.ts — Provider configs and encrypted API keys
 * - handlers/conversations.ts — Chat history in userData/conversations
 * - handlers/ai.ts     — AI chat with streaming, model discovery, cancel
 * - handlers/shell.ts  — OS shell operations
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { isExternalWebUrl, isSameAppPage } from './navigation'

// Handler module imports
import { registerFsHandlers } from './handlers/fs'
import { registerGitHandlers } from './handlers/git'
import { registerTerminalHandlers } from './handlers/terminal'
import { registerToolHandlers } from './handlers/tools'
import { registerSettingsHandlers } from './handlers/settings'
import { registerConversationHandlers } from './handlers/conversations'
import { registerAiHandlers } from './handlers/ai'
import { registerShellHandlers } from './handlers/shell'
import { registerWorkspaceStateHandlers } from './handlers/workspaceState'
import { registerUpdateHandlers } from './handlers/updates'
import { registerDiagnosticsHandlers } from './handlers/diagnostics'
import { registerLspHandlers } from './handlers/lsp'
import { registerPrerequisiteHandlers } from './handlers/prerequisites'
import { closeBrowserSessions } from './browserTool'
import { appendDiagnosticsLog } from './diagnostics'
import { SingleIdeWindow } from './ideWindow'
import { SharedStateStore } from './sharedState'
import { userDataOverride } from './userDataPath'
import { isSafeWorkspaceFile, nextQaDialogChoice, type UnsavedChoice } from './windowClose'
import type { SharedAppState } from '../src/types'

// package.json has "type": "module", so the main bundle is ESM and has no CommonJS __dirname.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const qaUserData = userDataOverride()
if (qaUserData) app.setPath('userData', qaUserData)

/** Main BrowserWindow reference — passed to handlers that need to send events to renderer */
let mainWindow: BrowserWindow | null = null
let rendererRecoveryAttempts = 0
const getMainWindow = () => mainWindow
const sharedState = new SharedStateStore()
let ideCloseAllowed = false
let mainCloseAllowed = false
let qaDirtyStateLocked = false
const qaDialogQueue: UnsavedChoice[] = (process.env.VD_AGENT_QA_DIALOG_SEQUENCE || '')
  .split(',')
  .filter((choice): choice is UnsavedChoice => choice === 'save' || choice === 'dont-save' || choice === 'cancel')
const ideWindowManager = new SingleIdeWindow<BrowserWindow>(() => createIdeWindow())
const getIdeWindow = () => ideWindowManager.get()
const getRendererWindows = () => [mainWindow, getIdeWindow()].filter((window): window is BrowserWindow => !!window && !window.isDestroyed())

const originalConsoleError = console.error.bind(console)

function diagnosticMessage(args: unknown[]): string {
  return args.map((value) => {
    if (value instanceof Error) return value.stack || value.message
    if (typeof value === 'string') return value
    try { return JSON.stringify(value) } catch { return String(value) }
  }).join(' ')
}

function recordMainDiagnostic(args: unknown[]): void {
  try {
    appendDiagnosticsLog(app.getPath('userData'), { source: 'main', severity: 'error', message: diagnosticMessage(args) })
  } catch {
    // Diagnostics must never interfere with normal logging.
  }
}

console.error = (...args: unknown[]) => {
  recordMainDiagnostic(args)
  originalConsoleError(...args)
}

function recordUnhandledDiagnostic(message: string, stack?: string): void {
  try {
    appendDiagnosticsLog(app.getPath('userData'), { source: 'unhandled', severity: 'error', message, stack })
  } catch {
    // Diagnostics must never interfere with the original process failure.
  }
}

process.on('uncaughtException', (error) => {
  recordUnhandledDiagnostic(error?.message || String(error), error?.stack)
  originalConsoleError('VD Agent uncaught exception:', error)
})
process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason))
  recordUnhandledDiagnostic(error.message, error.stack)
  originalConsoleError('VD Agent unhandled rejection:', reason)
})

// ─── Window Management ────────────────────────────────────────────────────

function resolveWindowIcon(): string | undefined {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const candidates = [
    path.join(process.resourcesPath, iconFile),
    path.join(__dirname, '../build', iconFile),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function loadRenderer(window: BrowserWindow, role: 'main' | 'ide') {
  if (process.env.VITE_DEV_SERVER_URL) {
    const separator = process.env.VITE_DEV_SERVER_URL.includes('?') ? '&' : '?'
    void window.loadURL(`${process.env.VITE_DEV_SERVER_URL}${separator}window=${role}`)
  } else {
    void window.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: role } })
  }
}

function configureWindowLinks(window: BrowserWindow) {
  const contents = window.webContents
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (isSameAppPage(url, contents.getURL())) return
    event.preventDefault()
    if (isExternalWebUrl(url)) void shell.openExternal(url)
  })
}

type IdeBounds = { x?: number; y?: number; width: number; height: number }

function ideBoundsPath(): string {
  return path.join(app.getPath('userData'), 'ide-window.json')
}

function readIdeBounds(): IdeBounds {
  try {
    const parsed = JSON.parse(fs.readFileSync(ideBoundsPath(), 'utf8')) as Partial<IdeBounds>
    return {
      ...(typeof parsed.x === 'number' ? { x: parsed.x } : {}),
      ...(typeof parsed.y === 'number' ? { y: parsed.y } : {}),
      width: typeof parsed.width === 'number' ? Math.max(900, Math.round(parsed.width)) : 1440,
      height: typeof parsed.height === 'number' ? Math.max(600, Math.round(parsed.height)) : 920,
    }
  } catch {
    return { width: 1440, height: 920 }
  }
}

function saveIdeBounds(window: BrowserWindow): void {
  try {
    if (!window.isDestroyed() && !window.isMaximized() && !window.isMinimized()) {
      fs.mkdirSync(path.dirname(ideBoundsPath()), { recursive: true })
      fs.writeFileSync(ideBoundsPath(), JSON.stringify(window.getBounds()), 'utf8')
    }
  } catch {
    // Window position is a convenience; failure must not affect the app.
  }
}

function saveSharedFile(): boolean {
  const state = sharedState.get()
  if (!state?.fileDirty || !state.workspacePath || !state.selectedFile || !isSafeWorkspaceFile(state.workspacePath, state.selectedFile)) return false
  try {
    fs.writeFileSync(state.selectedFile, state.fileContent, 'utf8')
    sharedState.set({ ...state, fileDirty: false })
    return true
  } catch (error) {
    console.error('Failed to save unsaved file before window close:', error)
    return false
  }
}

async function unsavedChoice(window: BrowserWindow): Promise<UnsavedChoice> {
  const qaChoice = nextQaDialogChoice(qaDialogQueue)
  if (qaChoice) return qaChoice
  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    title: 'Unsaved changes',
    message: 'This window has unsaved changes.',
    detail: 'Save before closing, discard the changes, or keep the window open?',
    buttons: ['Save', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  })
  return result.response === 0 ? 'save' : result.response === 1 ? 'dont-save' : 'cancel'
}

function closeWithUnsavedChoice(window: BrowserWindow, allowClose: () => void): void {
  void unsavedChoice(window).then((choice) => {
    if (choice === 'cancel') return
    if (choice === 'save' && !saveSharedFile()) return
    qaDirtyStateLocked = false
    allowClose()
    if (!window.isDestroyed()) window.close()
  }).catch(() => {})
}

function createIdeWindow(): BrowserWindow {
  const icon = resolveWindowIcon()
  const ideWindow = new BrowserWindow({
    ...readIdeBounds(),
    minWidth: 1000,
    minHeight: 600,
    title: 'VD Agent — Code',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      sandbox: true,
    },
  })

  loadRenderer(ideWindow, 'ide')
  configureWindowLinks(ideWindow)
  ideWindow.on('move', () => saveIdeBounds(ideWindow))
  ideWindow.on('resize', () => saveIdeBounds(ideWindow))
  ideWindow.on('close', (event) => {
    if (ideCloseAllowed || !sharedState.get()?.fileDirty) return
    event.preventDefault()
    closeWithUnsavedChoice(ideWindow, () => { ideCloseAllowed = true })
  })
  ideWindow.on('closed', () => {
    saveIdeBounds(ideWindow)
    ideCloseAllowed = false
    ideWindowManager.setClosed(ideWindow)
  })
  return ideWindow
}

function createWindow() {
  const icon = resolveWindowIcon()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      sandbox: true,
    },
  })

  loadRenderer(mainWindow, 'main')
  configureWindowLinks(mainWindow)
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.webContents.openDevTools()
  mainWindow.webContents.on('render-process-gone', async (_event, details) => {
    if (details.reason === 'clean-exit' || !mainWindow || mainWindow.isDestroyed()) return
    rendererRecoveryAttempts++
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'VD Agent recovered from a crash',
      message: 'The interface process stopped unexpectedly. Your saved chats and pre-edit checkpoints are still on disk.',
      detail: `Reason: ${details.reason}. Exit code: ${details.exitCode}.`,
      buttons: rendererRecoveryAttempts <= 2 ? ['Close', 'Reload VD Agent'] : ['Close'],
      defaultId: rendererRecoveryAttempts <= 2 ? 1 : 0,
      cancelId: 0,
    })
    if (choice.response === 1 && mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    mainCloseAllowed = false
    closeBrowserSessions()
  })
  mainWindow.on('close', (event) => {
    if (mainCloseAllowed || !sharedState.get()?.fileDirty) return
    event.preventDefault()
    closeWithUnsavedChoice(mainWindow!, () => { mainCloseAllowed = true })
  })
}

function sanitizeSharedState(next: SharedAppState): SharedAppState {
  return {
    ...next,
    settings: {
      ...next.settings,
      providers: next.settings.providers.map((provider) => ({ ...provider, apiKey: '' })),
    },
  }
}

// ─── App Lifecycle ────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Set Content Security Policy headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          process.env.VITE_DEV_SERVER_URL
            ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https: http:; connect-src 'self' http://localhost:* https: ws://localhost:*"
            : "default-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https: http:; connect-src 'self' https: ws:"
        ],
      },
    })
  })
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  createWindow()

  ipcMain.handle('window:role', (event) => BrowserWindow.fromWebContents(event.sender) === getIdeWindow() ? 'ide' : 'main')
  ipcMain.handle('window:openIde', () => {
    const result = ideWindowManager.openOrFocus()
    return { opened: true, created: result.created }
  })
  ipcMain.handle('window:focusMain', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      return { success: true }
    }
    return { success: false, error: 'Main Agent window is not available.' }
  })
  ipcMain.handle('qa:set-dialog-sequence', (_event, choices: unknown) => {
    if (!Array.isArray(choices)) return { success: false }
    qaDialogQueue.splice(0, qaDialogQueue.length, ...choices.filter((choice): choice is UnsavedChoice => choice === 'save' || choice === 'dont-save' || choice === 'cancel'))
    return { success: true }
  })
  ipcMain.handle('qa:set-dirty-state', (_event, filePath: unknown, content: unknown) => {
    const current = sharedState.get()
    if (!current || typeof filePath !== 'string' || typeof content !== 'string' || !isSafeWorkspaceFile(current.workspacePath, filePath)) return { success: false }
    const next = sanitizeSharedState({ ...current, selectedFile: filePath, openFiles: [...new Set([...current.openFiles, filePath])], fileContent: content, fileDirty: true })
    qaDirtyStateLocked = true
    sharedState.set(next)
    for (const window of getRendererWindows()) window.webContents.send('shared-state:changed', next)
    return { success: true }
  })
  ipcMain.handle('qa:close-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed()) return { success: false }
    window.close()
    return { success: true }
  })
  ipcMain.handle('shared-state:get', () => sharedState.get())
  ipcMain.on('shared-state:publish', (event, next: SharedAppState) => {
    if (!next || next.version !== 1 || typeof next.workspacePath !== 'string') return
    if (qaDirtyStateLocked && !next.fileDirty) return
    const safeState = sanitizeSharedState(next)
    sharedState.set(safeState)
    for (const window of getRendererWindows()) {
      if (window.webContents !== event.sender) window.webContents.send('shared-state:changed', safeState)
    }
  })

  // Register all IPC handler modules
  registerFsHandlers(getMainWindow)
  registerGitHandlers()
  registerTerminalHandlers(getRendererWindows)
  registerToolHandlers()
  registerSettingsHandlers()
  registerConversationHandlers()
  registerWorkspaceStateHandlers()
  registerUpdateHandlers(getRendererWindows)
  registerDiagnosticsHandlers()
  registerLspHandlers()
  registerAiHandlers(getRendererWindows)
  registerShellHandlers()
  registerPrerequisiteHandlers(getMainWindow)
  // The renderer owns the single accessible menu bar; avoid a duplicate native menu.
  Menu.setApplicationMenu(null)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', closeBrowserSessions)

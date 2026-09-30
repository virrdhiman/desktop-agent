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
import { app, BrowserWindow, dialog, session, shell } from 'electron'
import path from 'path'
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

// package.json has "type": "module", so the main bundle is ESM and has no CommonJS __dirname.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Main BrowserWindow reference — passed to handlers that need to send events to renderer */
let mainWindow: BrowserWindow | null = null
let rendererRecoveryAttempts = 0
const getMainWindow = () => mainWindow

// ─── Window Management ────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      sandbox: true,
    },
  })

  // Dev server or production build
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Links (API key pages, credits) open in the system browser, never in a new app window.
  const contents = mainWindow.webContents
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (isSameAppPage(url, contents.getURL())) return
    event.preventDefault()
    if (isExternalWebUrl(url)) void shell.openExternal(url)
  })
  contents.on('render-process-gone', async (_event, details) => {
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

  mainWindow.on('closed', () => { mainWindow = null })
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

  // Register all IPC handler modules
  registerFsHandlers(getMainWindow)
  registerGitHandlers()
  registerTerminalHandlers(getMainWindow)
  registerToolHandlers()
  registerSettingsHandlers()
  registerConversationHandlers()
  registerWorkspaceStateHandlers()
  registerUpdateHandlers(getMainWindow)
  registerAiHandlers(getMainWindow)
  registerShellHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

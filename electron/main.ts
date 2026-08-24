/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Freebuff Agent — Electron Main Process (Slim Orchestrator)
 *
 * Creates the BrowserWindow and registers all IPC handler modules:
 * - handlers/fs.ts     — File system operations
 * - handlers/git.ts    — Git operations
 * - handlers/terminal.ts — Terminal PTY management
 * - handlers/tools.ts  — Agent tool execution (33 tools)
 * - handlers/settings.ts — Provider configs, API keys, conversations
 * - handlers/ai.ts     — AI chat with streaming
 * - handlers/shell.ts  — OS shell operations
 */
import { app, BrowserWindow, session } from 'electron'
import path from 'path'

// Handler module imports
import { registerFsHandlers } from './handlers/fs'
import { registerGitHandlers } from './handlers/git'
import { registerTerminalHandlers } from './handlers/terminal'
import { registerToolHandlers } from './handlers/tools'
import { registerSettingsHandlers } from './handlers/settings'
import { registerAiHandlers } from './handlers/ai'
import { registerShellHandlers } from './handlers/shell'

/** Main BrowserWindow reference — passed to handlers that need to send events to renderer */
let mainWindow: BrowserWindow | null = null
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
      preload: path.join(__dirname, 'preload.js'),
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

  createWindow()

  // Register all IPC handler modules
  registerFsHandlers(getMainWindow)
  registerGitHandlers()
  registerTerminalHandlers(getMainWindow)
  registerToolHandlers()
  registerSettingsHandlers()
  registerAiHandlers(getMainWindow)
  registerShellHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

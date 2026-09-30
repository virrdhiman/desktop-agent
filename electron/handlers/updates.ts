/** Packaged-app update flow with release metadata integrity checks. Development builds stay offline. */
import { app, ipcMain, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import fs from 'fs'
import path from 'path'

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'current' | 'error' | 'unavailable'
  message: string
  version?: string
  percent?: number
}

let status: UpdateStatus = { state: 'idle', message: 'Updates have not been checked.' }
let initialized = false

function updater() {
  const { autoUpdater } = electronUpdater
  return autoUpdater
}

export function registerUpdateHandlers(getMainWindow: () => BrowserWindow | null) {
  const publish = (next: UpdateStatus) => {
    status = next
    getMainWindow()?.webContents.send('updates:status', next)
  }

  if (!initialized) {
    initialized = true
    const autoUpdater = updater()
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => publish({ state: 'checking', message: 'Checking for a verified release update...' }))
    autoUpdater.on('update-available', (info) => publish({ state: 'available', message: `Downloading VD Agent ${info.version}...`, version: info.version }))
    autoUpdater.on('update-not-available', (info) => publish({ state: 'current', message: `VD Agent ${info.version} is current.`, version: info.version }))
    autoUpdater.on('download-progress', (progress) => publish({ state: 'downloading', message: `Downloading update: ${Math.round(progress.percent)}%`, percent: progress.percent }))
    autoUpdater.on('update-downloaded', (info) => publish({ state: 'downloaded', message: `VD Agent ${info.version} is ready. Restart to install.`, version: info.version }))
    autoUpdater.on('error', (error) => publish({ state: 'error', message: `Update check failed: ${error.message}` }))
  }

  ipcMain.handle('updates:status', () => status)
  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) {
      publish({ state: 'unavailable', message: 'Update checks run only in an installed release build.' })
      return status
    }
    try {
      await updater().checkForUpdates()
      return status
    } catch (err: any) {
      publish({ state: 'error', message: `Update check failed: ${err?.message || String(err)}` })
      return status
    }
  })
  ipcMain.handle('updates:install', () => {
    if (status.state !== 'downloaded') return { error: 'No downloaded update is ready.' }
    updater().quitAndInstall(false, true)
    return { success: true }
  })

  if (app.isPackaged) {
    setTimeout(async () => {
      let enabled = false
      try {
        const raw = await fs.promises.readFile(path.join(app.getPath('userData'), 'settings.json'), 'utf-8')
        enabled = JSON.parse(raw).autoUpdate === true
      } catch {}
      if (!enabled) return
      void updater().checkForUpdates().catch(() => {})
    }, 15_000)
  }
}

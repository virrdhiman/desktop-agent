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

async function updatePreferences(): Promise<{ autoUpdate?: boolean; updateChannel?: string }> {
  try {
    return JSON.parse(await fs.promises.readFile(path.join(app.getPath('userData'), 'settings.json'), 'utf-8'))
  } catch { return {} }
}

function updater() {
  const { autoUpdater } = electronUpdater
  return autoUpdater
}

function configureUpdateFeed() {
  const configured = process.env.VD_AGENT_UPDATE_URL?.trim()
  if (!configured) return
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error('VD_AGENT_UPDATE_URL must be an absolute http(s) URL')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VD_AGENT_UPDATE_URL must use http or https')
  }
  updater().setFeedURL({ provider: 'generic', url: url.toString().replace(/\/?$/, '/') })
}

export function registerUpdateHandlers(getWindows: () => BrowserWindow[]) {
  const publish = (next: UpdateStatus) => {
    status = next
    for (const window of getWindows()) if (!window.isDestroyed()) window.webContents.send('updates:status', next)
  }

  if (!initialized) {
    initialized = true
    const autoUpdater = updater()
    configureUpdateFeed()
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
      updater().allowPrerelease = (await updatePreferences()).updateChannel === 'beta'
      await updater().checkForUpdates()
      return status
    } catch (err: any) {
      publish({ state: 'error', message: `Update check failed: ${err?.message || String(err)}` })
      return status
    }
  })
  ipcMain.handle('updates:install', () => {
    if (status.state !== 'downloaded') return { error: 'No downloaded update is ready.' }
    // The user already confirmed from the UI; silent mode keeps the handoff unattended.
    updater().quitAndInstall(true, true)
    return { success: true }
  })

  if (app.isPackaged) {
    setTimeout(async () => {
      const preferences = await updatePreferences()
      if (preferences.autoUpdate !== true) return
      updater().allowPrerelease = preferences.updateChannel === 'beta'
      void updater().checkForUpdates().catch(() => {})
    }, 15_000)
  }
}

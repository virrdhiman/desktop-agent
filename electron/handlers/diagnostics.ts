import { app, dialog, ipcMain } from 'electron'
import fs from 'fs'
import { buildDiagnosticsReport } from '../diagnostics'
import { SETTINGS_PATH } from './settings'

export function registerDiagnosticsHandlers() {
  ipcMain.handle('diagnostics:export', async () => {
    try {
      let settings: any = {}
      try { settings = JSON.parse(await fs.promises.readFile(SETTINGS_PATH, 'utf8')) } catch {}
      const report = await buildDiagnosticsReport({
        userDataDir: app.getPath('userData'),
        settings,
        appVersion: app.getVersion(),
        packaged: app.isPackaged,
      })
      const chosen = await dialog.showSaveDialog({
        title: 'Export private VD Agent diagnostics',
        defaultPath: `vd-agent-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (chosen.canceled || !chosen.filePath) return { cancelled: true }
      await fs.promises.writeFile(chosen.filePath, JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 })
      return { success: true, path: chosen.filePath }
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })
}

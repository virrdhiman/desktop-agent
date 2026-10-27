import { app, clipboard, dialog, ipcMain } from 'electron'
import fs from 'fs'
import { appendDiagnosticsLog, buildDiagnosticsReport, formatDiagnosticsReport, readDiagnosticsLines, type DiagnosticsLogEvent, type DiagnosticsViewerPayload } from '../diagnostics'
import { settingsPath } from './settings'
import { APP_NAME } from '../../shared/brand'

async function loadDiagnosticsSettings(): Promise<any> {
  try { return JSON.parse(await fs.promises.readFile(settingsPath(), 'utf8')) } catch { return {} }
}

function validLogEvent(value: unknown): DiagnosticsLogEvent | null {
  if (!value || typeof value !== 'object') return null
  const event = value as Record<string, unknown>
  const source = event.source === 'main' || event.source === 'renderer' || event.source === 'unhandled' ? event.source : null
  const severity = event.severity === 'debug' || event.severity === 'info' || event.severity === 'warn' || event.severity === 'error' ? event.severity : null
  if (!source || !severity || typeof event.message !== 'string') return null
  return {
    source,
    severity,
    message: event.message.slice(0, 8_000),
    ...(typeof event.stack === 'string' ? { stack: event.stack.slice(0, 8_000) } : {}),
  }
}

export function registerDiagnosticsHandlers() {
  ipcMain.handle('diagnostics:copy', async (_event, value: unknown) => {
    if (typeof value !== 'string' || value.length > 2 * 1024 * 1024) return { success: false, error: 'Diagnostics text is invalid or too large.' }
    clipboard.writeText(value)
    return { success: true }
  })

  ipcMain.handle('diagnostics:record', async (_event, value: unknown) => {
    const event = validLogEvent(value)
    if (!event) return { success: false, error: 'Invalid diagnostics event.' }
    appendDiagnosticsLog(app.getPath('userData'), event)
    return { success: true }
  })

  ipcMain.handle('diagnostics:read', async (): Promise<DiagnosticsViewerPayload> => {
    const settings = await loadDiagnosticsSettings()
    const report = await buildDiagnosticsReport({
      userDataDir: app.getPath('userData'),
      settings,
      appVersion: app.getVersion(),
      packaged: app.isPackaged,
    })
    const lines = await readDiagnosticsLines(app.getPath('userData'))
    return { report, lines, reportText: formatDiagnosticsReport(report, lines) }
  })

  ipcMain.handle('diagnostics:export', async () => {
    try {
      const settings = await loadDiagnosticsSettings()
      const report = await buildDiagnosticsReport({
        userDataDir: app.getPath('userData'),
        settings,
        appVersion: app.getVersion(),
        packaged: app.isPackaged,
      })
      const chosen = await dialog.showSaveDialog({
        title: `Export private ${APP_NAME} diagnostics`,
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

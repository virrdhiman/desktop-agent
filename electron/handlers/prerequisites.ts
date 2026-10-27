import { app, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  canOpenOfficialInstaller,
  getSetupCatalog,
  isExpectedSha256,
  type SetupItemId,
} from '../../src/lib/prerequisiteSetup'
import { downloadAndVerify, PrerequisiteDownloadError, type DownloadProgress } from '../prerequisiteDownload'
import { APP_NAME } from '../../shared/brand'

export type PrerequisiteProgress = Omit<DownloadProgress, 'state'> & {
  id: SetupItemId
  state: 'queued' | 'downloading' | 'verifying' | 'launching' | 'ready' | 'cancelled' | 'failed'
  message?: string
}

export type PrerequisiteDownloadResult =
  | { success: true; path: string; sha256: string; bytes: number }
  | { success: false; cancelled?: boolean; error: string }

type PrerequisiteRequest = {
  id: SetupItemId
  consent: boolean
  expectedSha256: string
}

const activeDownloads = new Map<number, { id: SetupItemId; controller: AbortController }>()

function isSetupItemId(value: unknown): value is SetupItemId {
  return value === 'vscode' || value === 'bridge' || value === 'ollama'
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}

function sendProgress(event: IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null, progress: PrerequisiteProgress): void {
  if (!event.sender.isDestroyed()) {
    event.sender.send('prerequisites:progress', progress)
  } else {
    getMainWindow()?.webContents.send('prerequisites:progress', progress)
  }
}

function catalogForCurrentPlatform() {
  return getSetupCatalog(process.platform)
}

function workDirectory(): string {
  return path.resolve(app.getPath('userData'), '.work', 'prerequisites')
}

export function registerPrerequisiteHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('prerequisites:list', () => catalogForCurrentPlatform())

  ipcMain.handle('prerequisites:openOfficial', async (event, request: { id?: unknown; consent?: unknown }) => {
    if (!isSetupItemId(request?.id) || request.consent !== true) {
      return { success: false, error: 'Explicit consent is required for this prerequisite.' }
    }
    const item = catalogForCurrentPlatform().find((candidate) => candidate.id === request.id)
    if (!item || !canOpenOfficialInstaller(item)) return { success: false, error: 'Official prerequisite source is unavailable.' }
    try {
      await shell.openExternal(item.officialUrl)
      return { success: true }
    } catch (error) {
      return { success: false, error: `The official source could not be opened: ${errorMessage(error)}` }
    }
  })

  ipcMain.handle('prerequisites:download', async (event, request: PrerequisiteRequest): Promise<PrerequisiteDownloadResult> => {
    if (!isSetupItemId(request?.id)) return { success: false, error: 'Unknown prerequisite.' }
    if (request.consent !== true) return { success: false, error: 'Explicit consent is required before downloading.' }
    if (!isExpectedSha256(request.expectedSha256)) return { success: false, error: 'A valid expected SHA-256 hash is required before downloading.' }

    const existing = activeDownloads.get(event.sender.id)
    if (existing) return { success: false, error: `A prerequisite download is already running for ${existing.id}.` }

    const item = catalogForCurrentPlatform().find((candidate) => candidate.id === request.id)
    if (!item?.downloadUrl || !item.artifactFileName) {
      return { success: false, error: item?.unavailableReason || 'No verified installer artifact is available for this operating system.' }
    }

    const controller = new AbortController()
    activeDownloads.set(event.sender.id, { id: request.id, controller })
    const progress = (state: PrerequisiteProgress['state'], extra: Partial<PrerequisiteProgress> = {}) =>
      sendProgress(event, getMainWindow, { id: request.id, state, bytesReceived: 0, ...extra })

    progress('queued', { message: `Preparing a download in ${APP_NAME} user data.` })
    try {
      await fs.mkdir(workDirectory(), { recursive: true })
      const filename = `${request.id}-${Date.now()}-${randomUUID()}-${path.basename(item.artifactFileName)}`
      const destination = path.join(workDirectory(), filename)
      const result = await downloadAndVerify({
        url: item.downloadUrl,
        destination,
        expectedSha256: request.expectedSha256,
        signal: controller.signal,
        onProgress: (update) => progress(update.state, update),
      })

      if (controller.signal.aborted) {
        progress('cancelled', { message: 'Download cancelled before launch.' })
        return { success: false, cancelled: true, error: 'Download cancelled.' }
      }

      progress('launching', { message: 'Verified SHA-256. Opening the official installer.' })
      const openError = await shell.openPath(result.path)
      if (openError) {
        progress('failed', { message: openError })
        return { success: false, error: `The verified installer could not be opened: ${openError}` }
      }
      progress('ready', { bytesReceived: result.bytes, percent: 100, message: 'Verified installer launched. Any OS permission prompt comes from the official installer.' })
      return { success: true, ...result }
    } catch (error) {
      const cancelled = error instanceof PrerequisiteDownloadError && error.code === 'CANCELLED'
      const message = cancelled ? 'Download cancelled.' : errorMessage(error)
      progress(cancelled ? 'cancelled' : 'failed', { message })
      return { success: false, ...(cancelled ? { cancelled: true } : {}), error: message }
    } finally {
      activeDownloads.delete(event.sender.id)
    }
  })

  ipcMain.handle('prerequisites:cancel', (event, id?: unknown) => {
    const active = activeDownloads.get(event.sender.id)
    if (!active || (id !== undefined && id !== active.id)) return { success: false, error: 'No matching prerequisite download is running.' }
    active.controller.abort()
    return { success: true }
  })
}

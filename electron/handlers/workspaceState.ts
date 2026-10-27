/** IPC for local project memory and resumable file checkpoints. */
import { app, ipcMain } from 'electron'
import path from 'path'
import { listCheckpoints, restoreCheckpoint } from '../checkpointStore'
import { loadProjectMemory, loadProjectNotes, saveProjectNotes } from '../projectMemoryStore'

const checkpointsDir = () => path.join(app.getPath('userData'), 'checkpoints')
const memoriesDir = () => path.join(app.getPath('userData'), 'project-memory')
const notesDir = () => path.join(app.getPath('userData'), 'project-notes')

export function registerWorkspaceStateHandlers() {
  ipcMain.handle('projectMemory:load', async (_event, workspace: string, force = false) => {
    try {
      if (!workspace) throw new Error('Open a workspace first')
      return await loadProjectMemory(memoriesDir(), workspace, force)
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  ipcMain.handle('projectNotes:load', async (_event, workspace: string) => {
    try {
      if (!workspace) throw new Error('Open a workspace first')
      return await loadProjectNotes(notesDir(), workspace)
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  ipcMain.handle('projectNotes:save', async (_event, workspace: string, content: string) => {
    try {
      if (!workspace) throw new Error('Open a workspace first')
      return await saveProjectNotes(notesDir(), workspace, typeof content === 'string' ? content : '')
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  ipcMain.handle('checkpoints:list', async (_event, sessionId: string) => {
    try {
      return await listCheckpoints(checkpointsDir(), sessionId)
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  ipcMain.handle('checkpoints:restore', async (_event, sessionId: string, checkpointId: string) => {
    try {
      const restored = await restoreCheckpoint(checkpointsDir(), sessionId, checkpointId)
      return {
        success: true,
        restored: restored.restored,
        removed: restored.removed,
        skipped: restored.skipped,
        workspace: restored.checkpoint.workspace,
      }
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })
}

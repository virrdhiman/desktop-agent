/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Conversation persistence IPC handlers.
 * Sessions live in `<userData>/conversations/<sessionId>.json` on the user's machine.
 */
import { app, dialog, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { deleteConversation, isValidSessionId, listConversations, normalizeConversation, readConversation, saveConversation } from '../conversationStore'
import { loadConfiguredApiKeys } from './settings'

const conversationsDir = () => path.join(app.getPath('userData'), 'conversations')

export function registerConversationHandlers() {
  ipcMain.handle('conversations:save', async (_event, session: {
    id: string
    title?: string
    createdAt?: number
    messages: unknown[]
    pinned?: boolean
    summary?: string
    resume?: Record<string, unknown>
  }) => {
    try {
      const saved = await saveConversation(conversationsDir(), session, await loadConfiguredApiKeys())
      return { success: true, id: saved.id, updatedAt: saved.updatedAt }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('conversations:update', async (_event, id: string, patch: { title?: string; pinned?: boolean }) => {
    try {
      const existing = await readConversation(conversationsDir(), id)
      if (!existing) throw new Error('Conversation not found')
      const saved = await saveConversation(conversationsDir(), { ...existing, ...patch }, await loadConfiguredApiKeys())
      return saved
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('conversations:export', async (_event, id: string) => {
    try {
      const existing = await readConversation(conversationsDir(), id)
      if (!existing) throw new Error('Conversation not found')
      const chosen = await dialog.showSaveDialog({
        title: 'Export VD Agent chat',
        defaultPath: `${existing.title.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 50) || 'vd-chat'}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (chosen.canceled || !chosen.filePath) return { cancelled: true }
      await fs.promises.writeFile(chosen.filePath, JSON.stringify(existing, null, 2), 'utf-8')
      return { success: true, path: chosen.filePath }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('conversations:import', async () => {
    try {
      const chosen = await dialog.showOpenDialog({
        title: 'Import VD Agent chats',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (chosen.canceled) return []
      const imported = []
      const secrets = await loadConfiguredApiKeys()
      for (const file of chosen.filePaths) {
        const raw = JSON.parse(await fs.promises.readFile(file, 'utf-8'))
        const proposed = typeof raw?.id === 'string' && isValidSessionId(raw.id) ? raw.id : 'imported'
        const id = `${proposed}-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 100)
        const normalized = normalizeConversation(raw, id, Date.now())
        if (!normalized) continue
        imported.push(await saveConversation(conversationsDir(), { ...normalized, id }, secrets))
      }
      return imported
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('conversations:list', async () => {
    try {
      return await listConversations(conversationsDir())
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('conversations:delete', async (_event, id: string) => {
    try {
      await deleteConversation(conversationsDir(), id)
      await fs.promises.rm(path.join(app.getPath('userData'), 'checkpoints', id), { recursive: true, force: true })
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })
}

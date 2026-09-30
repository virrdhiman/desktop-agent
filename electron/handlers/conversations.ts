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
import { app, ipcMain } from 'electron'
import path from 'path'
import { deleteConversation, listConversations, saveConversation } from '../conversationStore'
import { loadConfiguredApiKeys } from './settings'

const conversationsDir = () => path.join(app.getPath('userData'), 'conversations')

export function registerConversationHandlers() {
  ipcMain.handle('conversations:save', async (_event, session: { id: string; title?: string; createdAt?: number; messages: unknown[] }) => {
    try {
      const saved = await saveConversation(conversationsDir(), session, await loadConfiguredApiKeys())
      return { success: true, id: saved.id, updatedAt: saved.updatedAt }
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
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })
}

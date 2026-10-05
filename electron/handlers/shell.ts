/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Shell IPC Handlers
 * OS-level operations: open files, show in file manager
 */
import { ipcMain, shell } from 'electron'

export function registerShellHandlers() {
  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    if (/^https?:\/\//i.test(targetPath)) {
      await shell.openExternal(targetPath)
      return
    }
    await shell.openPath(targetPath)
  })

  ipcMain.handle('shell:showItemInFolder', async (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath)
  })
}

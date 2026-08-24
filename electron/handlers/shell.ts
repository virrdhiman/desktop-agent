/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Shell IPC Handlers
 * OS-level operations: open files, show in file manager
 */
import { ipcMain, shell } from 'electron'

export function registerShellHandlers() {
  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    await shell.openPath(targetPath)
  })

  ipcMain.handle('shell:showItemInFolder', async (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath)
  })
}

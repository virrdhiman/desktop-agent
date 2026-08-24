/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * File System IPC Handlers
 * Operations: open, read, write, create, delete, rename, walk directories
 */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'

export function registerFsHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('fs:openDirectory', async () => {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
      properties: ['openDirectory'],
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:readDirectory', async (_event, dirPath: string) => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      return entries
        .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== '__pycache__' && e.name !== '.git')
        .map((e) => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          path: path.join(dirPath, e.name),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      const stat = await fs.promises.stat(filePath)
      if (stat.size > 4 * 1024 * 1024) {
        return { error: 'File too large (>4MB)' }
      }
      const content = await fs.promises.readFile(filePath, 'utf-8')
      return { content, path: filePath }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    try {
      await fs.promises.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('fs:getParentPath', async (_event, dirPath: string) => {
    return path.dirname(dirPath)
  })

  ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
    try {
      await fs.promises.writeFile(filePath, '', 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('fs:createDirectory', async (_event, dirPath: string) => {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('fs:deleteFile', async (_event, filePath: string) => {
    try {
      await fs.promises.unlink(filePath)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      await fs.promises.rename(oldPath, newPath)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('fs:walkDirectory', async (_event, dirPath: string) => {
    const results: { name: string; path: string; isDirectory: boolean }[] = []
    async function walk(dir: string, depth: number) {
      if (depth > 8) return
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
          const fullPath = path.join(dir, entry.name)
          results.push({ name: entry.name, path: fullPath, isDirectory: entry.isDirectory() })
          if (entry.isDirectory()) await walk(fullPath, depth + 1)
        }
      } catch {}
    }
    await walk(dirPath, 0)
    return results
  })
}

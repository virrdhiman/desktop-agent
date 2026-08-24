/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Terminal PTY IPC Handlers
 * Real terminal management using node-pty (PowerShell on Windows, bash on Mac/Linux)
 */
import { ipcMain, BrowserWindow } from 'electron'
import { spawn as ptySpawn } from 'node-pty'

interface IPtyInstance {
  pty: any
  buffer: string
}

export function registerTerminalHandlers(getMainWindow: () => BrowserWindow | null) {
  const terminals: Map<string, IPtyInstance> = new Map()

  ipcMain.handle('terminal:create', async (_event, termId: string, cwd: string) => {
    try {
      const shellPath = process.platform === 'win32' ? 'powershell.exe' : 'bash'
      const pty = ptySpawn(shellPath, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: cwd || process.env.HOME || process.cwd(),
        env: process.env as Record<string, string>,
      })

      const termInstance: IPtyInstance = { pty, buffer: '' }
      terminals.set(termId, termInstance)

      pty.onData((data: string) => {
        termInstance.buffer += data
        getMainWindow()?.webContents.send('terminal:data', termId, data)
      })

      pty.onExit(({ exitCode }: { exitCode: number }) => {
        getMainWindow()?.webContents.send('terminal:exit', termId, exitCode)
        terminals.delete(termId)
      })

      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('terminal:write', async (_event, termId: string, data: string) => {
    const term = terminals.get(termId)
    if (term) term.pty.write(data)
  })

  ipcMain.handle('terminal:resize', async (_event, termId: string, cols: number, rows: number) => {
    const term = terminals.get(termId)
    if (term) term.pty.resize(cols, rows)
  })

  ipcMain.handle('terminal:kill', async (_event, termId: string) => {
    const term = terminals.get(termId)
    if (term) {
      term.pty.kill()
      terminals.delete(termId)
    }
  })
}

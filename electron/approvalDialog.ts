/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import { BrowserWindow } from 'electron'
import { buildApprovalHtml } from './approvalPage'

/** Native message boxes clip long text. This window scrolls the full command. */
export function confirmAgentAction(parent: BrowserWindow | null, message: string, detail: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (allowed: boolean) => {
      if (settled) return
      settled = true
      resolve(allowed)
      if (!win.isDestroyed()) win.close()
    }

    const owner = parent && !parent.isDestroyed() ? parent : undefined
    const win = new BrowserWindow({
      parent: owner,
      modal: Boolean(owner),
      width: 720,
      height: 520,
      show: false,
      autoHideMenuBar: true,
      title: 'Approve agent action',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    win.on('closed', () => finish(false))
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('https://approve.vd-agent.invalid/')) return
      event.preventDefault()
      finish(url.endsWith('/allow'))
    })

    const html = buildApprovalHtml(message, detail)
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(() => {
      if (!win.isDestroyed()) win.show()
    }).catch(() => finish(false))
  })
}

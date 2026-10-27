/**
 * @author Virender Dhiman
 * @year 2026
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */
import { BrowserWindow } from 'electron'
import { buildApprovalHtml } from './approvalPage'

/** Native message boxes clip long text. This window scrolls the full command. */
export type AgentApproval = { action: 'approve' | 'reject' | 'edit'; payload?: string }

export function confirmAgentAction(parent: BrowserWindow | null, message: string, detail: string, editable?: string): Promise<AgentApproval> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (approval: AgentApproval) => {
      if (settled) return
      settled = true
      resolve(approval)
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

    win.on('closed', () => finish({ action: 'reject' }))
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('https://approve.vd-agent.invalid/')) return
      event.preventDefault()
      if (url.endsWith('/allow') || url.endsWith('/approve')) finish({ action: 'approve' })
      else if (url.includes('/edit')) {
        const payload = new URL(url).searchParams.get('payload')
        finish({ action: 'edit', payload: payload === null ? '' : payload })
      } else finish({ action: 'reject' })
    })

    const html = buildApprovalHtml(message, detail, editable)
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(() => {
      if (!win.isDestroyed()) win.show()
    }).catch(() => finish({ action: 'reject' }))
  })
}

import { ipcMain, type BrowserWindow } from 'electron'
import { sanitizeAgentActivityEvent, type AgentActivityEvent } from '../src/lib/agentActivity'

type GetWindows = () => BrowserWindow[]
type CancelCommands = (runId?: string) => void
type GetKnownSecrets = () => Promise<string[]>

function isLiveRenderer(senderId: number, getWindows: GetWindows): boolean {
  return getWindows().some((window) => !window.isDestroyed() && window.webContents.id === senderId)
}

/** For main-process events such as command output; sanitization runs before every send. */
export function broadcastAgentActivity(getWindows: GetWindows, input: unknown, knownSecrets: string[] = []): void {
  const safe = sanitizeAgentActivityEvent(input, knownSecrets)
  if (!safe) return
  for (const window of getWindows()) {
    if (!window.isDestroyed()) window.webContents.send('agent:activity', safe)
  }
}

/** Renderer progress is allow-listed, bounded, sanitized, and never logged. */
export function registerAgentActivityBridge(
  getWindows: GetWindows,
  cancelCommands: CancelCommands,
  getKnownSecrets: GetKnownSecrets = async () => [],
): void {
  let publishQueue = Promise.resolve()
  ipcMain.on('agent:activity:publish', (event, payload: unknown) => {
    if (!isLiveRenderer(event.sender.id, getWindows)) return
    publishQueue = publishQueue.then(async () => {
      const knownSecrets = await getKnownSecrets()
      const safe = sanitizeAgentActivityEvent(payload, knownSecrets)
      if (!safe) return
      for (const window of getWindows()) {
        if (!window.isDestroyed() && window.webContents.id !== event.sender.id) {
          window.webContents.send('agent:activity', safe)
        }
      }
    }).catch(() => {})
  })

  ipcMain.on('agent:activity:cancel', (event, runId?: unknown) => {
    if (!isLiveRenderer(event.sender.id, getWindows)) return
    cancelCommands(typeof runId === 'string' ? runId.slice(0, 128) : undefined)
  })
}

export function broadcastCommandActivity(
  getWindows: GetWindows,
  event: Extract<AgentActivityEvent, { type: 'command-output' }>,
  knownSecrets: string[] = [],
): void {
  broadcastAgentActivity(getWindows, event, knownSecrets)
}

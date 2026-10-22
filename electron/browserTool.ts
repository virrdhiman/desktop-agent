/** Hidden BrowserWindow-backed browser tool. All browser state stays in the main process. */
import { BrowserWindow } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { resolvesInsideWorkspace } from './toolPolicy'
import {
  BROWSER_NAVIGATION_TIMEOUT_MS,
  BROWSER_OPERATION_TIMEOUT_MS,
  DEFAULT_BROWSER_VIEWPORT,
  MAX_BROWSER_TEXT_CHARS,
  boundedBrowserText,
  normalizeBrowserSessionId,
  safeBrowserUrlLabel,
  validateBrowserRequest,
  validateBrowserUrl,
  type BrowserToolInput,
} from './browserToolValidation'

type BrowserSessionState = {
  window: BrowserWindow
  url?: string
  busy: boolean
}

const browserSessions = new Map<string, BrowserSessionState>()
const MAX_BROWSER_SESSIONS = 4
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024

class BrowserToolError extends Error {}

function assertActive(state: BrowserSessionState): void {
  if (state.window.isDestroyed() || state.window.webContents.isDestroyed()) {
    throw new BrowserToolError('The browser page was closed. Use browser open_url again.')
  }
}

function createBrowserSession(sessionId: string): BrowserSessionState {
  if (browserSessions.size >= MAX_BROWSER_SESSIONS) {
    throw new BrowserToolError('The browser has four active sessions. Turn the browser tool off and on in Settings to close them before opening another.')
  }
  const browserWindow = new BrowserWindow({
    width: DEFAULT_BROWSER_VIEWPORT.width,
    height: DEFAULT_BROWSER_VIEWPORT.height,
    show: false,
    useContentSize: true,
    focusable: false,
    autoHideMenuBar: true,
    title: 'VD Agent Browser Tool',
    webPreferences: {
      // No persist: prefix: pages do not share app/browser cookies or saved storage.
      partition: `vd-agent-browser-${crypto.randomUUID()}`,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: false,
      disableDialogs: true,
      navigateOnDragDrop: false,
    },
  })
  const state: BrowserSessionState = { window: browserWindow, busy: false }
  browserSessions.set(sessionId, state)

  browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const browserSession = browserWindow.webContents.session
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  browserSession.setPermissionCheckHandler(() => false)
  browserSession.setDevicePermissionHandler(() => false)
  browserSession.on('will-download', (event) => event.preventDefault())
  browserWindow.webContents.on('login', (event, _details, _authInfo, callback) => {
    event.preventDefault()
    callback()
  })
  const rejectNonHttpNavigation = (event: Electron.Event, url: string) => {
    if (!validateBrowserUrl(url).ok) event.preventDefault()
  }
  browserWindow.webContents.on('will-navigate', rejectNonHttpNavigation)
  browserWindow.webContents.on('will-redirect', rejectNonHttpNavigation)
  browserWindow.webContents.on('will-frame-navigate', (event) => rejectNonHttpNavigation(event, event.url))
  const forget = () => {
    if (browserSessions.get(sessionId)?.window === browserWindow) browserSessions.delete(sessionId)
  }
  browserWindow.on('closed', forget)
  browserWindow.webContents.on('destroyed', forget)
  browserWindow.webContents.on('render-process-gone', () => {
    forget()
    if (!browserWindow.isDestroyed()) browserWindow.destroy()
  })
  return state
}

function getBrowserSession(sessionId: string): BrowserSessionState | undefined {
  const state = browserSessions.get(sessionId)
  if (!state) return undefined
  if (state.window.isDestroyed() || state.window.webContents.isDestroyed()) {
    browserSessions.delete(sessionId)
    return undefined
  }
  return state
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new BrowserToolError(`Browser operation timed out after ${timeoutMs} ms; the page was closed. Open the URL again to retry.`))
      onTimeout?.()
    }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function navigate(state: BrowserSessionState, url: URL): Promise<void> {
  const browserWindow = state.window
  state.url = undefined
  try {
    await browserWindow.loadURL(url.toString())
    assertActive(state)
    const finalUrl = browserWindow.webContents.getURL()
    if (!validateBrowserUrl(finalUrl).ok) throw new Error('Blocked navigation')
    state.url = finalUrl
  } catch {
    if (!browserWindow.isDestroyed()) browserWindow.destroy()
    // Electron navigation errors include the raw URL. Never return those messages.
    throw new BrowserToolError('Browser navigation failed; the page was closed. Check the URL, connection, and certificate, then open it again.')
  }
}

function requireLoadedSession(sessionId: string): BrowserSessionState {
  const state = getBrowserSession(sessionId)
  if (!state || !state.url) throw new BrowserToolError('No browser page is open for this session. Use browser open_url first.')
  assertActive(state)
  if (!validateBrowserUrl(state.window.webContents.getURL()).ok) throw new BrowserToolError('The current page is not an http/https page. Use browser open_url first.')
  return state
}

async function readPageText(state: BrowserSessionState): Promise<string> {
  const script = `(() => {
    const root = document.body || document.documentElement;
    const value = root?.textContent || '';
    return { text: value.slice(0, ${MAX_BROWSER_TEXT_CHARS}), truncated: value.length > ${MAX_BROWSER_TEXT_CHARS} };
  })()`
  // An isolated world prevents site scripts from replacing the DOM getter or slice.
  // This fixed script has no agent-controlled code and grants no synthetic user gesture.
  const read = state.window.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: script }], false)
  void read.catch(() => {})
  const value = await withTimeout(read, BROWSER_OPERATION_TIMEOUT_MS, () => {
    if (!state.window.isDestroyed()) state.window.destroy()
  })
  assertActive(state)
  return boundedBrowserText(value?.text, value?.truncated)
}

async function interact(state: BrowserSessionState, operation: 'click' | 'fill', selector: string, value?: string): Promise<string> {
  const script = `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, error: 'No matching element' };
    if (${JSON.stringify(operation)} === 'click') { element.click(); return { ok: true, operation: 'click' }; }
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return { ok: false, error: 'Element is not a fillable control' };
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set;
    setter?.call(element, ${JSON.stringify(value || '')});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, operation: 'fill' };
  })()`
  const result = await withTimeout(state.window.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: script }], false), BROWSER_OPERATION_TIMEOUT_MS)
  if (!result?.ok) throw new BrowserToolError(result?.error || 'Browser interaction failed')
  return JSON.stringify(result)
}

async function waitForText(state: BrowserSessionState, selector: string, text: string, timeoutMs: number): Promise<string> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const script = `(() => { const element = document.querySelector(${JSON.stringify(selector)}); return (element?.textContent || '').includes(${JSON.stringify(text)}); })()`
    const found = await withTimeout(state.window.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: script }], false), BROWSER_OPERATION_TIMEOUT_MS)
    if (found) return JSON.stringify({ ok: true, operation: 'wait_for_text' })
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new BrowserToolError('Timed out waiting for page text')
}

async function saveScreenshot(state: BrowserSessionState, workspace: string, width: number, height: number, signal: AbortSignal): Promise<string> {
  const operation = (async () => {
    const root = path.resolve(workspace)
    const outputDirectory = path.join(root, '.vd-agent', 'browser-screenshots')
    const outputPath = path.join(outputDirectory, `browser-${Date.now()}-${crypto.randomUUID()}.png`)
    const relativePath = path.relative(root, outputPath).split(path.sep).join('/')
    if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) throw new BrowserToolError('The browser screenshot path escaped the workspace.')
    if (!await resolvesInsideWorkspace(root, outputPath)) throw new BrowserToolError('The browser screenshot destination must resolve inside the workspace.')
    assertActive(state)
    state.window.setContentSize(width, height)
    const image = await state.window.webContents.capturePage({ x: 0, y: 0, width, height }, { stayHidden: true, stayAwake: true })
    assertActive(state)
    if (image.isEmpty()) throw new BrowserToolError('The browser returned an empty screenshot. Wait for the page to render and retry.')
    // NativeImage can contain HiDPI representations; return only a bounded 1x PNG.
    const bounded = image.resize({ width, height })
    const png = bounded.toPNG({ scaleFactor: 1 })
    if (png.byteLength > MAX_SCREENSHOT_BYTES) throw new BrowserToolError('The browser screenshot exceeded the 10 MB limit.')
    await fs.promises.mkdir(outputDirectory, { recursive: true, mode: 0o700 })
    if (!await resolvesInsideWorkspace(root, outputPath)) throw new BrowserToolError('The browser screenshot destination must resolve inside the workspace.')
    assertActive(state)
    await fs.promises.writeFile(outputPath, png, { flag: 'wx', mode: 0o600, signal })
    return JSON.stringify({
      operation: 'screenshot',
      path: relativePath,
      width,
      height,
      mimeType: 'image/png',
      bytes: png.byteLength,
    })
  })()
  void operation.catch(() => {})
  return withTimeout(operation, BROWSER_OPERATION_TIMEOUT_MS, () => {
    if (!state.window.isDestroyed()) state.window.destroy()
  })
}

export async function executeBrowserTool(input: BrowserToolInput, workspace: string | undefined, session: unknown): Promise<string> {
  const validation = validateBrowserRequest(input)
  if (!validation.ok) throw new Error(validation.error)
  if (!workspace) throw new Error('browser requires an open workspace')
  // A chat that changes workspace must not carry its browsing state across projects.
  const sessionId = JSON.stringify([normalizeBrowserSessionId(session), path.resolve(workspace)])
  const { operation, url, width, height, selector, value, text, timeoutMs } = validation.value
  const state = url ? getBrowserSession(sessionId) || createBrowserSession(sessionId) : requireLoadedSession(sessionId)
  if (state.busy) throw new BrowserToolError('A browser operation is already running for this session. Wait for it to finish.')
  state.busy = true
  const abort = new AbortController()
  const work = async () => {
    if (url) await navigate(state, url)
    assertActive(state)
    if (operation === 'open_url') return `Browser opened ${safeBrowserUrlLabel(state.url!)} in the current session.`
    if (operation === 'read_page_text') return readPageText(state)
    if (operation === 'click' || operation === 'fill') return interact(state, operation, selector!, value)
    if (operation === 'wait_for_text') return waitForText(state, selector!, text!, timeoutMs)
    return saveScreenshot(state, workspace, width, height, abort.signal)
  }
  try {
    return await withTimeout(work(), url ? BROWSER_NAVIGATION_TIMEOUT_MS : BROWSER_OPERATION_TIMEOUT_MS, () => {
      abort.abort()
      if (!state.window.isDestroyed()) state.window.destroy()
    })
  } catch (error) {
    if (error instanceof BrowserToolError) throw error
    throw new BrowserToolError('Browser operation failed. The page or screenshot destination may be unavailable; no page details were logged.')
  } finally {
    state.busy = false
  }
}

/** Close hidden browser windows when the application exits; destroyed windows self-remove. */
export function closeBrowserSessions(): void {
  for (const state of browserSessions.values()) {
    if (!state.window.isDestroyed()) state.window.destroy()
  }
  browserSessions.clear()
}

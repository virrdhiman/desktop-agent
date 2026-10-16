/** Pure validation and bounds for the hidden Electron browser tool. */

export const BROWSER_NAVIGATION_TIMEOUT_MS = 15_000
export const BROWSER_OPERATION_TIMEOUT_MS = 5_000
export const MAX_BROWSER_TEXT_CHARS = 100_000
export const MAX_BROWSER_URL_CHARS = 4_096
export const MIN_BROWSER_VIEWPORT_WIDTH = 320
export const MAX_BROWSER_VIEWPORT_WIDTH = 1_600
export const MIN_BROWSER_VIEWPORT_HEIGHT = 240
export const MAX_BROWSER_VIEWPORT_HEIGHT = 1_200
export const MAX_BROWSER_VIEWPORT_PIXELS = 2_000_000
export const DEFAULT_BROWSER_VIEWPORT = { width: 1_280, height: 900 }

export type BrowserOperation = 'open_url' | 'read_page_text' | 'screenshot' | 'click' | 'fill' | 'wait_for_text'

export type BrowserToolInput = {
  operation?: unknown
  url?: unknown
  width?: unknown
  height?: unknown
  selector?: unknown
  value?: unknown
  text?: unknown
  timeoutMs?: unknown
}

export type ValidBrowserToolInput = {
  operation: BrowserOperation
  url?: URL
  width: number
  height: number
  selector?: string
  value?: string
  text?: string
  timeoutMs: number
}

export type BrowserValidation =
  | { ok: true; value: ValidBrowserToolInput }
  | { ok: false; error: string }

const OPERATION_ALIASES: Record<string, BrowserOperation> = {
  open: 'open_url',
  open_url: 'open_url',
  read: 'read_page_text',
  read_page_text: 'read_page_text',
  screenshot: 'screenshot',
  click: 'click',
  fill: 'fill',
  wait: 'wait_for_text',
  wait_for_text: 'wait_for_text',
}

export function normalizeBrowserOperation(value: unknown): BrowserOperation | null {
  if (typeof value !== 'string') return null
  const operation = value.trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(OPERATION_ALIASES, operation) ? OPERATION_ALIASES[operation] : null
}

export function validateBrowserUrl(value: unknown): { ok: true; url: URL } | { ok: false; error: string } {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: 'browser requires a URL' }
  const input = value.trim()
  if (input.length > MAX_BROWSER_URL_CHARS) return { ok: false, error: `browser URL must be ${MAX_BROWSER_URL_CHARS} characters or fewer` }
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return { ok: false, error: 'browser URL is invalid' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'browser only permits http and https URLs' }
  if (url.username || url.password) return { ok: false, error: 'browser URLs cannot contain embedded credentials' }
  return { ok: true, url }
}

function boundedDimension(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function boundedViewport(width: unknown, height: unknown): { width: number; height: number } {
  let boundedWidth = boundedDimension(width, DEFAULT_BROWSER_VIEWPORT.width, MIN_BROWSER_VIEWPORT_WIDTH, MAX_BROWSER_VIEWPORT_WIDTH)
  let boundedHeight = boundedDimension(height, DEFAULT_BROWSER_VIEWPORT.height, MIN_BROWSER_VIEWPORT_HEIGHT, MAX_BROWSER_VIEWPORT_HEIGHT)
  if (boundedWidth * boundedHeight > MAX_BROWSER_VIEWPORT_PIXELS) {
    const scale = Math.sqrt(MAX_BROWSER_VIEWPORT_PIXELS / (boundedWidth * boundedHeight))
    boundedWidth = Math.max(MIN_BROWSER_VIEWPORT_WIDTH, Math.floor(boundedWidth * scale))
    boundedHeight = Math.max(MIN_BROWSER_VIEWPORT_HEIGHT, Math.floor(boundedHeight * scale))
  }
  return { width: boundedWidth, height: boundedHeight }
}

export function validateBrowserRequest(input: BrowserToolInput | null | undefined): BrowserValidation {
  const operation = normalizeBrowserOperation(input?.operation)
  if (!operation) return { ok: false, error: 'browser operation must be open_url, read_page_text, screenshot, click, fill, or wait_for_text' }

  let url: URL | undefined
  if (input?.url !== undefined && input?.url !== null) {
    const validated = validateBrowserUrl(input.url)
    if (!validated.ok) return validated
    url = validated.url
  }
  if (operation === 'open_url' && !url) return { ok: false, error: 'browser open_url requires a URL' }

  const viewport = boundedViewport(input?.width, input?.height)
  const selector = input?.selector === undefined ? undefined : typeof input.selector === 'string' && input.selector.trim().length <= 512 ? input.selector.trim() : undefined
  if (['click', 'fill', 'wait_for_text'].includes(operation) && !selector) return { ok: false, error: `browser ${operation} requires a CSS selector` }
  const value = input?.value === undefined ? undefined : typeof input.value === 'string' && input.value.length <= 20_000 ? input.value : undefined
  const text = input?.text === undefined ? undefined : typeof input.text === 'string' && input.text.length <= 20_000 ? input.text : undefined
  if (operation === 'fill' && value === undefined) return { ok: false, error: 'browser fill requires a value' }
  if (operation === 'wait_for_text' && text === undefined) return { ok: false, error: 'browser wait_for_text requires text' }
  const rawTimeout = typeof input?.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) ? Math.round(input.timeoutMs) : BROWSER_OPERATION_TIMEOUT_MS
  const timeoutMs = Math.max(250, Math.min(15_000, rawTimeout))
  return { ok: true, value: { operation, url, ...viewport, selector, value, text, timeoutMs } }
}

/** Remove credentials, query parameters, and fragments before a URL is shown in UI text. */
export function safeBrowserUrlLabel(value: string | URL): string {
  try {
    const url = typeof value === 'string' ? new URL(value) : new URL(value.toString())
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '[invalid URL]'
  }
}

export function normalizeBrowserSessionId(value: unknown): string {
  if (typeof value !== 'string') return 'default'
  const session = value.trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(session) ? session : 'default'
}

export function boundedBrowserText(text: unknown, truncated: unknown = false): string {
  if (typeof text !== 'string') throw new Error('Browser page text was unavailable')
  const marker = '\n\n[Page text truncated at 100000 characters.]'
  return text.length > MAX_BROWSER_TEXT_CHARS || truncated === true
    ? `${text.slice(0, Math.max(0, MAX_BROWSER_TEXT_CHARS - marker.length))}${marker}`
    : text
}

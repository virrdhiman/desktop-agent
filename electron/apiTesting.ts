/** Lightweight, dependency-free HTTP testing helpers used by the agent API tool. */

export const API_REQUEST_TIMEOUT_MS = 15_000
export const API_MAX_RESPONSE_CHARS = 100_000

export type ApiRequestInput = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  jsonPath?: string
  expectedStatus?: number | number[]
}

export function validateApiRequest(input: ApiRequestInput): { ok: true; url: URL; method: string } | { ok: false; error: string } {
  if (!input || typeof input.url !== 'string' || !input.url.trim()) return { ok: false, error: 'api_request requires a URL' }
  let url: URL
  try { url = new URL(input.url) } catch { return { ok: false, error: 'api_request URL is invalid' } }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'api_request only permits http and https URLs' }
  const method = String(input.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return { ok: false, error: `HTTP method ${method} is not permitted` }
  if (input.body !== undefined && input.body !== null && method === 'GET') return { ok: false, error: 'GET requests cannot include a body' }
  return { ok: true, url, method }
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce((current: any, key) => current == null ? undefined : current[key], value)
}

export async function executeApiRequest(input: ApiRequestInput, fetchImpl: typeof fetch = fetch): Promise<string> {
  const validation = validateApiRequest(input)
  if (!validation.ok) throw new Error(validation.error)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS)
  try {
    const headers = { ...(input.headers || {}) }
    let body: string | undefined
    if (input.body !== undefined && input.body !== null) {
      body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body)
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json'
    }
    const response = await fetchImpl(validation.url, { method: validation.method, headers, body, signal: controller.signal })
    const text = (await response.text()).slice(0, API_MAX_RESPONSE_CHARS)
    let parsed: unknown = text
    try { parsed = text ? JSON.parse(text) : null } catch { /* plain text response */ }
    const expected = input.expectedStatus === undefined ? true : (Array.isArray(input.expectedStatus) ? input.expectedStatus : [input.expectedStatus]).includes(response.status)
    const selected = input.jsonPath ? readPath(parsed, input.jsonPath) : parsed
    return JSON.stringify({ ok: response.ok && expected, status: response.status, statusText: response.statusText, jsonPath: input.jsonPath, value: selected, body: input.jsonPath ? undefined : parsed }, null, 2)
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error(`API request timed out after ${API_REQUEST_TIMEOUT_MS} ms`)
    throw error
  } finally { clearTimeout(timer) }
}

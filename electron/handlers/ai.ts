/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * AI Chat Streaming IPC Handler
 * OpenAI-compatible + Anthropic, with per-key model discovery and per-model fallback.
 */
import { ipcMain, BrowserWindow } from 'electron'
import { resolveProviderApiKey } from './settings'
import { createHash } from 'crypto'
import {
  buildModelAttemptList,
  classifyModelError,
  modelFailureCooldownMs,
  rankModels,
  tryModels,
  type ModelErrorKind,
} from '../../src/lib/modelSelect'
import type { TeamTokenBudget } from '../../src/types'

type ChatConfig = {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
  messages: any[]
  stream: boolean
  autoSelect?: boolean
  knownModels?: string[]
  modelPerformance?: Record<string, { successes?: number; failures?: number; avgLatencyMs?: number; taskSuccesses?: Record<string, number> }>
  taskKind?: string
  modelBudget?: TeamTokenBudget
  preferFreeModels?: boolean
}

type ChatError = { error: string; kind: ModelErrorKind | 'cancelled'; status?: number; models?: string[] }
type ChatSuccess = { content: string; models?: string[] }

const MODELS_TIMEOUT_MS = 8000
const CACHE_MS = 10 * 60 * 1000
const modelCache = new Map<string, { ids: string[]; at: number }>()
const modelCooldowns = new Map<string, number>()
const activeControllers = new Set<AbortController>()

function trimBase(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '')
}

/** Cache key never contains the raw key. */
function cacheKey(baseUrl: string, apiKey: string) {
  const digest = createHash('sha256').update(apiKey).digest('hex').slice(0, 16)
  return `${trimBase(baseUrl)}::${digest}`
}

function availableModels(baseUrl: string, apiKey: string, ids: string[]): string[] {
  const scope = cacheKey(baseUrl, apiKey)
  const now = Date.now()
  for (const [key, until] of modelCooldowns) {
    if (until <= now) modelCooldowns.delete(key)
  }
  return ids.filter((id) => (modelCooldowns.get(`${scope}::${id}`) || 0) <= now)
}

function coolDownModel(baseUrl: string, apiKey: string, model: string, error: string, status?: number) {
  const duration = modelFailureCooldownMs(error, status)
  if (duration > 0) modelCooldowns.set(`${cacheKey(baseUrl, apiKey)}::${model}`, Date.now() + duration)
}

function redactKey(text: string, apiKey: string) {
  return apiKey && apiKey.length >= 8 ? text.split(apiKey).join('[redacted]') : text
}

function isAbort(err: any, controller?: AbortController) {
  return err?.name === 'AbortError' || !!controller?.signal.aborted
}

async function toError(response: Response, apiKey: string): Promise<ChatError> {
  const body = redactKey(await response.text().catch(() => ''), apiKey)
  const error = `API error (${response.status}): ${body.slice(0, 300)}`
  return { error, status: response.status, kind: classifyModelError(error, response.status) }
}

async function listProviderModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const key = cacheKey(baseUrl, apiKey)
  const hit = modelCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ids

  const response = await fetch(`${trimBase(baseUrl)}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
  })
  if (!response.ok) return []
  const data: any = await response.json()
  const raw = Array.isArray(data) ? data : data.data || data.models || []
  const ids: string[] = raw
    .map((m: any) => (typeof m === 'string' ? m : m?.id || m?.name))
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
  modelCache.set(key, { ids, at: Date.now() })
  return ids
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  getMainWindow: () => BrowserWindow | null,
  extract: (parsed: any) => string | undefined
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const token = extract(JSON.parse(data))
        if (token) {
          full += token
          getMainWindow()?.webContents.send('ai:stream', token)
        }
      } catch { /* partial SSE chunk */ }
    }
  }
  return full
}

async function completeAnthropic(
  getMainWindow: () => BrowserWindow | null,
  config: ChatConfig,
  signal: AbortSignal
): Promise<ChatSuccess | ChatError> {
  const system = config.messages.filter((m: any) => m.role === 'system').map((m: any) => m.content).join('\n\n')
  const response = await fetch(`${trimBase(config.baseUrl)}/v1/messages`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8192,
      stream: !!config.stream,
      ...(system ? { system } : {}),
      messages: config.messages
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    }),
  })

  if (!response.ok) return toError(response, config.apiKey)

  if (config.stream && response.body) {
    const content = await readSse(response.body, getMainWindow, (p) =>
      p.type === 'content_block_delta' ? p.delta?.text : undefined
    )
    return { content }
  }

  const data = await response.json()
  if (data.error) {
    const error = redactKey(String(data.error.message || JSON.stringify(data.error)), config.apiKey)
    return { error, kind: classifyModelError(error) }
  }
  return { content: data.content?.[0]?.text || '' }
}

async function completeOpenAI(
  getMainWindow: () => BrowserWindow | null,
  config: ChatConfig,
  model: string,
  signal: AbortSignal
): Promise<ChatSuccess | ChatError> {
  const response = await fetch(`${trimBase(config.baseUrl)}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: config.messages,
      max_tokens: 8192,
      stream: !!config.stream,
    }),
  })

  if (!response.ok) return toError(response, config.apiKey)

  if (config.stream && response.body) {
    const content = await readSse(response.body, getMainWindow, (p) => p.choices?.[0]?.delta?.content)
    return { content }
  }

  const data = await response.json()
  if (data.error) {
    const error = redactKey(String(data.error.message || JSON.stringify(data.error)), config.apiKey)
    return { error, kind: classifyModelError(error) }
  }
  return { content: data.choices?.[0]?.message?.content || '' }
}

export function registerAiHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('ai:chat', async (_event, config: ChatConfig) => {
    config = { ...config, apiKey: await resolveProviderApiKey(config.provider, config.apiKey) }
    const controller = new AbortController()
    activeControllers.add(controller)

    try {
      if (config.provider === 'anthropic') {
        const result = await completeAnthropic(getMainWindow, config, controller.signal)
        return 'error' in result ? result : { ...result, model: config.model }
      }

      let discovered: string[] = []
      let models = [config.model]
      if (config.autoSelect !== false) {
        try {
          discovered = await listProviderModels(config.baseUrl, config.apiKey)
          if (discovered.length === 0 && Array.isArray(config.knownModels)) discovered = config.knownModels
          models = buildModelAttemptList(config.model, availableModels(config.baseUrl, config.apiKey, discovered), undefined, config.modelPerformance, config.taskKind, {
            budget: config.modelBudget,
            preferFree: config.preferFreeModels,
          })
        } catch {
          discovered = Array.isArray(config.knownModels) ? config.knownModels : []
          models = buildModelAttemptList(config.model, availableModels(config.baseUrl, config.apiKey, discovered), undefined, config.modelPerformance, config.taskKind, {
            budget: config.modelBudget,
            preferFree: config.preferFreeModels,
          })
        }
        models = availableModels(config.baseUrl, config.apiKey, models)
      }

      const result = await tryModels(
        models,
        (model) => completeOpenAI(getMainWindow, config, model, controller.signal),
        () => controller.signal.aborted,
        (model, failure) => coolDownModel(config.baseUrl, config.apiKey, model, failure.error, failure.status)
      )
      const catalog = rankModels(availableModels(config.baseUrl, config.apiKey, discovered), { budget: config.modelBudget, preferFree: config.preferFreeModels }).slice(0, 40)
      return catalog.length > 0 ? { ...result, models: catalog } : result
    } catch (err: any) {
      if (isAbort(err, controller)) return { error: 'Cancelled', kind: 'cancelled' }
      const error = redactKey(String(err?.message || err), config.apiKey)
      return { error, kind: classifyModelError(error) }
    } finally {
      activeControllers.delete(controller)
    }
  })

  ipcMain.handle('ai:cancel', async () => {
    for (const controller of activeControllers) controller.abort()
    activeControllers.clear()
    return { success: true }
  })

  ipcMain.handle('ai:listModels', async (_event, config: { provider: string; apiKey: string; baseUrl: string; modelBudget?: TeamTokenBudget; preferFreeModels?: boolean }) => {
    const apiKey = await resolveProviderApiKey(config.provider, config.apiKey)
    if (config.provider === 'anthropic' || !apiKey || !config.baseUrl) return []
    try {
      return rankModels(availableModels(config.baseUrl, apiKey, await listProviderModels(config.baseUrl, apiKey)), { budget: config.modelBudget, preferFree: config.preferFreeModels })
    } catch {
      return []
    }
  })
}

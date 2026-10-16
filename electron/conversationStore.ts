/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * On-disk chat history: one JSON file per session in `<userData>/conversations/<id>.json`.
 * Pure Node (no Electron imports) so it can be unit tested against a temp directory.
 */
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

export const CONVERSATION_VERSION = 2
export const MAX_STORED_MESSAGES = 1000
export const MAX_STORED_MESSAGE_CHARS = 64_000
export const MAX_STORED_CONVERSATION_BYTES = 512 * 1024
export const DEFAULT_LIST_LIMIT = 100

export type StoredRole = 'user' | 'assistant' | 'system'

export interface StoredMessage {
  id: string
  role: StoredRole
  content: string
  timestamp: number
}

export interface StoredConversation {
  version: number
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: StoredMessage[]
  pinned?: boolean
  summary?: string
  resume?: Record<string, unknown>
}

const SESSION_ID = /^[A-Za-z0-9_-]{1,100}$/
const ROLES = new Set<StoredRole>(['user', 'assistant', 'system'])
const writeQueues = new Map<string, Promise<unknown>>()

function enqueueWrite<T>(target: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(target) || Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  writeQueues.set(target, current)
  return current.finally(() => {
    if (writeQueues.get(target) === current) writeQueues.delete(target)
  })
}

const KEY_PATTERNS = [
  /\bsk-(?:ant-|proj-|or-v1-)?[A-Za-z0-9_-]{20,}/g,
  /\bgsk_[A-Za-z0-9]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bhf_[A-Za-z0-9]{20,}/g,
  /\bxai-[A-Za-z0-9]{20,}/g,
  /\bcsk-[A-Za-z0-9]{20,}/g,
  /\bghp_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
]

export function isValidSessionId(id: unknown): id is string {
  return typeof id === 'string' && SESSION_ID.test(id)
}

/** Strip configured API keys and common key formats from text before it is written to disk. */
export function redactSecrets(text: string, secrets: string[] = []): string {
  let out = text
  for (const secret of secrets) {
    if (secret && secret.length >= 12) out = out.split(secret).join('[redacted-key]')
  }
  for (const re of KEY_PATTERNS) out = out.replace(re, '[redacted-key]')
  return out
}

function toTimestamp(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function deriveTitle(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content.trim() || ''
  const line = first.split('\n')[0].trim()
  return line ? line.slice(0, 80) : 'Untitled chat'
}

/**
 * Accepts the current format and the legacy `{ messages, taskId }` files.
 * Returns null when there is nothing usable to show.
 */
export function normalizeConversation(raw: unknown, id: string, fallbackTime: number): StoredConversation | null {
  if (!raw || typeof raw !== 'object' || !isValidSessionId(id)) return null
  const data = raw as Record<string, unknown>
  if (!Array.isArray(data.messages)) return null

  const messages: StoredMessage[] = []
  data.messages.forEach((m: any, i: number) => {
    if (!m || typeof m !== 'object' || typeof m.content !== 'string' || !ROLES.has(m.role)) return
    messages.push({
      id: typeof m.id === 'string' && m.id ? m.id : `${id}-${i}`,
      role: m.role,
      content: m.content.slice(0, MAX_STORED_MESSAGE_CHARS),
      timestamp: toTimestamp(m.timestamp, fallbackTime),
    })
  })
  if (messages.length === 0) return null

  const firstTs = messages[0].timestamp
  const lastTs = messages[messages.length - 1].timestamp
  const createdAt = toTimestamp(data.createdAt, firstTs)
  const updatedAt = Math.max(toTimestamp(data.updatedAt, lastTs), createdAt)
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 80) : deriveTitle(messages)

  return {
    version: CONVERSATION_VERSION,
    id,
    title,
    createdAt,
    updatedAt,
    messages: messages.slice(-MAX_STORED_MESSAGES),
    pinned: data.pinned === true,
    summary: typeof data.summary === 'string' ? data.summary.slice(0, 12_000) : undefined,
    resume: data.resume && typeof data.resume === 'object' && !Array.isArray(data.resume)
      ? data.resume as Record<string, unknown>
      : undefined,
  }
}

function fileFor(dir: string, id: string) {
  return path.join(dir, `${id}.json`)
}

export async function saveConversation(
  dir: string,
  input: {
    id: string
    title?: string
    createdAt?: number
    messages: unknown[]
    pinned?: boolean
    summary?: string
    resume?: Record<string, unknown>
  },
  secrets: string[] = []
): Promise<StoredConversation> {
  if (!isValidSessionId(input?.id)) throw new Error('Invalid session id')
  const now = Date.now()
  const normalized = normalizeConversation(
    { ...input, updatedAt: now, createdAt: input.createdAt ?? now },
    input.id,
    now
  )
  if (!normalized) throw new Error('Conversation has no messages to save')

  const record: StoredConversation = {
    ...normalized,
    title: redactSecrets(normalized.title, secrets),
    messages: normalized.messages.map((m) => ({ ...m, content: redactSecrets(m.content, secrets) })),
    pinned: input.pinned === true,
    summary: input.summary ? redactSecrets(input.summary.slice(0, 12_000), secrets) : undefined,
    resume: sanitizeResume(input.resume, secrets),
  }

  const boundedRecord = boundConversation(record)
  await fs.promises.mkdir(dir, { recursive: true })
  const target = fileFor(dir, record.id)
  return enqueueWrite(target, async () => {
    const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`
    const backup = `${target}.bak`
    const json = JSON.stringify(boundedRecord, null, 2)
    await fs.promises.writeFile(tmp, json, 'utf-8')
    try {
      try {
        await fs.promises.rm(backup, { force: true })
        await fs.promises.rename(target, backup)
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err
      }
      await fs.promises.rename(tmp, target)
    } catch (err) {
      try { await fs.promises.rename(backup, target) } catch {}
      await fs.promises.rm(tmp, { force: true })
      throw err
    }
    return boundedRecord
  })
}

function sanitizeResume(value: unknown, secrets: string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  try {
    // Reject cyclic/non-serializable resume data rather than silently persisting
    // an incomplete placeholder.
    JSON.stringify(value)
    const input = value as Record<string, unknown>
    const allowed = [
      'workspacePath', 'selectedFile', 'openFiles', 'tasks', 'terminalTabs', 'terminalEntries',
      'toolExecutions', 'providerId', 'model', 'projectMemory', 'conversationSummary',
      'checkpoint', 'lastVerification', 'git', 'checklistState',
    ]
    const safe = Object.fromEntries(allowed.filter((key) => key in input).map((key) => [key, stripSensitiveResumeFields(input[key])]))
    const json = JSON.stringify(safe)
    if (json.length > 300_000) return { recoveryNote: 'Resume state exceeded the local storage limit.' }
    return JSON.parse(redactSecrets(json, secrets))
  } catch {
    return undefined
  }
}

function stripSensitiveResumeFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveResumeFields)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/^(?:api[_-]?key|providers?|launch(?:command|args)?|command)$/i.test(key))
    .map(([key, child]) => [key, stripSensitiveResumeFields(child)]))
}

function boundConversation(record: StoredConversation): StoredConversation {
  let messages = record.messages
  const fits = (candidate: StoredMessage[]) =>
    Buffer.byteLength(JSON.stringify({ ...record, messages: candidate }, null, 2), 'utf8') <= MAX_STORED_CONVERSATION_BYTES
  while (messages.length > 1 && !fits(messages)) messages = messages.slice(1)
  if (!fits(messages)) {
    messages = messages.map((message) => ({ ...message, content: message.content.slice(0, 4_000) }))
    while (messages.length > 1 && !fits(messages)) messages = messages.slice(1)
  }
  return { ...record, messages }
}

export async function listConversations(dir: string, limit = DEFAULT_LIST_LIMIT): Promise<StoredConversation[]> {
  let names: string[]
  try {
    names = await fs.promises.readdir(dir)
  } catch {
    return []
  }

  const results: StoredConversation[] = []
  const ids = new Set(names.flatMap((name) => (
    name.endsWith('.json') ? [name.slice(0, -'.json'.length)]
      : name.endsWith('.json.bak') ? [name.slice(0, -'.json.bak'.length)]
        : []
  )))
  for (const id of ids) {
    if (!isValidSessionId(id)) continue
    const name = `${id}.json`
    const file = path.join(dir, name)
    try {
      const [text, stat] = await Promise.all([fs.promises.readFile(file, 'utf-8'), fs.promises.stat(file)])
      const legacyTime = /^\d{12,}$/.test(id) ? Number(id) : stat.mtimeMs
      const conv = normalizeConversation(JSON.parse(text), id, legacyTime)
      if (conv) results.push(conv)
      else console.error(`Skipping malformed conversation file: ${name}`)
    } catch {
      try {
        const backup = JSON.parse(await fs.promises.readFile(`${file}.bak`, 'utf-8'))
        const conv = normalizeConversation(backup, id, Date.now())
        if (conv) results.push(conv)
        else console.error(`Skipping malformed conversation file: ${name}`)
      } catch {
        console.error(`Skipping unreadable conversation file: ${name}`)
      }
    }
  }

  return results.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
}

export async function readConversation(dir: string, id: string): Promise<StoredConversation | null> {
  if (!isValidSessionId(id)) throw new Error('Invalid session id')
  const file = fileFor(dir, id)
  try {
    const [text, stat] = await Promise.all([fs.promises.readFile(file, 'utf-8'), fs.promises.stat(file)])
    return normalizeConversation(JSON.parse(text), id, stat.mtimeMs)
  } catch {
    try {
      return normalizeConversation(JSON.parse(await fs.promises.readFile(`${file}.bak`, 'utf-8')), id, Date.now())
    } catch {
      return null
    }
  }
}

export async function deleteConversation(dir: string, id: string): Promise<boolean> {
  if (!isValidSessionId(id)) throw new Error('Invalid session id')
  const target = fileFor(dir, id)
  let deleted = false
  try {
    await fs.promises.unlink(target)
    deleted = true
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err
  }
  try {
    await fs.promises.unlink(`${target}.bak`)
    deleted = true
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err
  }
  return deleted
}

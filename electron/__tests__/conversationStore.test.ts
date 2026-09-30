// @vitest-environment node
/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license MIT
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  deleteConversation,
  isValidSessionId,
  listConversations,
  normalizeConversation,
  redactSecrets,
  saveConversation,
} from '../conversationStore'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-conv-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const msg = (id: string, role: 'user' | 'assistant' | 'system', content: string, timestamp = 1_700_000_000_000) =>
  ({ id, role, content, timestamp })

describe('conversationStore', () => {
  it('saves and lists a conversation, newest first', async () => {
    await saveConversation(dir, { id: 'session-a', messages: [msg('1', 'user', 'First chat')] })
    await new Promise((r) => setTimeout(r, 5))
    await saveConversation(dir, { id: 'session-b', messages: [msg('1', 'user', 'Second chat')] })

    const list = await listConversations(dir)
    expect(list.map((c) => c.id)).toEqual(['session-b', 'session-a'])
    expect(list[0]).toMatchObject({ version: 1, title: 'Second chat' })
  })

  it('repeated saves update the same session file instead of creating duplicates', async () => {
    const created = await saveConversation(dir, { id: 'session-x', createdAt: 1000, messages: [msg('1', 'user', 'Hi')] })
    await saveConversation(dir, {
      id: 'session-x',
      createdAt: created.createdAt,
      messages: [msg('1', 'user', 'Hi'), msg('2', 'assistant', 'Hello')],
    })

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    expect(files).toEqual(['session-x.json'])
    const [conv] = await listConversations(dir)
    expect(conv.messages).toHaveLength(2)
    expect(conv.createdAt).toBe(1000)
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  it('deletes the file from disk and tolerates already-deleted sessions', async () => {
    await saveConversation(dir, { id: 'session-del', messages: [msg('1', 'user', 'bye')] })
    expect(await deleteConversation(dir, 'session-del')).toBe(true)
    expect(fs.existsSync(path.join(dir, 'session-del.json'))).toBe(false)
    expect(await deleteConversation(dir, 'session-del')).toBe(false)
    expect(await listConversations(dir)).toEqual([])
  })

  it('rejects ids that could escape the conversations folder', async () => {
    expect(isValidSessionId('../settings')).toBe(false)
    expect(isValidSessionId('a/b')).toBe(false)
    await expect(saveConversation(dir, { id: '../evil', messages: [msg('1', 'user', 'x')] })).rejects.toThrow()
    await expect(deleteConversation(dir, '..\\settings')).rejects.toThrow()
  })

  it('skips corrupt files and loads legacy { messages, taskId } files', async () => {
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json')
    fs.writeFileSync(path.join(dir, 'empty.json'), JSON.stringify({ messages: [] }))
    fs.writeFileSync(path.join(dir, 'weird.json'), JSON.stringify(['not', 'an', 'object']))
    fs.writeFileSync(
      path.join(dir, '1700000000000.json'),
      JSON.stringify({ taskId: 'old', messages: [msg('1', 'user', 'Legacy question'), { role: 'tool', content: 5 }] })
    )

    const list = await listConversations(dir)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: '1700000000000', title: 'Legacy question', createdAt: 1_700_000_000_000 })
    expect(list[0].messages).toHaveLength(1)
  })

  it('returns an empty list when the folder does not exist yet', async () => {
    expect(await listConversations(path.join(dir, 'missing'))).toEqual([])
  })

  it('never writes configured API keys or common key formats to disk', async () => {
    const configured = 'custom-provider-key-1234567890'
    const fakeGroq = 'gsk_' + 'x'.repeat(32)
    const fakeOpenAI = 'sk-proj-' + 'y'.repeat(24)
    const fakeGoogle = 'AIza' + 'z'.repeat(34)
    await saveConversation(
      dir,
      {
        id: 'session-secret',
        messages: [
          msg('1', 'user', `my key is ${configured} and ${fakeGroq}`),
          msg('2', 'assistant', `also ${fakeOpenAI} and ${fakeGoogle}`),
        ],
      },
      [configured, 'ollama']
    )
    const raw = fs.readFileSync(path.join(dir, 'session-secret.json'), 'utf-8')
    expect(raw).not.toContain(configured)
    expect(raw).not.toMatch(/gsk_|sk-proj-|AIza/)
    expect(raw).toContain('[redacted-key]')
  })

  it('redactSecrets ignores short placeholders like local provider keys', () => {
    expect(redactSecrets('use ollama locally', ['ollama'])).toBe('use ollama locally')
  })

  it('normalizeConversation drops invalid messages and returns null when nothing is left', () => {
    expect(normalizeConversation({ messages: [{ role: 'user' }] }, 'ok-id', 1)).toBeNull()
    expect(normalizeConversation(null, 'ok-id', 1)).toBeNull()
    const conv = normalizeConversation({ messages: [{ role: 'user', content: 'x', timestamp: 'bad' }] }, 'ok-id', 42)
    expect(conv?.messages[0]).toMatchObject({ id: 'ok-id-0', timestamp: 42 })
  })
})

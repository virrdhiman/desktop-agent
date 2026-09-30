// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { MAX_STORED_MESSAGES, listConversations, readConversation, saveConversation } from '../conversationStore'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-reliability-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const message = (id: string, content: string) => ({ id, role: 'user' as const, content, timestamp: Date.now() })

describe('local persistence reliability', () => {
  it('survives repeated saves without temporary-file residue', async () => {
    for (let index = 0; index < 100; index++) {
      await saveConversation(dir, { id: 'repeat-session', messages: [message(String(index), `revision ${index}`)] })
    }
    expect((await readConversation(dir, 'repeat-session'))?.messages[0].content).toBe('revision 99')
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([])
    expect(() => JSON.parse(fs.readFileSync(path.join(dir, 'repeat-session.json.bak'), 'utf8'))).not.toThrow()
  })

  it('serializes concurrent saves of one session into complete JSON records', async () => {
    const secret = 'parallel-secret-key-1234567890'
    await Promise.all(Array.from({ length: 25 }, (_, index) => saveConversation(dir, {
      id: 'parallel-session',
      messages: [message(String(index), `${secret} revision ${index}`)],
    }, [secret])))

    const primary = fs.readFileSync(path.join(dir, 'parallel-session.json'), 'utf8')
    const backup = fs.readFileSync(path.join(dir, 'parallel-session.json.bak'), 'utf8')
    expect(() => JSON.parse(primary)).not.toThrow()
    expect(() => JSON.parse(backup)).not.toThrow()
    expect(primary).not.toContain(secret)
    expect(backup).not.toContain(secret)
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('saves many sessions concurrently and keeps every record readable', async () => {
    await Promise.all(Array.from({ length: 75 }, (_, index) => saveConversation(dir, {
      id: `session-${index}`,
      messages: [message(String(index), `conversation ${index}`)],
    })))
    const conversations = await listConversations(dir)
    expect(conversations).toHaveLength(75)
    expect(conversations.every((conversation) => conversation.messages.length === 1)).toBe(true)
  })

  it('bounds oversized histories and circular resume state without losing the chat', async () => {
    const resume: Record<string, unknown> = {}
    resume.circular = resume
    const messages = Array.from({ length: MAX_STORED_MESSAGES + 100 }, (_, index) => message(String(index), `message ${index}`))
    await saveConversation(dir, { id: 'bounded-session', messages, resume })
    const saved = await readConversation(dir, 'bounded-session')
    expect(saved?.messages).toHaveLength(MAX_STORED_MESSAGES)
    expect(saved?.messages[0].content).toBe('message 100')
    expect(saved?.resume).toBeUndefined()
  })
})

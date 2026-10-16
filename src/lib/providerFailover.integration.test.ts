// @vitest-environment node
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { classifyModelError, tryModels } from './modelSelect'

let server: Server
let baseUrl = ''

async function readSse(response: Response): Promise<string> {
  if (!response.body) throw new Error('provider returned no stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
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
      content += JSON.parse(data).choices?.[0]?.delta?.content || ''
    }
  }
  return content
}

beforeAll(async () => {
  server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
    if (request.url === '/first/chat/completions') {
      response.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')
      setTimeout(() => response.destroy(), 15)
      return
    }
    if (request.url === '/second/chat/completions') {
      response.write('data: {"choices":[{"delta":{"content":"fallback provider answer"}}]}\n\n')
      response.end('data: [DONE]\n\n')
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('stub provider did not bind')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

describe('provider failover integration', () => {
  it('retries a provider killed mid-stream and preserves the chat request', async () => {
    const messages = [{ role: 'user', content: 'Keep this request intact.' }]
    const originalMessages = structuredClone(messages)
    const attempts: string[] = []

    const result = await tryModels(['first', 'second'], async (model) => {
      attempts.push(model)
      try {
        const response = await fetch(`${baseUrl}/${model}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true }),
        })
        return { content: await readSse(response) }
      } catch (error: any) {
        const message = String(error?.message || error)
        return { error: message, kind: classifyModelError(message) }
      }
    })

    expect(attempts).toEqual(['first', 'second'])
    expect(result).toEqual({ content: 'fallback provider answer', model: 'second' })
    expect(messages).toEqual(originalMessages)
  })
})

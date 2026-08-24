/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * AI Chat Streaming IPC Handler
 * Supports OpenAI-compatible + Anthropic protocols with streaming
 */
import { ipcMain, BrowserWindow } from 'electron'

export function registerAiHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle(
    'ai:chat',
    async (_event, config: { provider: string; apiKey: string; baseUrl: string; model: string; messages: any[]; stream: boolean }) => {
      try {
        // Anthropic protocol
        if (config.provider === 'anthropic') {
          const response = await fetch(`${config.baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: config.model,
              max_tokens: 8192,
              stream: !!config.stream,
              messages: config.messages.map((m: any) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: typeof m.content === 'string' ? m.content : m.content,
              })),
            }),
          })

          if (config.stream && response.body) {
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let fullContent = ''

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })

              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim()
                  if (data === '[DONE]') break
                  try {
                    const parsed = JSON.parse(data)
                    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                      fullContent += parsed.delta.text
                      getMainWindow()?.webContents.send('ai:stream', parsed.delta.text)
                    }
                  } catch {}
                }
              }
            }
            return { content: fullContent }
          }

          const data = await response.json()
          if (data.error) throw new Error(data.error.message)
          return { content: data.content?.[0]?.text || '' }
        }

        // OpenAI-compatible (works for most providers)
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: config.messages,
            max_tokens: 8192,
            stream: !!config.stream,
          }),
        })

        if (!response.ok) {
          const errorBody = await response.text()
          throw new Error(`API error (${response.status}): ${errorBody.slice(0, 200)}`)
        }

        if (config.stream && response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let fullContent = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') break
                try {
                  const parsed = JSON.parse(data)
                  const token = parsed.choices?.[0]?.delta?.content
                  if (token) {
                    fullContent += token
                    getMainWindow()?.webContents.send('ai:stream', token)
                  }
                } catch {}
              }
            }
          }
          return { content: fullContent }
        }

        const data = await response.json()
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
        return { content: data.choices?.[0]?.message?.content || '' }
      } catch (err: any) {
        return { error: err.message }
      }
    }
  )
}

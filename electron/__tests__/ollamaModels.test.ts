/** Local model discovery and consent validation; network calls are always mocked. */
import { describe, expect, it, vi } from 'vitest'
import { listLocalOllamaModels, pullSmallOllamaModel, SMALL_OLLAMA_MODEL } from '../ollamaModels'

describe('local Ollama model setup', () => {
  it('reads only local installed models without triggering a download', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: 'small-local:latest' }, { name: '' }] }) })
    expect(await listLocalOllamaModels(fetcher)).toEqual(['small-local:latest'])
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', expect.objectContaining({ method: 'GET' }))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects missing consent and arbitrary model IDs without network access', async () => {
    const fetcher = vi.fn()
    await expect(pullSmallOllamaModel({ consent: false, model: SMALL_OLLAMA_MODEL }, fetcher)).rejects.toThrow('consent')
    await expect(pullSmallOllamaModel({ consent: true, model: 'other' }, fetcher)).rejects.toThrow('model')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses only the fixed localhost Ollama endpoint after explicit consent', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    await pullSmallOllamaModel({ consent: true, model: SMALL_OLLAMA_MODEL }, fetcher)
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:11434/api/pull', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ model: SMALL_OLLAMA_MODEL, stream: false }),
    }))
  })
})

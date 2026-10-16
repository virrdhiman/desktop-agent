/** Local-only Ollama discovery. Model downloads require an explicit, allowlisted request. */
export const SMALL_OLLAMA_MODEL = 'qwen2.5-coder:1.5b'
export const SMALL_OLLAMA_SIZE = 'about 1 GB'
const OLLAMA_API = 'http://127.0.0.1:11434/api'

export async function listLocalOllamaModels(fetcher: typeof fetch = fetch): Promise<string[]> {
  const response = await fetcher(`${OLLAMA_API}/tags`, { method: 'GET', signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error('Ollama is not available on localhost.')
  const data = await response.json()
  return Array.isArray(data?.models) ? data.models.slice(0, 100)
    .map((item: { name?: unknown }) => item?.name)
    .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0 && name.length <= 200) : []
}

export async function pullSmallOllamaModel(
  request: { consent: boolean; model: string }, fetcher: typeof fetch = fetch,
): Promise<void> {
  if (request?.consent !== true) throw new Error('Explicit download consent is required.')
  if (request.model !== SMALL_OLLAMA_MODEL) throw new Error('Only the suggested small model may be downloaded.')
  const response = await fetcher(`${OLLAMA_API}/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: SMALL_OLLAMA_MODEL, stream: false }),
    signal: AbortSignal.timeout(15 * 60_000),
  })
  if (!response.ok) throw new Error('Ollama could not download the model.')
}

/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import { describe, it, expect } from 'vitest'
import {
  buildModelAttemptList,
  classifyModelError,
  isAuthError,
  isRetryableModelError,
  isUsableChatModel,
  MAX_MODEL_ATTEMPTS,
  modelFailureCooldownMs,
  rankModels,
  rankModelsWithPerformance,
  scoreModel,
  tryModels,
  type ModelAttemptResult,
} from './modelSelect'

describe('model filtering', () => {
  it.each([
    'text-embedding-3-small',
    'nomic-embed-text',
    'whisper-large-v3',
    'distil-whisper-large-v3-en',
    'playai-tts',
    'canopylabs/orpheus-arabic-saudi',
    'tts-1-hd',
    'gpt-4o-mini-transcribe',
    'gpt-4o-audio-preview',
    'gpt-4o-realtime-preview',
    'dall-e-3',
    'gpt-image-1',
    'imagen-3.0-generate-002',
    'google/gemini-nano-banana-2.1',
    'black-forest-labs/FLUX.1-schnell',
    'stabilityai/stable-diffusion-xl-base-1.0',
    'omni-moderation-latest',
    'meta-llama/llama-guard-4-12b',
    'rerank-english-v3.0',
    'BAAI/bge-m3',
    'mistral-ocr-latest',
    'gpt-3.5-turbo-instruct',
  ])('skips non-chat model %s', (id) => {
    expect(isUsableChatModel(id)).toBe(false)
  })

  it.each([
    'llama-3.3-70b-versatile',
    'gemini-2.5-flash',
    'models/gemini-2.0-flash',
    'openai/gpt-oss-120b',
    'Qwen/Qwen2.5-Coder-32B-Instruct',
    'deepseek-chat',
    'mistral-small-latest',
  ])('keeps chat model %s', (id) => {
    expect(isUsableChatModel(id)).toBe(true)
  })
})

describe('model ranking', () => {
  it('keeps the strong 70B model and drops small and non-chat fallbacks', () => {
    const ranked = rankModels([
      'text-embedding-3-small',
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
      'whisper-large-v3',
    ])
    expect(ranked).toEqual(['llama-3.3-70b-versatile'])
  })

  it('does not let a strong family name lift a tiny variant', () => {
    expect(scoreModel('qwen3-4b')).toBeLessThan(scoreModel('llama-3.3-70b-versatile'))
    expect(scoreModel('gemma-3-4b-it')).toBeLessThan(scoreModel('gemma-3-27b-it'))
  })

  it('prefers stable, fast models over previews and reasoning-heavy variants of the same tier', () => {
    expect(scoreModel('gemini-2.5-flash')).toBeGreaterThan(scoreModel('gemini-2.5-flash-preview-05-20'))
    expect(scoreModel('deepseek-v3')).toBeGreaterThan(scoreModel('deepseek-r1'))
  })

  it('keeps only :free variants when the provider lists them', () => {
    const ranked = rankModels([
      'meta-llama/llama-3.1-405b-instruct',
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ])
    expect(ranked).toEqual(['meta-llama/llama-3.3-70b-instruct:free', 'mistralai/mistral-7b-instruct:free'])
  })

  it('keeps free-tagged models on the free route regardless of budget', () => {
    const ids = [
      'meta-llama/llama-3.1-405b-instruct',
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ]
    expect(rankModels(ids, { budget: 'balanced', preferFree: true })).toEqual([
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ])
    expect(rankModels(ids, { budget: 'strong', preferFree: true })[0]).toBe('meta-llama/llama-3.3-70b-instruct:free')
    expect(rankModels(ids, { budget: 'strong', preferFree: false })[0]).toBe('meta-llama/llama-3.1-405b-instruct')
    expect(rankModels(ids, { budget: 'balanced', preferFree: false })[0]).toBe('meta-llama/llama-3.1-405b-instruct')
  })

  it('drops tiny fallback models when the same provider exposes strong models', () => {
    expect(rankModels(['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'allam-2-7b']))
      .toEqual(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'])
    expect(rankModels(['allam-2-7b'])).toEqual(['allam-2-7b'])
  })

  it('strips the Gemini models/ prefix and de-duplicates', () => {
    expect(rankModels(['models/gemini-2.0-flash', 'gemini-2.0-flash'])).toEqual(['gemini-2.0-flash'])
  })

  it('uses local reliability data without overriding a large quality gap', () => {
    const ranked = rankModelsWithPerformance(
      ['mistral-small-latest', 'gemini-2.0-flash'],
      {
        'mistral-small-latest': { successes: 20, failures: 0, avgLatencyMs: 200, taskSuccesses: { coding: 10 } },
        'gemini-2.0-flash': { successes: 0, failures: 10, avgLatencyMs: 8000 },
      },
      'coding'
    )
    expect(ranked[0]).toBe('gemini-2.0-flash')
  })
})

describe('buildModelAttemptList', () => {
  it('tries the strongest discovered model first and removes stale configured models', () => {
    const list = buildModelAttemptList('gpt-4o-mini', ['llama-3.3-70b-versatile', 'gpt-4o-mini', 'llama-3.1-8b-instant'])
    expect(list[0]).toBe('llama-3.3-70b-versatile')
    expect(list).toContain('gpt-4o-mini')
    expect(new Set(list).size).toBe(list.length)

    const stale = buildModelAttemptList('deprecated-model', ['llama-3.3-70b-versatile'])
    expect(stale).toEqual(['llama-3.3-70b-versatile'])
  })

  it('keeps auto moving through known live models when the saved default expired', () => {
    const list = buildModelAttemptList('expired-model', [
      'expired-model',
      'llama-3.3-70b-versatile',
      'gemini-2.0-flash',
    ])
    expect(list[0]).toBe('llama-3.3-70b-versatile')
    expect(list).not.toContain('expired-model')
  })

  it('falls back to the configured model when discovery returns nothing', () => {
    expect(buildModelAttemptList('llama-3.3-70b-versatile', [])).toEqual(['llama-3.3-70b-versatile'])
  })

  it('caps live attempts and does not append stale configured models', () => {
    const many = Array.from({ length: 30 }, (_, i) => `vendor/model-${i}-70b-instruct`)
    const list = buildModelAttemptList('my-configured-model', many)
    expect(list.length).toBeLessThanOrEqual(MAX_MODEL_ATTEMPTS)
    expect(list).not.toContain('my-configured-model')
  })
})

describe('error classification', () => {
  it.each([
    ['API error (404): {"error":{"code":"model_not_found"}}', undefined],
    ['API error (400): The model `llama-3-70b` has been decommissioned', undefined],
    ['API error (400): unsupported model', undefined],
    ['API error (429): Rate limit reached for model', undefined],
    ['Too many requests', 429],
    ['API error (503): Service Unavailable', undefined],
    ['API error (529): overloaded_error', undefined],
    ['The server is at capacity, try again later', undefined],
    ['API error (402): Insufficient credits', undefined],
    ['RESOURCE_EXHAUSTED: quota exceeded for this model', undefined],
    ['API error (403): You do not have access to this model', undefined],
  ])('retries the next model for %s', (message, status) => {
    expect(classifyModelError(message, status)).toBe('retry-model')
    expect(isRetryableModelError(message, status)).toBe(true)
  })

  it.each([
    ['API error (401): Incorrect API key provided'],
    ['API error (400): API key not valid. Please pass a valid API key.'],
    ['{"error":{"code":"invalid_api_key"}}'],
    ['API error (403): Forbidden'],
    ['Unauthorized'],
  ])('treats %s as an auth failure (no model or provider retry)', (message) => {
    expect(classifyModelError(message)).toBe('auth')
    expect(isAuthError(message)).toBe(true)
    expect(isRetryableModelError(message)).toBe(false)
  })

  it('auth wins even when the body also mentions a rate limit', () => {
    expect(classifyModelError('API error (401): invalid api key; rate limit headers attached')).toBe('auth')
  })

  it('moves on when a model caps max_tokens below the request', () => {
    const groq = 'API error (400): {"error":{"message":"`max_tokens` must be less than or equal to `4096`, the maximum value for `max_tokens` is less than the `context_window` for this model"}}'
    expect(classifyModelError(groq)).toBe('retry-model')
  })

  it('moves on when a model needs its terms accepted first', () => {
    const groq = 'API error (400): {"error":{"message":"The model `x/y` requires terms acceptance. Please have the org admin accept the terms at https://console.groq.com"}}'
    expect(classifyModelError(groq)).toBe('retry-model')
  })

  it('tries the next model when image input is unsupported', () => {
    expect(classifyModelError('API error (400): this model does not support image input')).toBe('retry-model')
  })

  it('does not retry models for request-level errors', () => {
    expect(classifyModelError('API error (400): context length exceeded')).toBe('other')
    expect(classifyModelError('fetch failed')).toBe('other')
  })

  it('cools down retired models longer than temporary rate limits', () => {
    expect(modelFailureCooldownMs('model_not_found', 404)).toBe(60 * 60_000)
    expect(modelFailureCooldownMs('API error (429): rate limit', 429)).toBe(2 * 60_000)
    expect(modelFailureCooldownMs('Model returned an empty answer')).toBe(2 * 60_000)
    expect(modelFailureCooldownMs('API error (401): invalid API key', 401)).toBe(0)
  })
})

describe('tryModels', () => {
  const scripted = (replies: Record<string, ModelAttemptResult>) => {
    const tried: string[] = []
    const attempt = async (model: string) => {
      tried.push(model)
      return replies[model]
    }
    return { tried, attempt }
  }

  it('moves past a model that returns a blank reply', async () => {
    const { tried, attempt } = scripted({ 'gpt-oss-120b': { content: '  \n' }, 'llama-3.3-70b': { content: 'Answer.' } })
    expect(await tryModels(['gpt-oss-120b', 'llama-3.3-70b'], attempt)).toEqual({ content: 'Answer.', model: 'llama-3.3-70b' })
    expect(tried).toEqual(['gpt-oss-120b', 'llama-3.3-70b'])
  })

  it('returns a blank final reply for the caller to correct', async () => {
    const { attempt } = scripted({ a: { content: '' }, b: { content: '' } })
    expect(await tryModels(['a', 'b'], attempt)).toEqual({ content: '', model: 'b' })
  })

  it('reports each retryable model failure for temporary avoidance', async () => {
    const failures: string[] = []
    const { attempt } = scripted({ a: { error: 'rate limit', kind: 'retry-model' }, b: { content: 'Answer.' } })
    expect(await tryModels(['a', 'b'], attempt, () => false, (model) => failures.push(model))).toEqual({ content: 'Answer.', model: 'b' })
    expect(failures).toEqual(['a'])
  })

  it('reports the first real error, not the weakest fallback model', async () => {
    const { tried, attempt } = scripted({
      big: { error: 'API error (429): Rate limit reached (TPM)', kind: 'retry-model' },
      mid: { content: '' },
      small: { error: 'API error (400): `max_tokens` must be less than or equal to `4096`', kind: 'retry-model' },
    })
    expect(await tryModels(['big', 'mid', 'small'], attempt)).toEqual({
      error: 'big: API error (429): Rate limit reached (TPM) (3 models tried)',
      kind: 'retry-model',
    })
    expect(tried).toEqual(['big', 'mid', 'small'])
  })

  it('reports no model when the list is empty', async () => {
    expect(await tryModels([], async () => ({ content: 'x' }))).toMatchObject({ kind: 'retry-model' })
  })

  it('stops at the first non-retryable error', async () => {
    const { tried, attempt } = scripted({ a: { error: 'API error (401): invalid api key', kind: 'auth' }, b: { content: 'x' } })
    expect(await tryModels(['a', 'b'], attempt)).toMatchObject({ error: 'a: API error (401): invalid api key', kind: 'auth' })
    expect(tried).toEqual(['a'])
  })

  it('stops when cancelled', async () => {
    const { tried, attempt } = scripted({ a: { content: 'x' } })
    expect(await tryModels(['a'], attempt, () => true)).toEqual({ error: 'Cancelled', kind: 'cancelled' })
    expect(tried).toEqual([])
  })
})

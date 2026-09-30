/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license MIT
 */
import { describe, it, expect } from 'vitest'
import {
  buildModelAttemptList,
  classifyModelError,
  isAuthError,
  isRetryableModelError,
  isUsableChatModel,
  MAX_MODEL_ATTEMPTS,
  rankModels,
  scoreModel,
} from './modelSelect'

describe('model filtering', () => {
  it.each([
    'text-embedding-3-small',
    'nomic-embed-text',
    'whisper-large-v3',
    'distil-whisper-large-v3-en',
    'playai-tts',
    'tts-1-hd',
    'gpt-4o-mini-transcribe',
    'gpt-4o-audio-preview',
    'gpt-4o-realtime-preview',
    'dall-e-3',
    'gpt-image-1',
    'imagen-3.0-generate-002',
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
  it('ranks 70B instruct above small models and drops non-chat ids', () => {
    const ranked = rankModels([
      'text-embedding-3-small',
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
      'whisper-large-v3',
    ])
    expect(ranked).toEqual(['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'])
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

  it('strips the Gemini models/ prefix and de-duplicates', () => {
    expect(rankModels(['models/gemini-2.0-flash', 'gemini-2.0-flash'])).toEqual(['gemini-2.0-flash'])
  })
})

describe('buildModelAttemptList', () => {
  it('tries the strongest discovered model first and keeps the configured model as fallback', () => {
    const list = buildModelAttemptList('gpt-4o-mini', ['llama-3.3-70b-versatile', 'gpt-4o-mini', 'llama-3.1-8b-instant'])
    expect(list[0]).toBe('llama-3.3-70b-versatile')
    expect(list).toContain('gpt-4o-mini')
    expect(new Set(list).size).toBe(list.length)
  })

  it('falls back to the configured model when discovery returns nothing', () => {
    expect(buildModelAttemptList('llama-3.3-70b-versatile', [])).toEqual(['llama-3.3-70b-versatile'])
  })

  it('caps attempts and always includes the configured model', () => {
    const many = Array.from({ length: 30 }, (_, i) => `vendor/model-${i}-70b-instruct`)
    const list = buildModelAttemptList('my-configured-model', many)
    expect(list.length).toBeLessThanOrEqual(MAX_MODEL_ATTEMPTS)
    expect(list[list.length - 1]).toBe('my-configured-model')
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

  it('does not retry models for request-level errors', () => {
    expect(classifyModelError('API error (400): context length exceeded')).toBe('other')
    expect(classifyModelError('fetch failed')).toBe('other')
  })
})

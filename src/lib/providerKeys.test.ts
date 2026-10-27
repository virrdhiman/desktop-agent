/**
 * @author Virender Dhiman
 * @year 2026
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */
import { describe, expect, it } from 'vitest'
import { maskProviderForRenderer, nextStoredApiKey, secureStoredApiKey } from './providerKeys'

describe('provider key masking', () => {
  it('hides a real key and leaves local placeholders', () => {
    expect(maskProviderForRenderer({ id: 'groq', apiKey: 'gsk_live_secret_value' })).toEqual({
      id: 'groq', apiKey: '', hasKey: true,
    })
    expect(maskProviderForRenderer({ id: 'ollama', apiKey: 'ollama' })).toEqual({
      id: 'ollama', apiKey: 'ollama',
    })
  })

  it('keeps, replaces, or clears the stored key', () => {
    const encrypt = (value: string) => `enc:${value}`
    expect(nextStoredApiKey({ apiKey: '' }, 'enc:old', encrypt)).toBe('enc:old')
    expect(nextStoredApiKey({ apiKey: 'new-key' }, 'enc:old', encrypt)).toBe('enc:new-key')
    expect(nextStoredApiKey({ apiKey: 'ignored', clearKey: true }, 'enc:old', encrypt)).toBe('')
  })

  it('migrates legacy plaintext keys, preserves encrypted keys and rejects unavailable secure storage', () => {
    const encrypt = (value: string) => `enc:${value}`
    expect(secureStoredApiKey({ apiKey: '' }, 'old-key', encrypt)).toBe('enc:old-key')
    expect(secureStoredApiKey({ apiKey: '' }, 'enc:old', encrypt)).toBe('enc:old')
    expect(secureStoredApiKey({ apiKey: 'ollama' }, '', () => { throw new Error('unavailable') })).toBe('ollama')
    expect(() => secureStoredApiKey({ apiKey: 'new-key' }, '', () => { throw new Error('unavailable') })).toThrow('unavailable')
  })

  it('never exposes key-shaped values in renderer provider payloads', () => {
    const masked = maskProviderForRenderer({ id: 'provider', apiKey: 'sk-proj-' + 'x'.repeat(30), hasKey: true })
    const serialized = JSON.stringify(masked)
    expect(serialized).not.toMatch(/sk-proj-/)
    expect(serialized).not.toMatch(/apiKey":"[^\"]+"/)
    expect(masked).toMatchObject({ apiKey: '', hasKey: true })
  })
})

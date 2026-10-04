/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import { describe, expect, it } from 'vitest'
import { maskProviderForRenderer, nextStoredApiKey } from './providerKeys'

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
})

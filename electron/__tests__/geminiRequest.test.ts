// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GEMINI_IMAGE_MODEL_URL, geminiGenerateContentRequest } from '../geminiRequest'

describe('gemini image request', () => {
  it('sends the key in a header', () => {
    const key = 'AIza-test-key'
    const request = geminiGenerateContentRequest(key, { contents: [] })
    expect(request.url).toBe(GEMINI_IMAGE_MODEL_URL)
    expect(request.url).not.toContain(key)
    expect(request.url).not.toContain('key=')
    expect(request.init.headers).toMatchObject({ 'x-goog-api-key': key })
  })
})

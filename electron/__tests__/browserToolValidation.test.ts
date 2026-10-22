// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  MAX_BROWSER_TEXT_CHARS,
  MAX_BROWSER_VIEWPORT_PIXELS,
  DEFAULT_BROWSER_VIEWPORT,
  boundedBrowserText,
  normalizeBrowserSessionId,
  normalizeBrowserOperation,
  safeBrowserUrlLabel,
  validateBrowserRequest,
  validateBrowserUrl,
} from '../browserToolValidation'

describe('browser tool validation', () => {
  it('accepts only bounded http and https navigation', () => {
    expect(validateBrowserUrl('file:///secret')).toMatchObject({ ok: false })
    expect(validateBrowserUrl('javascript:alert(1)')).toMatchObject({ ok: false })
    expect(validateBrowserUrl('https://example.test/docs')).toMatchObject({ ok: true })
    expect(validateBrowserUrl('http://localhost:3000')).toMatchObject({ ok: true })
    expect(validateBrowserUrl('https://user:secret@example.test')).toMatchObject({ ok: false })
    expect(validateBrowserUrl('https://example.test/' + 'x'.repeat(4096))).toMatchObject({ ok: false })
  })

  it.each([undefined, '', 'not a URL', '//example.test', 'data:text/html,private', 'ftp://example.test'])('rejects invalid navigation input %s', (url) => {
    expect(validateBrowserUrl(url)).toMatchObject({ ok: false })
  })

  it('requires a URL only for open_url and permits session reuse for reads', () => {
    expect(validateBrowserRequest({ operation: 'open_url' })).toMatchObject({ ok: false })
    expect(validateBrowserRequest({ operation: 'read_page_text' })).toMatchObject({ ok: true, value: { url: undefined } })
    expect(validateBrowserRequest({ operation: 'screenshot', url: 'http://localhost:3000', width: 10_000, height: 10_000 })).toMatchObject({ ok: true })
    const bounded = validateBrowserRequest({ operation: 'screenshot', width: 10_000, height: 10_000 })
    expect(bounded.ok).toBe(true)
    if (bounded.ok) expect(bounded.value.width * bounded.value.height).toBeLessThanOrEqual(MAX_BROWSER_VIEWPORT_PIXELS)
  })

  it('validates bounded browser interactions', () => {
    expect(validateBrowserRequest({ operation: 'click', selector: '#go' })).toMatchObject({ ok: true })
    expect(validateBrowserRequest({ operation: 'fill', selector: '#name', value: 'Ada' })).toMatchObject({ ok: true })
    expect(validateBrowserRequest({ operation: 'wait', selector: 'main', text: 'ready' })).toMatchObject({ ok: true })
    expect(validateBrowserRequest({ operation: 'fill', selector: '#name' })).toMatchObject({ ok: false })
  })

  it('normalizes small operation aliases and redacts URL secrets from display labels', () => {
    expect(normalizeBrowserOperation('read')).toBe('read_page_text')
    expect(safeBrowserUrlLabel('https://user:password@example.test/page?token=secret#private')).toBe('https://example.test/page')
    expect(safeBrowserUrlLabel('private invalid URL')).toBe('[invalid URL]')
    expect(normalizeBrowserOperation('__proto__')).toBeNull()
    expect(normalizeBrowserOperation('constructor')).toBeNull()
    expect(validateBrowserRequest({ operation: 'execute_script' })).toMatchObject({ ok: false })
    expect(validateBrowserRequest({ operation: 'read_page_text', url: 'file:///secret' })).toMatchObject({ ok: false })
  })

  it('bounds nonfinite, fractional, and negative viewport inputs', () => {
    expect(validateBrowserRequest({ operation: 'screenshot', width: NaN, height: Infinity })).toMatchObject({ ok: true, value: DEFAULT_BROWSER_VIEWPORT })
    expect(validateBrowserRequest({ operation: 'screenshot', width: -100, height: 0 })).toMatchObject({ ok: true, value: { width: 320, height: 240 } })
    expect(validateBrowserRequest({ operation: 'screenshot', width: 640.1, height: 480.9 })).toMatchObject({ ok: true, value: { width: 640, height: 481 } })
  })

  it('uses a safe default for missing or malformed session identities', () => {
    expect(normalizeBrowserSessionId(undefined)).toBe('default')
    expect(normalizeBrowserSessionId('../session')).toBe('default')
    expect(normalizeBrowserSessionId('s'.repeat(129))).toBe('default')
    expect(normalizeBrowserSessionId('chat_1-123')).toBe('chat_1-123')
  })

  it('bounds text including the truncation marker and preserves empty pages', () => {
    expect(boundedBrowserText('')).toBe('')
    expect(boundedBrowserText('Hello page')).toBe('Hello page')
    const bounded = boundedBrowserText('x'.repeat(MAX_BROWSER_TEXT_CHARS + 100))
    expect(bounded.length).toBe(MAX_BROWSER_TEXT_CHARS)
    expect(bounded).toContain('[Page text truncated')
    expect(boundedBrowserText('x'.repeat(MAX_BROWSER_TEXT_CHARS), true)).toBe(bounded)
    expect(() => boundedBrowserText({ secret: true })).toThrow('unavailable')
  })
})

// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isExternalWebUrl, isSameAppPage } from '../navigation'

describe('isExternalWebUrl', () => {
  it('allows http and https links', () => {
    expect(isExternalWebUrl('https://virender.in')).toBe(true)
    expect(isExternalWebUrl('http://localhost:11434')).toBe(true)
  })

  it('rejects other schemes and garbage', () => {
    for (const url of ['file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'about:blank', 'ms-settings:', 'not a url', '']) {
      expect(isExternalWebUrl(url)).toBe(false)
    }
  })
})

describe('isSameAppPage', () => {
  it('keeps navigation within the dev server origin', () => {
    expect(isSameAppPage('http://localhost:5173/#/chat', 'http://localhost:5173/')).toBe(true)
    expect(isSameAppPage('https://evil.example/', 'http://localhost:5173/')).toBe(false)
  })

  it('only allows the same file for the packaged file:// page', () => {
    const app = 'file:///D:/app/dist/index.html'
    expect(isSameAppPage('file:///D:/app/dist/index.html#settings', app)).toBe(true)
    expect(isSameAppPage('file:///D:/secret.html', app)).toBe(false)
    expect(isSameAppPage('https://virender.in', app)).toBe(false)
  })

  it('treats unparsable URLs as leaving the app', () => {
    expect(isSameAppPage('::', 'http://localhost:5173/')).toBe(false)
  })
})

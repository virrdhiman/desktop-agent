import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyThemePreference, normalizeThemePreference } from './theme'

const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../themes.css')
const css = fs.readFileSync(cssPath, 'utf8')

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readRule(source: string, selector: string): Record<string, string> {
  const body = source.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))?.[1]
  if (!body) throw new Error(`Missing CSS theme rule: ${selector}`)
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]))
}

function readSystemLightRule(source: string): Record<string, string> {
  const media = source.match(/@media\s*\(prefers-color-scheme:\s*light\)\s*\{([\s\S]*?)\n\}/)?.[1]
  if (!media) throw new Error('Missing system light theme media rule')
  return readRule(media, ':root[data-theme="system"]')
}

function rgb(hex: string): [number, number, number] {
  const normalized = hex.trim()
  const match = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (!match) throw new Error(`Expected a solid hex token, received ${hex}`)
  const value = match[1].length === 3 ? [...match[1]].map((part) => part + part).join('') : match[1]
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255) as [number, number, number]
}

function luminance(hex: string): number {
  const channels = rgb(hex).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(foreground: string, background: string): number {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

const palettes = {
  dark: readRule(css, ':root'),
  light: readRule(css, ':root[data-theme="light"]'),
  'pink-light': readRule(css, ':root[data-theme="pink-light"]'),
  'pink-dark': readRule(css, ':root[data-theme="pink-dark"]'),
  'system-light': readSystemLightRule(css),
}

describe('theme preferences', () => {
  it('defaults missing or invalid saved values to System', () => {
    expect(normalizeThemePreference(undefined)).toBe('system')
    expect(normalizeThemePreference('old-theme')).toBe('system')
    expect(normalizeThemePreference('pink-dark')).toBe('pink-dark')
  })

  it('applies the selected preference to the document root', () => {
    const root = document.createElement('html')
    expect(applyThemePreference(root, 'pink-light')).toBe('pink-light')
    expect(root.dataset.theme).toBe('pink-light')
    expect(root.style.colorScheme).toBe('light')
    expect(applyThemePreference(root, undefined)).toBe('system')
    expect(root.style.colorScheme).toBe('')
  })

  it('keeps normal text and semantic foreground/background pairs at WCAG AA contrast', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      const surfaces = ['bg-primary', 'bg-secondary', 'bg-tertiary'].map((key) => palette[key])
      const textTokens = [
        'text-primary', 'text-secondary', 'text-muted', 'accent', 'success', 'warning', 'error',
        'category-free', 'category-local', 'category-community', 'category-media', 'category-paid',
      ]
      for (const token of textTokens) {
        for (const surface of surfaces) {
          expect(contrast(palette[token], surface), `${name}: --${token} on surface`).toBeGreaterThanOrEqual(4.5)
        }
      }
      for (const [foreground, background] of [
        ['text-on-accent', 'accent'], ['text-on-success', 'success'], ['text-on-warning', 'warning'],
        ['text-on-error', 'error'], ['statusbar-text', 'statusbar-bg'], ['code-text', 'code-bg'],
      ]) {
        expect(contrast(palette[foreground], palette[background]), `${name}: --${foreground} on --${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyThemePreference, normalizeThemePreference, resolveThemeMode, THEME_PREFERENCES } from './theme'

const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../themes.css')
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(cssPath, 'utf8')

function sourceFiles(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : [file]
  })
}

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

function readPitBrandDarkRule(source: string): Record<string, string> {
  const media = source.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\n\}/)?.[1]
  if (!media) throw new Error('Missing PIT Brand dark mode media rule')
  return readRule(media, ':root[data-theme="pit-brand"]')
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
  'pit-brand-light': readRule(css, ':root[data-theme="pit-brand"]'),
  'pit-brand-dark': readPitBrandDarkRule(css),
  'system-light': readSystemLightRule(css),
}

describe('theme preferences', () => {
  it('keeps component foreground and background colors on theme tokens', () => {
    const files = [
      ...sourceFiles(path.join(srcRoot, 'components')).filter((file) => /\.tsx?$/.test(file) && !/\.(?:test|spec)\.tsx?$/.test(file)),
      path.join(srcRoot, 'styles.ts'),
      path.join(srcRoot, 'lib', 'highlight.ts'),
    ]
    const hardcoded = files.filter((file) => /\b(?:color|background(?:Color)?)\s*:\s*['"]\s*(?:#[\da-f]{3,8}|rgba?\()/i.test(fs.readFileSync(file, 'utf8')))
    expect(hardcoded.map((file) => path.relative(srcRoot, file))).toEqual([])
  })

  it('defaults unchosen themes to PIT Brand and preserves every explicit existing choice', () => {
    expect(THEME_PREFERENCES).toEqual(['pit-brand', 'system', 'light', 'dark', 'pink-light', 'pink-dark'])
    expect(normalizeThemePreference(undefined)).toBe('pit-brand')
    expect(normalizeThemePreference('old-theme')).toBe('pit-brand')
    for (const explicit of ['system', 'light', 'dark', 'pink-light', 'pink-dark']) {
      expect(normalizeThemePreference(explicit)).toBe(explicit)
    }
    expect(normalizeThemePreference('pit-brand-light')).toBe('pit-brand')
    expect(normalizeThemePreference('pit-brand-dark')).toBe('pit-brand')
  })

  it('applies the selected preference to the document root', () => {
    const root = document.createElement('html')
    expect(applyThemePreference(root, 'pink-light')).toBe('pink-light')
    expect(root.dataset.theme).toBe('pink-light')
    expect(root.style.colorScheme).toBe('light')
    expect(applyThemePreference(root, undefined)).toBe('pit-brand')
    expect(root.style.colorScheme).toBe('')
    expect(applyThemePreference(root, 'pit-brand')).toBe('pit-brand')
    expect(root.dataset.theme).toBe('pit-brand')
    expect(root.style.colorScheme).toBe('')
    expect(applyThemePreference(root, 'system')).toBe('system')
    expect(root.style.colorScheme).toBe('')
  })

  it('resolves adaptive themes from the operating system and keeps fixed palettes fixed', () => {
    expect(resolveThemeMode('pit-brand', 'light')).toBe('light')
    expect(resolveThemeMode('pit-brand', 'dark')).toBe('dark')
    expect(resolveThemeMode('system', 'dark')).toBe('dark')
    expect(resolveThemeMode('pink-light', 'dark')).toBe('light')
    expect(resolveThemeMode('pink-dark', 'light')).toBe('dark')
  })

  it('keeps normal text and semantic foreground/background pairs at WCAG AA contrast', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      const surfaces = ['bg-primary', 'bg-secondary', 'bg-tertiary'].map((key) => palette[key])
      const textTokens = [
        'text-primary', 'text-secondary', 'text-muted', 'text-placeholder', 'text-disabled', 'accent', 'success', 'warning', 'error',
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
      for (const token of ['syntax-string', 'syntax-comment', 'syntax-number', 'syntax-keyword', 'syntax-type']) {
        expect(contrast(palette[token], palette['code-bg']), `${name}: --${token} on --code-bg`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('uses measured Productive IT logo colors with accessible green indicators', () => {
    const light = palettes['pit-brand-light']
    const dark = palettes['pit-brand-dark']
    expect(light['brand-green']).toBe('#84B340')
    expect(dark['brand-green']).toBe('#84B340')
    expect(light['brand-navy']).toBe('#465493')
    expect(dark['brand-navy']).toBe('#465493')
    expect(light.accent).toBe(light['brand-navy'])
    expect(light['text-on-accent']).toBe('#ffffff')
    expect(dark.accent).toBe(dark['brand-green'])

    for (const surface of ['bg-primary', 'bg-secondary', 'bg-tertiary']) {
      expect(contrast(light['brand-green-text'], light[surface]), `PIT Brand Light green text on --${surface}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(light['tab-active'], light[surface]), `PIT Brand Light active tab on --${surface}`).toBeGreaterThanOrEqual(3)
      expect(contrast(light['focus-ring'], light[surface]), `PIT Brand Light focus ring on --${surface}`).toBeGreaterThanOrEqual(3)
      expect(contrast(dark['brand-green'], dark[surface]), `PIT Brand Dark logo green on --${surface}`).toBeGreaterThanOrEqual(3)
      expect(contrast(dark['focus-ring'], dark[surface]), `PIT Brand Dark focus ring on --${surface}`).toBeGreaterThanOrEqual(3)
    }
  })
})

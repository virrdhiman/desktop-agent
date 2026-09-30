import { describe, it, expect } from 'vitest'
import { highlightSyntax } from './highlight'

const visibleText = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

describe('highlightSyntax', () => {
  it('never leaks markup into the visible text', () => {
    for (const code of [
      '{"name": "read_file", "args": {"path": "smoke-editor.ts"}}',
      'const color = "#98c379" // 42 Items',
      "def f(x):\n    return 'It\\'s' # comment 7",
      'if (a < b && c > 0) { return "<div>" }',
    ]) {
      expect(visibleText(highlightSyntax(code))).toBe(code)
    }
  })

  it('colors strings, keywords, numbers, and types once each', () => {
    const html = highlightSyntax('const x: Foo = "a" + 1')
    expect(html).toContain('<span style="color:#c678dd">const</span>')
    expect(html).toContain('<span style="color:#e5c07b">Foo</span>')
    expect(html).toContain('<span style="color:#98c379">"a"</span>')
    expect(html).toContain('<span style="color:#d19a66">1</span>')
  })

  it('does not highlight keywords inside strings', () => {
    expect(highlightSyntax('"return if"')).toBe('<span style="color:#98c379">"return if"</span>')
  })

  it('escapes HTML in code', () => {
    expect(highlightSyntax('<script>')).toBe('&lt;script&gt;')
  })

  it('uses language-specific keywords', () => {
    expect(highlightSyntax('def run', 'python')).toContain('<span style="color:#c678dd">def</span>')
    expect(highlightSyntax('def run', 'ts')).not.toContain('<span style="color:#c678dd">def</span>')
  })
})

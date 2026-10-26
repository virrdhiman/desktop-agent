import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { highlightSyntax } from './highlight'

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rendererNodeGlobals = /\bprocess\s*\.\s*(?:env|platform|cwd|argv|pid|versions|nextTick|exit|stdin|stdout|stderr|release|execPath)\b/g

function rendererFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) return rendererFiles(full)
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.test\.(?:ts|tsx)$/.test(entry.name)) return []
    return [full]
  })
}

describe('renderer safety regressions', () => {
  it('contains no unguarded Node process globals in renderer source', () => {
    const violations = rendererFiles(sourceRoot).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8')
      return [...source.matchAll(rendererNodeGlobals)].map((match) => `${path.relative(sourceRoot, file)}:${match.index}`)
    })
    expect(violations).toEqual([])
  })

  it('renders model HTML/CSS as escaped code text, never live markup', () => {
    const html = highlightSyntax('<script>alert("xss")</script><style>body{display:none}</style>', 'html')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<style>')
  })
})

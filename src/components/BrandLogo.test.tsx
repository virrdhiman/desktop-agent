import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BrandLogo from './BrandLogo'
import fs from 'node:fs'
import path from 'node:path'

describe('BrandLogo', () => {
  it('uses the supplied full logo by default', () => {
    render(<BrandLogo />)
    const logo = screen.getByRole('img', { name: 'Productive IT' })
    expect(logo).toHaveAttribute('src', expect.stringContaining('pit-logo'))
    expect(logo).toHaveClass('vd-brand-logo-full')
  })

  it('uses the generated trimmed mark when requested', () => {
    render(<BrandLogo variant="mark" alt="Productive IT mark" />)
    const logo = screen.getByRole('img', { name: 'Productive IT mark' })
    expect(logo).toHaveAttribute('src', expect.stringContaining('pit-logo-trimmed'))
    expect(logo).toHaveClass('vd-brand-logo-mark')
  })

  it('does not place a background box behind any transparent logo variant', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8')
    for (const selector of ['.vd-brand-logo-full', '.vd-brand-logo-mark', '.vd-sidebar-brand-mark', '.vd-rail-brand', '.vd-avatar']) {
      const escaped = selector.replace(/\./g, '\\.')
      const rule = css.match(new RegExp(`${escaped}[^{}]*\\{([^}]*)\\}`))?.[1]
      expect(rule, `missing ${selector} style`).toBeTruthy()
      const backgrounds = [...(rule || '').matchAll(/background(?:-color)?\s*:\s*([^;]+)/gi)].map((match) => match[1].trim())
      expect(backgrounds.every((background) => background === 'transparent'), `${selector} must let the selected theme show through`).toBe(true)
    }
  })
})

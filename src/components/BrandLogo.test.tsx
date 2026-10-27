import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BrandLogo from './BrandLogo'

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
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildApprovalHtml } from '../approvalPage'

describe('approval page', () => {
  it('shows the full command and escapes markup', () => {
    const command = `echo ${'x'.repeat(900)} <script>`
    const html = buildApprovalHtml('Allow?', command)
    expect(html).toContain('x'.repeat(900))
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('https://approve.vd-agent.invalid/allow')
  })
})

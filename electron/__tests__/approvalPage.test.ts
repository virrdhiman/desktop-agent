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

  it('offers approve, edit, and reject for an exact editable preview', () => {
    const html = buildApprovalHtml('Review agent change', 'diff --git a/a.txt b/a.txt', 'new content')
    expect(html).toContain('Approve')
    expect(html).toContain('Edit')
    expect(html).toContain('Reject')
    expect(html).toContain('new content')
    expect(html).toContain('approve.vd-agent.invalid/edit')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import HelpPanel from './HelpPanel'

describe('HelpPanel diagnostics', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows only the last 200 lines and copies the bounded report visibly', async () => {
    const lines = Array.from({ length: 201 }, (_, index) => `line-${index}`)
    vi.mocked(window.api.readDiagnostics).mockResolvedValue({
      report: {
        application: { name: 'PIT Agent', version: '1.2.3', platform: 'win32', osRelease: 'test', architecture: 'x64' },
        settings: { activeProviderConfigured: false },
      },
      lines,
      reportText: 'bounded diagnostics report',
    } as any)
    vi.mocked(window.api.copyDiagnostics).mockResolvedValue({ success: true })

    render(<HelpPanel />)

    const log = await screen.findByLabelText('Diagnostics log')
    expect(log).toHaveTextContent('line-200')
    expect(log).not.toHaveTextContent('line-0')
    expect(screen.getByText(/activeProviderConfigured/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }))
    expect(await screen.findByRole('status')).toHaveTextContent('copied to the clipboard')
    expect(window.api.copyDiagnostics).toHaveBeenCalledWith('bounded diagnostics report')
  })

  it('shows an empty state when there are no log lines', async () => {
    vi.mocked(window.api.readDiagnostics).mockResolvedValue({ lines: [], report: {} as any, reportText: '' })
    render(<HelpPanel />)
    expect(await screen.findByText('No diagnostic events recorded.')).toBeInTheDocument()
  })
})

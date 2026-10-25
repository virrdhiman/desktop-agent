import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SurfaceSwitch from './SurfaceSwitch'

describe('SurfaceSwitch', () => {
  beforeEach(() => {
    vi.mocked(window.api.openIdeWindow).mockReset()
    vi.mocked(window.api.openIdeWindow).mockResolvedValue({ opened: true, created: true })
  })

  it('opens the IDE window even when no workspace is open', async () => {
    render(<SurfaceSwitch />)
    fireEvent.click(screen.getByRole('button', { name: 'Code' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('IDE window opened'))
    expect(window.api.openIdeWindow).toHaveBeenCalledOnce()
  })

  it('reports when the existing IDE window is focused', async () => {
    vi.mocked(window.api.openIdeWindow).mockResolvedValue({ opened: true, created: false })
    render(<SurfaceSwitch />)
    fireEvent.click(screen.getByRole('button', { name: 'Code' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('IDE window focused'))
  })

  it('focuses the Agent window when used from the IDE window', async () => {
    window.api.windowRole = 'ide'
    vi.mocked(window.api.focusMainWindow).mockResolvedValue({ success: true })
    render(<SurfaceSwitch />)
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Agent window focused'))
    expect(window.api.focusMainWindow).toHaveBeenCalledOnce()
    window.api.windowRole = 'main'
  })
})

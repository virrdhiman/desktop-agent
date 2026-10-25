import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import SurfaceSwitch from './SurfaceSwitch'
import { mergeLayoutPreferences } from '../lib/layoutPersistence'

describe('SurfaceSwitch', () => {
  beforeEach(() => {
    useStore.setState({ workspacePath: '', settings: { ...useStore.getState().settings, layout: mergeLayoutPreferences(useStore.getState().settings.layout, { surface: 'agent' }) } })
    vi.mocked(window.api.vscodeOpenWorkspace).mockReset()
    vi.mocked(window.api.openDirectory).mockReset()
  })

  it('explains that a workspace is required and offers Open folder', () => {
    render(<SurfaceSwitch />)
    fireEvent.click(screen.getByRole('button', { name: 'Code (VS Code)' }))
    expect(screen.getByRole('status')).toHaveTextContent('Open a workspace folder first')
    expect(screen.getByRole('button', { name: 'Open folder' })).toBeInTheDocument()
    expect(window.api.vscodeOpenWorkspace).not.toHaveBeenCalled()
  })

  it('opens the current workspace and reports success', async () => {
    useStore.setState({ workspacePath: 'C:/workspace' })
    vi.mocked(window.api.vscodeOpenWorkspace).mockResolvedValue({ result: 'Opened workspace in VS Code: C:/workspace' })
    render(<SurfaceSwitch />)
    fireEvent.click(screen.getByRole('button', { name: 'Code (VS Code)' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Opened workspace in VS Code'))
    expect(window.api.vscodeOpenWorkspace).toHaveBeenCalledWith('C:/workspace')
  })

  it('reports the exact launch error and install hint', async () => {
    useStore.setState({ workspacePath: 'C:/workspace' })
    vi.mocked(window.api.vscodeOpenWorkspace).mockResolvedValue({ error: 'VS Code CLI was not found. Checked PATH and standard install locations.' })
    render(<SurfaceSwitch />)
    fireEvent.click(screen.getByRole('button', { name: 'Code (VS Code)' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Checked PATH and standard install locations'))
    expect(screen.getByRole('status')).toHaveTextContent('Install VS Code')
  })
})

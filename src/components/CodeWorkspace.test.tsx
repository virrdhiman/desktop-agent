import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import { mergeLayoutPreferences } from '../lib/layoutPersistence'
import CodeWorkspace from './CodeWorkspace'

vi.mock('./CodeEditor', () => ({ default: () => <div aria-label="Editor empty state">Open a file to start editing</div> }))
vi.mock('./GitPanel', () => ({ default: () => <div>Source Control</div> }))
vi.mock('./MultiTerminal', () => ({ default: () => <div>Terminal</div> }))
vi.mock('./SearchResults', () => ({ default: () => <div>Search results</div> }))
vi.mock('./AgentChat', () => ({ default: () => <div>Agent composer</div> }))

describe('CodeWorkspace', () => {
  beforeEach(() => {
    useStore.setState({
      workspacePath: '', files: [], selectedFile: null, openFiles: [], fileContent: '', fileDirty: false,
      settings: { ...useStore.getState().settings, layout: mergeLayoutPreferences(useStore.getState().settings.layout, { surface: 'code' }) },
    })
    vi.mocked(window.api.gitLog).mockResolvedValue([])
    vi.mocked(window.api.lspDiagnostics).mockResolvedValue([])
  })

  it('does not crash without a folder and exposes real open-folder actions', async () => {
    const onOpenFolder = vi.fn().mockResolvedValue(undefined)
    const onLayout = vi.fn()
    render(<CodeWorkspace layout={useStore.getState().settings.layout!} onLayout={onLayout} onOpenFolder={onOpenFolder} onSettings={vi.fn()} onHelp={vi.fn()} onCommandPalette={vi.fn()} />)
    expect(screen.getByRole('region', { name: 'Code workspace' })).toBeInTheDocument()
    expect(screen.getByText('No folder open')).toBeInTheDocument()
    expect(screen.getByLabelText('Editor empty state')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Open folder' })[0])
    expect(onOpenFolder).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Toggle terminal' }))
    expect(onLayout).toHaveBeenCalledWith(expect.objectContaining({ terminalCollapsed: true }), true)
    window.dispatchEvent(new CustomEvent('vd:cursor-position', { detail: { line: 7, column: 12 } }))
    await waitFor(() => expect(screen.getByText('Ln 7, Col 12')).toBeInTheDocument())
    await waitFor(() => expect(window.api.gitLog).not.toHaveBeenCalledWith('', expect.anything()))
  })
})

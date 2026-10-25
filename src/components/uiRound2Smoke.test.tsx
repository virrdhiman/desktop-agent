import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AppMenuBar from './AppMenuBar'
import WorkingModeSelector from './WorkingModeSelector'
import { normalizeDataToolSettings } from '../lib/dataToolSettings'
import type { Settings } from '../types'

const settings: Settings = {
  ...normalizeDataToolSettings({}),
  providers: [{ id: 'cloud', name: 'Cloud', apiKey: '', baseUrl: 'https://example.test', model: 'balanced' }],
  activeProvider: 'cloud',
  workspacePath: 'C:/workspace',
  layout: {
    version: 1, leftRailCollapsed: false, sidebarCollapsed: false, historyCollapsed: false,
    launcherCollapsed: false, terminalCollapsed: false, sidebarWidth: 260, historyWidth: 240,
    launcherWidth: 52, terminalHeight: 220, workingMode: 'build', surface: 'agent',
  },
}

describe('Round 2 UI smoke', () => {
  it('opens the single application menu and runs real actions', () => {
    const actions = { newChat: vi.fn(), openFolder: vi.fn(), palette: vi.fn(), sidebar: vi.fn(), terminal: vi.fn(), settings: vi.fn(), help: vi.fn() }
    render(<AppMenuBar onNewChat={actions.newChat} onOpenFolder={actions.openFolder} onCommandPalette={actions.palette} onToggleSidebar={actions.sidebar} onToggleTerminal={actions.terminal} onSettings={actions.settings} onHelp={actions.help} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Toggle terminal' }))
    expect(actions.terminal).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open folder…' }))
    expect(actions.openFolder).toHaveBeenCalledOnce()
  })

  it('renders the composer working-mode control as an accessible menu', () => {
    const onChange = vi.fn()
    render(<WorkingModeSelector settings={settings} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Working mode' }))
    expect(screen.getByRole('menu', { name: 'Working modes' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Debug/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /Plan/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ planMode: true }))
  })
})

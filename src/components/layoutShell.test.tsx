import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import LeftRail from './LeftRail'
import ComposerAddMenu from './ComposerAddMenu'
import ComposerControls from './ComposerControls'
import WorkingModeSelector from './WorkingModeSelector'
import { normalizeDataToolSettings } from '../lib/dataToolSettings'
import type { Settings } from '../types'

const settings: Settings = {
  ...normalizeDataToolSettings({ pdfToolEnabled: true, spreadsheetToolEnabled: true, ocrToolEnabled: true }),
  providers: [
    { id: 'cloud', name: 'Cloud', apiKey: '', baseUrl: 'https://example.test', model: 'cloud-balanced' },
    { id: 'ollama', name: 'Ollama', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5-coder:7b' },
  ],
  activeProvider: 'cloud', workspacePath: 'C:/workspace', responseEffort: 'medium', teamTokenBudget: 'balanced', teamMode: 'auto', browserToolEnabled: false,
}

describe('layout shell controls', () => {
  it('provides accessible primary rail actions', () => {
    const onSettings = vi.fn()
    render(<LeftRail activePanel="chat" collapsed={false} onToggle={vi.fn()} onHome={vi.fn()} onSettings={onSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onSettings).toHaveBeenCalledOnce()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
  })

  it('opens the add menu from plus and filters real capabilities', () => {
    const onInput = vi.fn()
    render(<ComposerAddMenu input="" workspacePath="C:/workspace" allFiles={[]} settings={settings} planMode={false} onInput={onInput} onSettings={vi.fn()} onPlanMode={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add context or capability' }))
    expect(screen.getByRole('menu', { name: 'Add to composer' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter add actions' }), { target: { value: 'spreadsheet' } })
    expect(screen.getByRole('menuitem', { name: /Spreadsheets/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Browser/ })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Filter add actions' }), { key: 'Enter' })
    expect(onInput).toHaveBeenCalledWith('[Capability: spreadsheets] ')
  })

  it('opens the add menu when slash starts the composer', async () => {
    render(<ComposerAddMenu input="/" workspacePath="C:/workspace" allFiles={[]} settings={settings} planMode={false} onInput={vi.fn()} onSettings={vi.fn()} onPlanMode={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('menu', { name: 'Add to composer' })).toBeInTheDocument())
  })

  it('toggles plan mode and keeps the goal action persistent through settings', () => {
    const onPlanMode = vi.fn()
    const onSettings = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('Ship the release safely')
    render(<ComposerAddMenu input="" workspacePath="C:/workspace" allFiles={[]} settings={settings} planMode={false} onInput={vi.fn()} onSettings={onSettings} onPlanMode={onPlanMode} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add context or capability' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Plan mode/ }))
    expect(onPlanMode).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add context or capability' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /GoalKeep a goal/ }))
    expect(onSettings).toHaveBeenCalledWith(expect.objectContaining({ goal: 'Ship the release safely' }))
    vi.restoreAllMocks()
  })

  it('wires budget, model, provider source, and effort controls to settings', () => {
    const onSettings = vi.fn()
    const onModelOverride = vi.fn()
    render(<ComposerControls settings={settings} activeProvider={settings.providers[0]} availableModels={['cloud-balanced', 'cloud-pro']} modelOverride={null} onModelOverride={onModelOverride} onSettings={onSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /Auto model|cloud-balanced/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Powerful' }))
    fireEvent.click(screen.getByRole('button', { name: /cloud-pro/ }))
    expect(onModelOverride).toHaveBeenCalledWith('cloud-pro')
    fireEvent.click(screen.getByRole('button', { name: 'Local' }))
    expect(onSettings).toHaveBeenCalledWith(expect.objectContaining({ activeProvider: 'ollama' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Response effort' }), { target: { value: '2' } })
    expect(onSettings).toHaveBeenCalledWith(expect.objectContaining({ responseEffort: 'high' }))
  })

  it('routes Multitask to the existing multi-agent team mode', () => {
    const onChange = vi.fn()
    render(<WorkingModeSelector settings={settings} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Working mode' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Multitask/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ teamMode: 'always', planMode: false, layout: expect.objectContaining({ workingMode: 'multitask' }) }))
  })
})

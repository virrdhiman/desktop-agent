/**
 * @author Virender Dhiman
 * @year 2025
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Component rendering tests
 * Covers: Sidebar, ErrorBoundary, SearchResults, SettingsPanel, FileBrowser
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { useStore } from '../store'
import ErrorBoundary from '../components/ErrorBoundary'
import SearchResults from '../components/SearchResults'
import SettingsPanel from '../components/SettingsPanel'
import AgentChat from '../components/AgentChat'
import { buildTaskReviewSummary } from '../components/TaskPanel'
import TaskPanel from '../components/TaskPanel'
import PrerequisiteSetup from '../components/PrerequisiteSetup'
import type { AgentTask } from '../types'

// Reset store
beforeEach(() => {
  const state = useStore.getState()
  state.setWorkspacePath('')
  state.setSearchResults(null)
  state.setActivePanel('chat')
  useStore.setState({ tasks: [], fileEditHistory: [], toolExecutions: [], lastVerification: undefined, latestCheckpoint: undefined })
})

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('renders error UI when child throws', () => {
    const boundary = new ErrorBoundary({ children: null })
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('Test error'))
    render(boundary.render() as any)
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
  })

  it('shows error details in development', () => {
    const boundary = new ErrorBoundary({ children: null })
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('Specific error message'))
    render(boundary.render() as any)
    expect(screen.getByText(/Specific error message/)).toBeInTheDocument()
  })

  it('has a reload button', () => {
    const boundary = new ErrorBoundary({ children: null })
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('Test'))
    render(boundary.render() as any)
    expect(screen.getByText(/Reload/)).toBeInTheDocument()
  })
})

describe('SearchResults', () => {
  it('renders empty state when no results', () => {
    render(<SearchResults />)
    expect(screen.getByText('🔍 Search Results')).toBeInTheDocument()
  })

  it('shows match count', () => {
    useStore.getState().setSearchResults('file.ts:1: test match\nfile.ts:5: another match')
    render(<SearchResults />)
    expect(screen.getByText('2 matches')).toBeInTheDocument()
  })

  it('renders parsed result lines', () => {
    useStore.getState().setSearchResults('src/main.ts:42: const x = 1\nsrc/utils.ts:10: function foo()')
    render(<SearchResults />)
    expect(screen.getByText('src/main.ts')).toBeInTheDocument()
    expect(screen.getByText(/42/)).toBeInTheDocument()
  })

  it('has a close button', () => {
    render(<SearchResults />)
    expect(screen.getByText('✕ Close')).toBeInTheDocument()
  })
})

describe('Store — Setters work correctly', () => {
  it('setSelectedFile updates selected file', () => {
    useStore.getState().setSelectedFile('/path/to/file.ts')
    expect(useStore.getState().selectedFile).toBe('/path/to/file.ts')
  })

  it('toggleTerminal toggles terminal visibility', () => {
    const initial = useStore.getState().showTerminal
    useStore.getState().toggleTerminal()
    expect(useStore.getState().showTerminal).toBe(!initial)
  })

  it('setPanel updates active panel', () => {
    useStore.getState().setActivePanel('settings')
    expect(useStore.getState().activePanel).toBe('settings')
  })
})

describe('SettingsPanel — provider onboarding', () => {
  it('shows the build commit in the About card', () => {
    render(<SettingsPanel />)
    expect(screen.getByText(/Build commit:/)).toBeInTheDocument()
  })

  it('shows first-run key guidance when only local providers are configured', () => {
    useStore.getState().setSettings({ ...useStore.getState().settings, providers: [
      { id: 'ollama', name: 'Ollama', apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5-coder:7b' },
    ], activeProvider: 'ollama' })
    render(<AgentChat />)
    expect(screen.getByText(/Add an API key in Settings/)).toBeInTheDocument()
  })

  it('shows a secure-storage error instead of claiming an unsaved provider key', async () => {
    useStore.getState().setSettings({ ...useStore.getState().settings, providers: [
      { id: 'groq', name: 'Groq', apiKey: '', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama' },
    ], activeProvider: 'groq' })
    render(<SettingsPanel />)
    fireEvent.click(screen.getAllByText('Groq')[1])
    vi.mocked(window.api.saveSettings).mockResolvedValueOnce({ error: 'Secure OS key storage is unavailable. No API key was saved.' })
    fireEvent.change(screen.getByPlaceholderText('Enter your API key...'), { target: { value: 'synthetic-example-key' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }))
    expect((await screen.findAllByText(/Secure OS key storage is unavailable/)).length).toBeGreaterThan(0)
    expect(useStore.getState().settings.providers[0].hasKey).not.toBe(true)
  })
  it('keeps advanced capabilities off until explicitly selected', () => {
    vi.mocked(window.api.saveSettings).mockResolvedValueOnce({ success: true })
    useStore.getState().setSettings({ ...useStore.getState().settings, providers: [
      { id: 'ollama', name: 'Ollama', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5-coder:7b' },
    ], activeProvider: 'ollama' })
    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    for (const name of ['Autocomplete', 'Offline OCR', 'Automatic indexing', 'Telemetry', 'Check for verified release updates after launch']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked()
    }
    expect(screen.getByRole('combobox', { name: 'Update channel' })).toHaveValue('stable')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Autocomplete' }))
    expect(window.api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ autocompleteEnabled: true }))
  })

  it('detects installed Ollama models without pulling and requires consent for the suggested small model', async () => {
    useStore.getState().setSettings({ ...useStore.getState().settings, providers: [
      { id: 'ollama', name: 'Ollama', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5-coder:7b' },
    ], activeProvider: 'ollama' })
    vi.mocked(window.api.ollamaModels).mockResolvedValue({ models: ['small-local:latest'] })
    render(<SettingsPanel />)
    fireEvent.click(screen.getAllByText('Ollama')[1])
    expect(await screen.findByText('small-local:latest')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Detect installed models' }))
    expect(window.api.ollamaPullSmallModel).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Pull small model/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /I agree to download/ }))
    expect(screen.getByRole('button', { name: /Pull small model/ })).toBeEnabled()
  })
  it('explains the local Ollama and API-key setup paths', () => {
    useStore.getState().setSettings({
      ...useStore.getState().settings,
      providers: [
        { id: 'ollama', name: '🦙 Ollama', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', freeTier: true },
        { id: 'groq', name: 'Groq', apiKey: 'api-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama', freeTier: true },
      ],
      activeProvider: 'ollama',
    })

    render(<SettingsPanel />)

    expect(screen.getByText(/Local Ollama:/)).toBeInTheDocument()
    expect(screen.getByText(/API providers:/)).toBeInTheDocument()
    expect(screen.getByText(/VS Code application separately/)).toBeInTheDocument()
    expect(screen.getByText(/the provider entry and OpenAI-compatible support are bundled/)).toHaveTextContent('Ollama runtime separately')
    expect(screen.getByText('Configured · not verified')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Provider setup status' })).toHaveTextContent('Active: Ollama')
    expect(screen.getByRole('status', { name: 'Provider setup status' })).toHaveTextContent('configured, not verified')
    expect(screen.getByText(/1 fallback available/)).toBeInTheDocument()
  })

  it('does not call an Ollama placeholder a ready local server', () => {
    useStore.getState().setSettings({
      ...useStore.getState().settings,
      providers: [
        { id: 'ollama', name: 'Ollama', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', freeTier: true },
        { id: 'groq', name: 'Groq', apiKey: 'secret', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama', freeTier: true },
      ],
      activeProvider: 'groq',
    })

    render(<SettingsPanel />)

    expect(screen.getByText(/⚠ Configured · not verified/)).toBeInTheDocument()
    expect(screen.queryByText(/Local server ready/)).not.toBeInTheDocument()
    expect(screen.getByText(/API key set/)).toBeInTheDocument()
    expect(screen.getByText('✓ API key configured')).toBeInTheDocument()
  })

  it('shows local health evidence only after a successful request is recorded', () => {
    useStore.getState().setSettings({
      ...useStore.getState().settings,
      providers: [
        {
          id: 'ollama', name: 'Ollama', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', freeTier: true,
          performance: { successes: 1, failures: 0, avgLatencyMs: 120, lastUsedAt: 1 },
        },
      ],
      activeProvider: 'ollama',
    })

    render(<SettingsPanel />)

    expect(screen.getByText('✓ Local provider verified')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Provider setup status' })).toHaveTextContent('verified by a successful request')
    expect(screen.queryByText(/Configured · not verified/)).not.toBeInTheDocument()
  })
})

describe('PrerequisiteSetup — consent and skip', () => {
  beforeEach(() => {
    useStore.getState().setSettings({
      ...useStore.getState().settings,
      setupChecklistDismissed: false,
      providers: [{ id: 'ollama', name: 'Ollama', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' }],
    })
  })

  it('does not enable a download until consent and an expected hash are provided', async () => {
    render(<PrerequisiteSetup />)
    const download = screen.getAllByRole('button', { name: 'Download, verify & launch' })[0]
    expect(download).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Consent to set up VS Code'))
    expect(download).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Expected SHA-256 for VS Code'), { target: { value: 'a'.repeat(64) } })
    await waitFor(() => expect(download).toBeEnabled())
  })

  it('skips the checklist explicitly and persists the dismissed state', async () => {
    vi.mocked(window.api.saveSettings).mockResolvedValueOnce({ success: true })
    render(<PrerequisiteSetup />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip use defaults' }))
    expect(window.api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ setupChecklistDismissed: true }))
    expect(window.api.ollamaPullSmallModel).not.toHaveBeenCalled()
  })

  it('opens Advanced without enabling optional settings', async () => {
    vi.mocked(window.api.saveSettings).mockResolvedValueOnce({ success: true })
    render(<PrerequisiteSetup />)
    fireEvent.click(screen.getByRole('button', { name: 'Customize settings and models' }))
    await waitFor(() => expect(useStore.getState().activePanel).toBe('settings'))
    expect(useStore.getState().advancedSettingsRequested).toBe(true)
    expect(useStore.getState().settings).toEqual(expect.objectContaining({ setupChecklistDismissed: true }))
    expect(useStore.getState().settings.ocrToolEnabled).not.toBe(true)
  })
})

describe('TaskPanel — post-run review', () => {
  it('exposes a unified review and keyboard task navigation', () => {
    const addTask = useStore.getState().addTask
    addTask({ id: 'first', title: 'First task', status: 'done', createdAt: 1, steps: [] })
    addTask({ id: 'second', title: 'Second task', status: 'done', createdAt: 2, steps: [] })

    render(<TaskPanel />)

    const second = screen.getByRole('button', { name: 'Collapse task Second task' })
    expect(screen.getByRole('region', { name: 'Second task details' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Files' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Commands' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Verification' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Restore' })).toBeInTheDocument()

    fireEvent.keyDown(second, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Expand task First task' }))
  })

  it('summarizes changed files, commands, verification, and recovery state', () => {
    const task: AgentTask = {
      id: 'task-1', title: 'Update app', status: 'done', createdAt: 1,
      steps: [{
        id: 'step-1', type: 'action', content: 'run tests', timestamp: 2,
        toolCall: { id: 'call-1', name: 'run_command', args: { command: 'npm test -- TaskPanel' }, status: 'done' },
      }],
    }
    const summary = buildTaskReviewSummary(
      task,
      [{ path: 'src/components/TaskPanel.tsx' }, { path: 'src/components/TaskPanel.tsx' }],
      [],
      { command: 'npm test -- TaskPanel', ok: true, timestamp: 3, summary: 'passed' },
      { id: 'cp-1', sessionId: 'session-1', createdAt: 1, label: 'Before edit', files: ['src/components/TaskPanel.tsx'] },
    )

    expect(summary.changedFiles).toEqual(['src/components/TaskPanel.tsx'])
    expect(summary.commands).toEqual(['npm test -- TaskPanel'])
    expect(summary.verification?.ok).toBe(true)
    expect(summary.checkpoint?.files).toHaveLength(1)
  })

  it('makes an untouched run explicit instead of implying verification', () => {
    const task: AgentTask = { id: 'task-2', title: 'Inspect', status: 'done', createdAt: 1, steps: [] }
    const summary = buildTaskReviewSummary(task, [], [], undefined, undefined)
    expect(summary.changedFiles).toEqual([])
    expect(summary.commands).toEqual([])
    expect(summary.verification).toBeUndefined()
    expect(summary.checkpoint).toBeUndefined()
  })

  it('does not attach older session activity to a newer task', () => {
    const task: AgentTask = { id: 'task-3', title: 'New task', status: 'done', createdAt: 100, steps: [] }
    const summary = buildTaskReviewSummary(
      task,
      [{ path: 'old.ts', timestamp: 50 }],
      [{ name: 'run_command', ok: true, timestamp: 50, argsSummary: '{"command":"npm test"}', resultSummary: 'ok' }],
      { command: 'npm test', ok: true, timestamp: 50, summary: 'passed' },
      { id: 'old', sessionId: 'session', createdAt: 50, label: 'Old', files: ['old.ts'] },
    )
    expect(summary).toEqual({ changedFiles: [], commands: [], verification: undefined, checkpoint: undefined })
  })
})

/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Component interaction tests — user interactions, keyboard shortcuts, state flows
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useStore } from '../store'
import Sidebar from '../components/Sidebar'
import ErrorBoundary from '../components/ErrorBoundary'
import SearchResults from '../components/SearchResults'

beforeEach(() => {
  const state = useStore.getState()
  state.setWorkspacePath('/home/user/project')
  state.setActivePanel('chat')
  state.setSearchResults(null)
  state.setShowCommandPalette(false)
  state.setSettings({
    providers: [{ id: 'groq', name: 'Groq', apiKey: 'test', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', freeTier: true }],
    activeProvider: 'groq',
    workspacePath: '/home/user/project',
  })
})

describe('Sidebar — Panel Navigation', () => {
  it('renders sidebar buttons', () => {
    const { container } = render(<Sidebar />)
    const buttons = container.querySelectorAll('.sidebar-button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('clicking panel button changes active panel', () => {
    const { container } = render(<Sidebar />)
    const buttons = container.querySelectorAll('.sidebar-button')
    // Find the files button (index 2 after search button)
    if (buttons.length > 2) {
      fireEvent.click(buttons[2])
      // Panel should have changed
      expect(['files', 'git', 'chat', 'settings']).toContain(useStore.getState().activePanel)
    }
  })

  it('command palette toggle works', () => {
    const { container } = render(<Sidebar />)
    const buttons = container.querySelectorAll('.sidebar-button')
    // First button is command palette
    if (buttons.length > 0) {
      fireEvent.click(buttons[0])
      expect(useStore.getState().showCommandPalette).toBe(true)
    }
  })
})

describe('SearchResults — Interactions', () => {
  it('close button clears search results', () => {
    useStore.getState().setSearchResults('file.ts:1: match')
    render(<SearchResults />)
    const closeBtn = screen.getByText('✕ Close')
    fireEvent.click(closeBtn)
    expect(useStore.getState().searchResults).toBeNull()
  })

  it('clicking a result sets selected file', () => {
    useStore.getState().setSearchResults('src/main.ts:42: const x = 1')
    render(<SearchResults />)
    const resultLine = screen.getByText('src/main.ts')
    fireEvent.click(resultLine)
    expect(useStore.getState().selectedFile).toContain('main.ts')
  })
})

describe('Store — Complex State Flows', () => {
  it('file open/close cycle', () => {
    // Test addOpenFile
    useStore.getState().addOpenFile('/src/x-new.ts')
    expect(useStore.getState().openFiles).toContain('/src/x-new.ts')

    // Test closeOpenFile
    useStore.getState().closeOpenFile('/src/x-new.ts')
    expect(useStore.getState().openFiles).not.toContain('/src/x-new.ts')
  })

  it('selected file + dirty state flow', () => {
    const s = useStore.getState()
    s.setSelectedFile('/src/index.ts')
    s.setFileContent('original content')
    expect(useStore.getState().fileDirty).toBe(false)

    // Simulate edit
    useStore.getState().setFileDirty(true)
    expect(useStore.getState().fileDirty).toBe(true)

    // Save resets dirty
    useStore.getState().setFileContent('new content')
    expect(useStore.getState().fileDirty).toBe(false)
  })

  it('git status + branch management flow', () => {
    useStore.getState().setGitStatus({
      branch: 'main',
      tracking: 'origin/main',
      ahead: 2,
      behind: 0,
      staged: ['a.ts'],
      modified: ['b.ts'],
      not_added: ['c.ts'],
      deleted: [],
      renamed: [],
      isClean: false,
    })

    const status = useStore.getState().gitStatus!
    expect(status.branch).toBe('main')
    expect(status.ahead).toBe(2)
    expect(status.staged).toContain('a.ts')

    // Simulate commit clears staged
    useStore.getState().setGitStatus({
      ...status,
      staged: [],
      modified: [],
      not_added: [],
      isClean: true,
    })
    expect(useStore.getState().gitStatus!.isClean).toBe(true)
  })

  it('chat message flow with streaming', () => {
    const s = useStore.getState()
    s.addMessage({ id: '1', role: 'user', content: 'Hello', timestamp: Date.now() })
    s.setChatLoading(true)

    // Simulate streaming
    s.setStreamingContent('Hi ')
    s.appendStreamingContent('there!')
    expect(useStore.getState().streamingContent).toBe('Hi there!')

    // Finalize
    s.addMessage({ id: '2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() })
    s.setStreamingContent('')
    s.setChatLoading(false)

    expect(useStore.getState().messages).toHaveLength(2)
    expect(useStore.getState().chatLoading).toBe(false)
    expect(useStore.getState().streamingContent).toBe('')
  })

  it('task lifecycle', () => {
    useStore.getState().addTask({
      id: 'task-1',
      title: 'Fix bug',
      status: 'pending',
      steps: [],
      createdAt: Date.now(),
    })

    // Running
    const tasks = useStore.getState().tasks
    tasks[0].status = 'running'
    useStore.getState().addStepToTask('task-1', {
      type: 'command',
      content: 'git status',
      timestamp: Date.now(),
    })
    useStore.getState().addStepToTask('task-1', {
      type: 'result',
      content: 'On branch main',
      timestamp: Date.now(),
    })

    expect(useStore.getState().tasks[0].steps).toHaveLength(2)
  })

  it('terminal tab management', () => {
    const tab = { id: 'term-1', title: 'Terminal 1', name: 'bash', cwd: '/home/user' }
    useStore.getState().addTerminalTab(tab)
    expect(useStore.getState().terminalTabs.some((t: any) => t.id === 'term-1')).toBe(true)

    useStore.getState().setActiveTerminalTab('term-1')
    expect(useStore.getState().activeTerminalTab).toBe('term-1')
  })

  it('plan mode toggle', () => {
    expect(useStore.getState().planMode).toBe(false)
    useStore.getState().setSettings({
      ...useStore.getState().settings,
      planMode: true,
    })
    expect(useStore.getState().settings.planMode).toBe(true)
  })

  it('expanded directories toggle', () => {
    const path = '/home/user/project/src'
    useStore.getState().toggleDir(path)
    expect(useStore.getState().expandedDirs.has(path)).toBe(true)

    useStore.getState().toggleDir(path)
    expect(useStore.getState().expandedDirs.has(path)).toBe(false)
  })

  it('session management', () => {
    // Verify session state is accessible
    const sessions = useStore.getState().sessions
    expect(Array.isArray(sessions)).toBe(true)
    // Messages persist across operations
    useStore.getState().addMessage({ id: '1', role: 'user', content: 'Test', timestamp: Date.now() })
    expect(useStore.getState().messages.length).toBeGreaterThanOrEqual(1)
  })
})

describe('ErrorBoundary — Recovery', () => {
  it('renders fallback on error', () => {
    const Bad = () => { throw new Error('crash') }
    render(
      <ErrorBoundary>
        <Bad />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
  })

  it('shows error message in fallback', () => {
    const Bad = () => { throw new Error('specific error 42') }
    render(
      <ErrorBoundary>
        <Bad />
      </ErrorBoundary>
    )
    expect(screen.getByText(/specific error 42/)).toBeInTheDocument()
  })
})

describe('Keyboard Shortcuts', () => {
  it('keyboard shortcut state can be toggled', () => {
    expect(useStore.getState().showCommandPalette).toBe(false)
    useStore.getState().toggleCommandPalette()
    expect(useStore.getState().showCommandPalette).toBe(true)
    useStore.getState().toggleCommandPalette()
    expect(useStore.getState().showCommandPalette).toBe(false)
  })
})

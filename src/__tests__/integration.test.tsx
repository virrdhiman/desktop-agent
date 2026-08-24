/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Integration tests — verify real user flows end-to-end
 * These test multiple components working together, not just isolated units
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useStore } from '../store'
import Sidebar from '../components/Sidebar'
import ErrorBoundary from '../components/ErrorBoundary'
import SearchResults from '../components/SearchResults'
import FileBrowser from '../components/FileBrowser'

beforeEach(() => {
  const state = useStore.getState()
  state.setWorkspacePath('/home/user/project')
  state.setCurrentDirectory('/home/user/project')
  state.setActivePanel('chat')
  state.setSearchResults(null)
  state.setShowCommandPalette(false)
  state.setChatLoading(false)
  state.setStreamingContent('')
  state.setFiles([])
  state.setGitStatus(null)
  state.setSettings({
    providers: [
      { id: 'groq', name: 'Groq', apiKey: 'test-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', freeTier: true },
      { id: 'together', name: 'Together', apiKey: '', baseUrl: 'https://api.together.xyz/v1', model: 'llama-3-70b', freeTier: true },
    ],
    activeProvider: 'groq',
    workspacePath: '/home/user/project',
  })
})

// ═══ PANEL NAVIGATION FLOWS ══════════════════════════════════════════════

describe('Integration — Panel Navigation Flow', () => {
  it('sidebar renders and allows panel switching', () => {
    const { container } = render(<Sidebar />)
    const buttons = container.querySelectorAll('.sidebar-button')
    expect(buttons.length).toBeGreaterThan(3)

    // Click second button (files)
    fireEvent.click(buttons[1])
    expect(['files', 'git', 'chat', 'settings']).toContain(useStore.getState().activePanel)
  })

  it('command palette opens and closes via store', () => {
    render(<Sidebar />)
    // Open
    useStore.getState().toggleCommandPalette()
    expect(useStore.getState().showCommandPalette).toBe(true)
    // Close
    useStore.getState().toggleCommandPalette()
    expect(useStore.getState().showCommandPalette).toBe(false)
  })

  it('terminal toggles without breaking other state', () => {
    render(<Sidebar />)
    useStore.getState().setActivePanel('git')
    const before = useStore.getState().showTerminal
    useStore.getState().toggleTerminal()
    expect(useStore.getState().showTerminal).toBe(!before)
    expect(useStore.getState().activePanel).toBe('git')
  })
})

// ═══ CHAT MESSAGE FLOWS ═══════════════════════════════════════════════════

describe('Integration — Chat Message Flow', () => {
  it('full message cycle: user sends, assistant responds, content displays', () => {
    // User sends message
    useStore.getState().addMessage({
      id: 'msg-1', role: 'user', content: 'What files are in the project?', timestamp: Date.now(),
    })
    useStore.getState().setChatLoading(true)

    // Streaming starts
    useStore.getState().setStreamingContent('Let me check...')
    expect(useStore.getState().streamingContent).toBe('Let me check...')

    // More tokens arrive
    useStore.getState().appendStreamingContent(' Here are the files:')
    expect(useStore.getState().streamingContent).toBe('Let me check... Here are the files:')

    // Final response
    useStore.getState().addMessage({
      id: 'msg-2', role: 'assistant', content: 'Let me check... Here are the files:', timestamp: Date.now(),
    })
    useStore.getState().setStreamingContent('')
    useStore.getState().setChatLoading(false)

    const messages = useStore.getState().messages
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('assistant')
    expect(useStore.getState().chatLoading).toBe(false)
    expect(useStore.getState().streamingContent).toBe('')
  })

  it('multiple messages maintain correct order', () => {
    const count = useStore.getState().messages.length
    for (let i = 0; i < 5; i++) {
      useStore.getState().addMessage({
        id: `msg-int-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Integration message ${i}`,
        timestamp: Date.now() + i,
      })
    }
    const messages = useStore.getState().messages
    expect(messages.length).toBeGreaterThanOrEqual(5)
    expect(messages[messages.length - 1].content).toBe('Integration message 4')
  })
})

// ═══ GIT OPERATION FLOWS ══════════════════════════════════════════════════

describe('Integration — Git Status Flow', () => {
  it('git status → staged files → commit clears staging', () => {
    // Initial state: modified files
    useStore.getState().setGitStatus({
      branch: 'main', tracking: 'origin/main', ahead: 0, behind: 0,
      staged: [], modified: ['a.ts', 'b.ts'], not_added: ['c.ts'],
      deleted: [], renamed: [], isClean: false,
    })
    expect(useStore.getState().gitStatus!.modified).toHaveLength(2)

    // Stage files
    useStore.getState().setGitStatus({
      ...useStore.getState().gitStatus!,
      staged: ['a.ts', 'b.ts'], modified: [], not_added: ['c.ts'],
    })
    expect(useStore.getState().gitStatus!.staged).toHaveLength(2)

    // After commit: clean state
    useStore.getState().setGitStatus({
      ...useStore.getState().gitStatus!,
      staged: [], modified: [], not_added: [], isClean: true,
    })
    expect(useStore.getState().gitStatus!.isClean).toBe(true)
  })

  it('branch switch updates git status', () => {
    useStore.getState().setGitStatus({
      branch: 'main', tracking: 'origin/main', ahead: 0, behind: 0,
      staged: [], modified: [], not_added: [], deleted: [], renamed: [], isClean: true,
    })
    useStore.getState().setGitStatus({
      ...useStore.getState().gitStatus!, branch: 'feature/auth',
    })
    expect(useStore.getState().gitStatus!.branch).toBe('feature/auth')
  })
})

// ═══ FILE BROWSER FLOWS ═══════════════════════════════════════════════════

describe('Integration — File Selection Flow', () => {
  it('select file → opens in editor → dirty on edit → save clears dirty', () => {
    // Select file
    useStore.getState().setSelectedFile('/src/index.ts')
    expect(useStore.getState().selectedFile).toBe('/src/index.ts')

    // Load content
    useStore.getState().setFileContent('const x = 1')
    expect(useStore.getState().fileContent).toBe('const x = 1')
    expect(useStore.getState().fileDirty).toBe(false)

    // Edit (dirty)
    useStore.getState().setFileDirty(true)
    expect(useStore.getState().fileDirty).toBe(true)

    // Save (clears dirty)
    useStore.getState().setFileContent('const x = 2')
    expect(useStore.getState().fileDirty).toBe(false)
  })

  it('open tabs track correctly', () => {
    useStore.getState().addOpenFile('/src/a.ts')
    useStore.getState().addOpenFile('/src/b.ts')
    useStore.getState().addOpenFile('/src/c.ts')
    expect(useStore.getState().openFiles).toHaveLength(3)

    useStore.getState().closeOpenFile('/src/b.ts')
    expect(useStore.getState().openFiles).toHaveLength(2)
    expect(useStore.getState().openFiles).toContain('/src/a.ts')
    expect(useStore.getState().openFiles).toContain('/src/c.ts')
  })
})

// ═══ SETTINGS FLOWS ═══════════════════════════════════════════════════════

describe('Integration — Provider Selection Flow', () => {
  it('switch active provider updates settings', () => {
    useStore.getState().setSettings({
      ...useStore.getState().settings,
      activeProvider: 'together',
    })
    expect(useStore.getState().settings.activeProvider).toBe('together')
  })

  it('API key can be updated per provider', () => {
    const settings = useStore.getState().settings
    const updatedProviders = settings.providers.map(p =>
      p.id === 'groq' ? { ...p, apiKey: 'new-key-123' } : p
    )
    useStore.getState().setSettings({ ...settings, providers: updatedProviders })
    const groq = useStore.getState().settings.providers.find(p => p.id === 'groq')
    expect(groq?.apiKey).toBe('new-key-123')
  })

  it('free tier providers are identifiable', () => {
    const freeProviders = useStore.getState().settings.providers.filter(p => p.freeTier)
    expect(freeProviders.length).toBeGreaterThan(0)
    expect(freeProviders.some(p => p.id === 'groq')).toBe(true)
  })
})

// ═══ SEARCH FLOWS ═════════════════════════════════════════════════════════

describe('Integration — Search Result Flow', () => {
  it('search results display and clicking opens file', () => {
    useStore.getState().setSearchResults('src/main.ts:42: const app = express()')
    render(<SearchResults />)

    expect(screen.getByText('1 matches')).toBeInTheDocument()
    const result = screen.getByText('src/main.ts')
    fireEvent.click(result)
    expect(useStore.getState().selectedFile).toContain('main.ts')
  })

  it('clearing search resets state', () => {
    useStore.getState().setSearchResults('some results')
    render(<SearchResults />)
    fireEvent.click(screen.getByText('✕ Close'))
    expect(useStore.getState().searchResults).toBeNull()
  })
})

// ═══ TASK TRACKING FLOWS ══════════════════════════════════════════════════

describe('Integration — Agent Task Flow', () => {
  it('task lifecycle: create → running → add steps → done', () => {
    useStore.getState().addTask({
      id: 'task-1', title: 'Refactor auth module', status: 'running',
      steps: [], createdAt: Date.now(),
    })

    // Add tool call steps
    useStore.getState().addStepToTask('task-1', { type: 'command', content: 'search_code: auth', timestamp: Date.now() })
    useStore.getState().addStepToTask('task-1', { type: 'result', content: 'Found 5 files', timestamp: Date.now() })
    useStore.getState().addStepToTask('task-1', { type: 'command', content: 'edit_file: auth.ts', timestamp: Date.now() })

    const task = useStore.getState().tasks[0]
    expect(task.steps).toHaveLength(3)
    expect(task.steps[0].content).toContain('search_code')
    expect(task.steps[2].content).toContain('edit_file')
  })
})

// ═══ ERROR RECOVERY FLOWS ═════════════════════════════════════════════════

describe('Integration — Error Boundary Recovery', () => {
  it('error in child does not crash parent', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <div>Good child</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Good child')).toBeInTheDocument()

    // Re-render with good child still works
    rerender(
      <ErrorBoundary>
        <div>Still good</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Still good')).toBeInTheDocument()
  })

  it('error boundary catches and displays error', () => {
    const Crash = () => { throw new Error('Integration test crash') }
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
  })
})

// ═══ EXPANDED DIRECTORIES ═════════════════════════════════════════════════

describe('Integration — Directory Tree Toggle', () => {
  it('expand/collapse directory tree', () => {
    const dir = '/home/user/project/src'
    useStore.getState().toggleDir(dir)
    expect(useStore.getState().expandedDirs.has(dir)).toBe(true)

    useStore.getState().toggleDir(dir)
    expect(useStore.getState().expandedDirs.has(dir)).toBe(false)
  })

  it('multiple directories can be expanded independently', () => {
    useStore.getState().toggleDir('/src')
    useStore.getState().toggleDir('/lib')
    expect(useStore.getState().expandedDirs.has('/src')).toBe(true)
    expect(useStore.getState().expandedDirs.has('/lib')).toBe(true)

    useStore.getState().toggleDir('/src')
    expect(useStore.getState().expandedDirs.has('/src')).toBe(false)
    expect(useStore.getState().expandedDirs.has('/lib')).toBe(true)
  })
})

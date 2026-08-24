/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Tests for Zustand state store
 * Covers: initial state, setters, file management, git state, chat, tasks
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'

// Reset store between tests
beforeEach(() => {
  const state = useStore.getState()
  state.setWorkspacePath('')
  state.setActivePanel('chat')
  state.setFiles([])
  state.setSelectedFile(null)
  state.setGitStatus(null)
  state.setGitLog([])
  state.setGitDiff('')
  state.setChatLoading(false)
  state.setSettings({ providers: [], activeProvider: 'groq', workspacePath: '' })
})

describe('Store — Initial State', () => {
  it('has correct default values', () => {
    const state = useStore.getState()
    expect(state.workspacePath).toBe('')
    expect(state.activePanel).toBe('chat')
    expect(typeof state.showTerminal).toBe('boolean')
    expect(state.files).toEqual([])
    expect(state.selectedFile).toBeNull()
    expect(state.openFiles).toEqual([])
    expect(state.messages).toEqual([])
    expect(state.chatLoading).toBe(false)
    expect(state.tasks).toEqual([])
    expect(typeof state.planMode).toBe('boolean')
  })
})

describe('Store — Workspace', () => {
  it('sets workspace path', () => {
    useStore.getState().setWorkspacePath('/home/user/project')
    expect(useStore.getState().workspacePath).toBe('/home/user/project')
  })

  it('sets current directory', () => {
    useStore.getState().setCurrentDirectory('/home/user/project/src')
    expect(useStore.getState().currentDirectory).toBe('/home/user/project/src')
  })
})

describe('Store — Navigation', () => {
  it('sets active panel', () => {
    useStore.getState().setActivePanel('git')
    expect(useStore.getState().activePanel).toBe('git')
  })

  it('toggles command palette', () => {
    expect(useStore.getState().showCommandPalette).toBe(false)
    useStore.getState().toggleCommandPalette()
    expect(useStore.getState().showCommandPalette).toBe(true)
    useStore.getState().toggleCommandPalette()
    expect(useStore.getState().showCommandPalette).toBe(false)
  })

  it('toggles terminal', () => {
    const initial = useStore.getState().showTerminal
    useStore.getState().toggleTerminal()
    expect(useStore.getState().showTerminal).toBe(!initial)
  })
})

describe('Store — File Management', () => {
  it('sets files', () => {
    const files = [
      { name: 'index.ts', isDirectory: false, path: '/src/index.ts' },
      { name: 'utils', isDirectory: true, path: '/src/utils' },
    ]
    useStore.getState().setFiles(files)
    expect(useStore.getState().files).toHaveLength(2)
    expect(useStore.getState().files[0].name).toBe('index.ts')
  })

  it('adds and removes open files', () => {
    useStore.getState().addOpenFile('/src/main.ts')
    useStore.getState().addOpenFile('/src/App.tsx')
    expect(useStore.getState().openFiles).toEqual(['/src/main.ts', '/src/App.tsx'])

    // Adding same file should not duplicate
    useStore.getState().addOpenFile('/src/main.ts')
    expect(useStore.getState().openFiles).toHaveLength(2)

    useStore.getState().closeOpenFile('/src/main.ts')
    expect(useStore.getState().openFiles).toEqual(['/src/App.tsx'])
  })

  it('sets selected file and updates content', () => {
    useStore.getState().setSelectedFile('/src/index.ts')
    expect(useStore.getState().selectedFile).toBe('/src/index.ts')

    useStore.getState().setFileContent('const x = 1')
    expect(useStore.getState().fileContent).toBe('const x = 1')
    // setFileContent resets dirty to false
    expect(useStore.getState().fileDirty).toBe(false)

    // setFileDirty marks dirty
    useStore.getState().setFileDirty(true)
    expect(useStore.getState().fileDirty).toBe(true)
  })
})

describe('Store — Git', () => {
  it('sets git status', () => {
    const status = {
      branch: 'main',
      tracking: 'origin/main',
      ahead: 0,
      behind: 0,
      staged: ['file1.ts'],
      modified: ['file2.ts'],
      not_added: ['file3.ts'],
      deleted: [],
      renamed: [],
      isClean: false,
    }
    useStore.getState().setGitStatus(status)
    expect(useStore.getState().gitStatus?.branch).toBe('main')
    expect(useStore.getState().gitStatus?.staged).toEqual(['file1.ts'])
  })

  it('sets git log', () => {
    const log = [
      { hash: 'abc1234', date: '2025-01-01', message: 'Initial commit', author: 'dev' },
    ]
    useStore.getState().setGitLog(log)
    expect(useStore.getState().gitLog).toHaveLength(1)
  })
})

describe('Store — Chat', () => {
  it('adds messages', () => {
    useStore.getState().addMessage({ id: '1', role: 'user', content: 'Hello', timestamp: Date.now() })
    useStore.getState().addMessage({ id: '2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() })
    expect(useStore.getState().messages).toHaveLength(2)
    expect(useStore.getState().messages[0].role).toBe('user')
    expect(useStore.getState().messages[1].content).toBe('Hi there!')
  })

  it('manages streaming content', () => {
    useStore.getState().setStreamingContent('Hello ')
    expect(useStore.getState().streamingContent).toBe('Hello ')
    useStore.getState().appendStreamingContent('world!')
    expect(useStore.getState().streamingContent).toBe('Hello world!')
  })

  it('manages chat loading state', () => {
    useStore.getState().setChatLoading(true)
    expect(useStore.getState().chatLoading).toBe(true)
  })
})

describe('Store — Tasks', () => {
  it('adds tasks', () => {
    useStore.getState().addTask({
      id: 'task-1',
      title: 'Fix the bug',
      status: 'running',
      steps: [],
      createdAt: Date.now(),
    })
    expect(useStore.getState().tasks).toHaveLength(1)
    expect(useStore.getState().tasks[0].title).toBe('Fix the bug')
  })

  it('adds steps to tasks', () => {
    useStore.getState().addTask({
      id: 'task-1',
      title: 'Fix the bug',
      status: 'running',
      steps: [],
      createdAt: Date.now(),
    })
    useStore.getState().addStepToTask('task-1', {
      type: 'command',
      content: 'git status',
      timestamp: Date.now(),
    })
    expect(useStore.getState().tasks[0].steps).toHaveLength(1)
  })
})

describe('Store — Settings', () => {
  it('sets settings with providers', () => {
    const settings = {
      providers: [
        { id: 'groq', name: 'Groq', apiKey: 'test-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b', freeTier: true },
      ],
      activeProvider: 'groq',
      workspacePath: '/home/user/project',
    }
    useStore.getState().setSettings(settings)
    expect(useStore.getState().settings.providers).toHaveLength(1)
    expect(useStore.getState().settings.activeProvider).toBe('groq')
  })

  it('sets search results', () => {
    useStore.getState().setSearchResults('file.ts:1: match\nfile.ts:5: match')
    expect(useStore.getState().searchResults).toContain('file.ts:1: match')
  })
})

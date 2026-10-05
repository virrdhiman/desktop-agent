/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * VD Agent — Root Application Component
 *
 * The main layout orchestrator. Manages:
 * - Settings initialization on startup
 * - Git status detection
 * - File indexing for search
 * - Global keyboard shortcuts (Ctrl+P, Ctrl+G, Ctrl+B, Ctrl+Shift+A, Ctrl+`)
 * - Panel routing (chat, files, git, branches, tasks, sessions, terminal, settings)
 * - Editor split view (chat + editor side by side)
 * - Bottom terminal panel
 */
import { useEffect } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import AgentChat from './components/AgentChat'
import FileBrowser from './components/FileBrowser'
import GitPanel from './components/GitPanel'
import CodeEditor from './components/CodeEditor'
import MultiTerminal from './components/MultiTerminal'
import SettingsPanel from './components/SettingsPanel'
import TaskPanel from './components/TaskPanel'
import BranchManager from './components/BranchManager'
import SessionsPanel from './components/SessionsPanel'
import SearchResults from './components/SearchResults'
import CommandPalette from './components/CommandPalette'
import VsCodeBridgePanel from './components/VsCodeBridgePanel'

export default function App() {
  const {
    setSettings, workspacePath, setWorkspacePath, setProjectMemory,
    selectedFile, showTerminal, activePanel,
    setIsRepo, setGitStatus, setAllFiles, setActivePanel, toggleCommandPalette,
    showCommandPalette, setShowCommandPalette,
  } = useStore()

  useEffect(() => {
    const initialize = async () => {
      try {
        const settings = await window.api.loadSettings()
        setSettings(settings)

        try {
          const records = await window.api.listConversations()
          if (Array.isArray(records)) useStore.getState().hydrateSessions(records, { restoreLatest: true })
          else console.warn(`Failed to load chat history: ${records.error}`)
        } catch (err: any) {
          console.warn(`Failed to load chat history: ${err?.message || err}`)
        }

        const restoredState = useStore.getState()
        const activeWorkspace = restoredState.workspacePath || settings.workspacePath
        if (!activeWorkspace) return
        if (!restoredState.workspacePath) setWorkspacePath(activeWorkspace)
        window.api.projectMemoryLoad(activeWorkspace)
          .then((memory) => { if (!('error' in memory)) setProjectMemory(memory.content) })
          .catch(() => {})
        window.api.gitIsRepo(activeWorkspace).then((isRepo) => {
          setIsRepo(isRepo)
          if (isRepo) {
            window.api.gitStatus(activeWorkspace).then((status) => {
              if (!('error' in status)) setGitStatus(status as any)
            })
          }
        })
        window.api.walkDirectory(activeWorkspace).then((files) => {
          setAllFiles(files)
        })
        void window.api.toolExecute({ name: 'repo_index', args: {}, workspace: activeWorkspace }).catch(() => {})
      } catch (err: any) {
        console.warn(`Failed to initialize VD Agent: ${err?.message || err}`)
      }
    }
    void initialize()

    const flush = () => { void useStore.getState().flushSessionSave() }
    const checkpointCleanup = window.api.onCheckpointCreated((checkpoint) => {
      useStore.getState().setLatestCheckpoint(checkpoint)
    })
    const autosaveInterval = window.setInterval(flush, 5_000)
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(autosaveInterval)
      checkpointCleanup()
    }
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p' && !e.shiftKey) {
        e.preventDefault()
        toggleCommandPalette()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        toggleCommandPalette()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault()
        useStore.getState().toggleTerminal()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault()
        setActivePanel('git')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setActivePanel('files')
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        setActivePanel('chat')
      }
      // Escape to close command palette
      if (e.key === 'Escape' && showCommandPalette) {
        setShowCommandPalette(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCommandPalette])

  const showEditor = selectedFile || (workspacePath && activePanel === 'chat')

  return (
    <div className="app-layout" style={{ height: '100vh' }}>
      {/* Command Palette overlay */}
      <CommandPalette />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Top area: context-dependent panel + editor */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left panel */}
          <div style={{
            width: activePanel === 'chat' ? '40%' : '100%',
            display: activePanel === 'settings' ? 'block' : 'flex',
            flexDirection: 'column',
            borderRight: activePanel === 'chat' && showEditor ? '1px solid var(--border)' : 'none',
            overflow: 'hidden',
          }}>
            {activePanel === 'chat' && <AgentChat />}
            {activePanel === 'files' && <FileBrowser />}
            {activePanel === 'git' && <GitPanel />}
            {activePanel === 'branches' && <BranchManager />}
            {activePanel === 'tasks' && <TaskPanel />}
            {activePanel === 'sessions' && <SessionsPanel />}
            {activePanel === 'vscode' && <VsCodeBridgePanel />}
            {activePanel === 'search' && <SearchResults />}
            {activePanel === 'terminal' && <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><MultiTerminal /></div>}
            {activePanel === 'settings' && <SettingsPanel />}
          </div>

          {/* Right panel: Editor (visible in chat mode) */}
          {activePanel === 'chat' && showEditor && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <CodeEditor />
            </div>
          )}
        </div>

        {/* Bottom terminal */}
        {showTerminal && activePanel !== 'settings' && activePanel !== 'terminal' && (
          <div style={{
            borderTop: '1px solid var(--border)',
            height: 240,
            minHeight: 100,
            flexShrink: 0,
          }}>
            <MultiTerminal />
          </div>
        )}
      </div>
    </div>
  )
}

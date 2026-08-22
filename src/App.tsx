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
import CommandPalette from './components/CommandPalette'

export default function App() {
  const {
    setSettings, workspacePath, setWorkspacePath,
    selectedFile, showTerminal, activePanel,
    setIsRepo, setGitStatus, setAllFiles, setActivePanel, toggleCommandPalette,
    showCommandPalette, setShowCommandPalette,
  } = useStore()

  useEffect(() => {
    window.api.loadSettings().then((s) => {
      setSettings(s)
      if (s.workspacePath) {
        setWorkspacePath(s.workspacePath)
        // Check git status
        window.api.gitIsRepo(s.workspacePath).then((isRepo) => {
          setIsRepo(isRepo)
          if (isRepo) {
            window.api.gitStatus(s.workspacePath).then((status) => {
              if (!('error' in status)) setGitStatus(status as any)
            })
          }
        })
        // Index files for search
        window.api.walkDirectory(s.workspacePath).then((files) => {
          setAllFiles(files)
        })
      }
    })
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

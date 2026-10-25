/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useStore } from './store'
import LeftRail from './components/LeftRail'
import WorkspaceSidebar from './components/WorkspaceSidebar'
import HistoryPane from './components/HistoryPane'
import LauncherRail from './components/LauncherRail'
import AgentChat from './components/AgentChat'
import FileBrowser from './components/FileBrowser'
import GitPanel from './components/GitPanel'
import CodeEditor from './components/CodeEditor'
import MultiTerminal from './components/MultiTerminal'
import SettingsPanel from './components/SettingsPanel'
import TaskPanel from './components/TaskPanel'
import BranchManager from './components/BranchManager'
import SessionsPanel from './components/SessionsPanel'
import VsCodeBridgePanel from './components/VsCodeBridgePanel'
import SearchResults from './components/SearchResults'
import CommandPalette from './components/CommandPalette'
import PrerequisiteSetup from './components/PrerequisiteSetup'
import HelpPanel from './components/HelpPanel'
import SurfaceSwitch from './components/SurfaceSwitch'
import AppMenuBar from './components/AppMenuBar'
import CodeWorkspace from './components/CodeWorkspace'
import { mergeLayoutPreferences, normalizeLayoutPreferences, type LayoutPreferences } from './lib/layoutPersistence'
import type { Panel } from './types'

export default function App() {
  const {
    setSettings, settings, workspacePath, setWorkspacePath, setProjectMemory,
    selectedFile, showTerminal, activePanel,
    setIsRepo, setGitStatus, setAllFiles, setRepoIndexStatus, setActivePanel, toggleCommandPalette,
    showCommandPalette, setShowCommandPalette,
  } = useStore()
  const resizeCleanup = useRef<(() => void) | null>(null)
  const layout = normalizeLayoutPreferences(settings.layout)
  const sidebarCollapsed = layout.sidebarCollapsed
  const historyCollapsed = layout.historyCollapsed
  const launcherCollapsed = layout.launcherCollapsed
  const codeMode = layout.surface === 'code'

  const persistTerminalToggle = () => {
    const current = useStore.getState()
    current.toggleTerminal()
    const nextLayout = mergeLayoutPreferences(current.settings.layout, { terminalCollapsed: !normalizeLayoutPreferences(current.settings.layout).terminalCollapsed })
    const nextSettings = { ...current.settings, layout: nextLayout }
    setSettings(nextSettings)
    void window.api.saveSettings(nextSettings)
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        const loadedSettings = await window.api.loadSettings()
        const normalizedSettings = { ...loadedSettings, layout: normalizeLayoutPreferences(loadedSettings.layout) }
        setSettings(normalizedSettings)
        try {
          const records = await window.api.listConversations()
          if (Array.isArray(records)) useStore.getState().hydrateSessions(records, { restoreLatest: true })
          else console.warn(`Failed to load chat history: ${records.error}`)
        } catch (err: any) {
          console.warn(`Failed to load chat history: ${err?.message || err}`)
        }

        const restoredState = useStore.getState()
        const activeWorkspace = restoredState.workspacePath || loadedSettings.workspacePath
        if (!activeWorkspace) return
        if (!restoredState.workspacePath) setWorkspacePath(activeWorkspace)
        window.api.projectMemoryLoad(activeWorkspace).then((memory) => { if (!('error' in memory)) setProjectMemory(memory.content) }).catch(() => {})
        window.api.gitIsRepo(activeWorkspace).then((isRepo) => {
          setIsRepo(isRepo)
          if (isRepo) window.api.gitStatus(activeWorkspace).then((status) => { if (!('error' in status)) setGitStatus(status as any) })
        })
        window.api.walkDirectory(activeWorkspace).then((files) => setAllFiles(files))
        if (loadedSettings.indexingEnabled === true) void window.api.toolExecute({ name: 'repo_index', args: {}, workspace: activeWorkspace }).catch(() => {})
      } catch (err: any) {
        console.warn(`Failed to initialize VD Agent: ${err?.message || err}`)
      }
    }
    void initialize()
    const flush = () => { void useStore.getState().flushSessionSave() }
    const checkpointCleanup = window.api.onCheckpointCreated((checkpoint) => useStore.getState().setLatestCheckpoint(checkpoint))
    const indexStatusCleanup = window.api.onRepoIndexStatus((status) => setRepoIndexStatus(status))
    const autosaveInterval = window.setInterval(flush, 5_000)
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(autosaveInterval)
      checkpointCleanup()
      indexStatusCleanup()
    }
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'p' && !event.shiftKey) { event.preventDefault(); toggleCommandPalette() }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'P') { event.preventDefault(); toggleCommandPalette() }
      if ((event.metaKey || event.ctrlKey) && event.key === '`') { event.preventDefault(); persistTerminalToggle() }
      if ((event.metaKey || event.ctrlKey) && event.key === 'g') { event.preventDefault(); setActivePanel('git') }
      if ((event.metaKey || event.ctrlKey) && event.key === 'b') { event.preventDefault(); setActivePanel('files') }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'A') { event.preventDefault(); setActivePanel('chat') }
      if ((event.metaKey || event.ctrlKey) && event.key === 'n') { event.preventDefault(); void useStore.getState().newChat() }
      if ((event.metaKey || event.ctrlKey) && event.key === ',') { event.preventDefault(); setActivePanel('settings') }
      if (event.key === 'Escape' && showCommandPalette) setShowCommandPalette(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCommandPalette])

  useEffect(() => () => { resizeCleanup.current?.() }, [])

  const updateLayout = useCallback((patch: Partial<LayoutPreferences>, persist = false) => {
    const next = mergeLayoutPreferences(useStore.getState().settings.layout, patch)
    const nextSettings = { ...useStore.getState().settings, layout: next }
    setSettings(nextSettings)
    if (persist) void window.api.saveSettings(nextSettings)
  }, [setSettings])

  const beginResize = useCallback((kind: 'sidebarWidth' | 'historyWidth' | 'terminalHeight', event: React.PointerEvent) => {
    event.preventDefault()
    resizeCleanup.current?.()
    const startX = event.clientX
    const startY = event.clientY
    const start = normalizeLayoutPreferences(useStore.getState().settings.layout)
    const onMove = (moveEvent: PointerEvent) => {
      if (kind === 'sidebarWidth') updateLayout({ sidebarWidth: start.sidebarWidth + moveEvent.clientX - startX })
      if (kind === 'historyWidth') updateLayout({ historyWidth: start.historyWidth - (moveEvent.clientX - startX) })
      if (kind === 'terminalHeight') updateLayout({ terminalHeight: start.terminalHeight - (moveEvent.clientY - startY) })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      resizeCleanup.current = null
      void window.api.saveSettings(useStore.getState().settings)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    resizeCleanup.current = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [updateLayout])

  const renderPanel = () => {
    if (activePanel === 'files') return <FileBrowser />
    if (activePanel === 'git') return <GitPanel />
    if (activePanel === 'branches') return <BranchManager />
    if (activePanel === 'tasks') return <TaskPanel />
    if (activePanel === 'sessions') return <SessionsPanel />
    if (activePanel === 'vscode') return <VsCodeBridgePanel />
    if (activePanel === 'terminal') return <MultiTerminal />
    if (activePanel === 'settings') return <SettingsPanel />
    if (activePanel === 'search') return <SearchResults />
    if (activePanel === 'help') return <HelpPanel />
    return <AgentChat />
  }

  const showEditor = Boolean(selectedFile)
  const openFolder = async () => {
    const directory = await window.api.openDirectory()
    if (!directory) return
    setWorkspacePath(directory)
    const files = await window.api.walkDirectory(directory)
    if (Array.isArray(files)) setAllFiles(files)
    setActivePanel('chat')
  }

  return (
    <div className="app-layout vd-app-shell">
      <CommandPalette />
      <PrerequisiteSetup />
      {!codeMode && <LeftRail activePanel={activePanel} collapsed={layout.leftRailCollapsed} onToggle={() => updateLayout({ sidebarCollapsed: !sidebarCollapsed }, true)} onHome={() => setActivePanel('chat')} onSettings={() => setActivePanel('settings')} />}
      {!codeMode && <div className="vd-sidebar-slot" style={{ width: sidebarCollapsed ? 36 : layout.sidebarWidth }}>
        <WorkspaceSidebar collapsed={sidebarCollapsed} onToggle={() => updateLayout({ sidebarCollapsed: !sidebarCollapsed }, true)} onSettings={() => setActivePanel('settings')} onHelp={() => setActivePanel('help')} onShortcuts={() => toggleCommandPalette()} />
      </div>}
      {!codeMode && <div className="vd-resize-handle vd-resize-sidebar" role="separator" aria-label="Resize workspace sidebar" onPointerDown={(event) => beginResize('sidebarWidth', event)} />}
      <main className="main-content vd-main-shell">
        <header className="top-bar vd-topbar">
          {!codeMode && <AppMenuBar
            onNewChat={() => { void useStore.getState().newChat(); setActivePanel('chat') }}
            onOpenFolder={() => { void openFolder() }}
            onCommandPalette={toggleCommandPalette}
            onToggleSidebar={() => updateLayout({ sidebarCollapsed: !sidebarCollapsed }, true)}
            onToggleTerminal={persistTerminalToggle}
            onSettings={() => setActivePanel('settings')}
            onHelp={() => setActivePanel('help')}
          />}
          {!codeMode && <div className="vd-top-tabs" role="tablist" aria-label="Open work surfaces">
            <button className={activePanel === 'chat' ? 'active' : ''} role="tab" aria-selected={activePanel === 'chat'} onClick={() => setActivePanel('chat')}>Agent output</button>
            {selectedFile && <button className={activePanel !== 'chat' ? 'active' : ''} role="tab" aria-selected={activePanel !== 'chat'} onClick={() => setActivePanel('files')} title={selectedFile}>{selectedFile.split(/[\\/]/).pop()}</button>}
          </div>}
          <SurfaceSwitch />
        </header>

        {codeMode ? <CodeWorkspace layout={layout} onLayout={updateLayout} onOpenFolder={openFolder} onSettings={() => setActivePanel('settings')} onHelp={() => setActivePanel('help')} onCommandPalette={toggleCommandPalette} /> : <div className="vd-workspace-grid">
          <section className="vd-primary-pane" aria-label="Primary workspace">
            <div className="vd-primary-content">
              {activePanel === 'chat' ? (
                <div className="vd-chat-editor-split">
                  <div className={`vd-chat-column ${showEditor ? 'with-editor' : ''}`}>{renderPanel()}</div>
                  {showEditor && <div className="vd-editor-column"><CodeEditor /></div>}
                </div>
              ) : renderPanel()}
            </div>
          </section>
          <div className="vd-resize-handle vd-resize-history" role="separator" aria-label="Resize session history" onPointerDown={(event) => beginResize('historyWidth', event)} />
          <HistoryPane collapsed={historyCollapsed} style={{ width: historyCollapsed ? 36 : layout.historyWidth }} onToggle={() => updateLayout({ historyCollapsed: !historyCollapsed }, true)} />
          {!launcherCollapsed && <LauncherRail activePanel={activePanel} onSelect={setActivePanel} />}
          {!launcherCollapsed && <button className="vd-launcher-collapse" aria-label="Collapse launcher" title="Collapse launcher" onClick={() => updateLayout({ launcherCollapsed: true }, true)}>›</button>}
          {launcherCollapsed && <button className="vd-launcher-expand" aria-label="Expand launcher" title="Expand launcher" onClick={() => updateLayout({ launcherCollapsed: false }, true)}>‹</button>}
        </div>}

        {!codeMode && showTerminal && !layout.terminalCollapsed && activePanel !== 'settings' && activePanel !== 'terminal' && activePanel !== 'chat' && (
          <div className="vd-app-terminal" style={{ height: layout.terminalHeight }}>
            <div className="vd-resize-handle vd-resize-terminal" role="separator" aria-label="Resize terminal" onPointerDown={(event) => beginResize('terminalHeight', event)} />
            <MultiTerminal />
          </div>
        )}
      </main>
    </div>
  )
}

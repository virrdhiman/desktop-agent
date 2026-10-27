import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Panel } from '../types'
import AvatarMenu from './AvatarMenu'
import { APP_VERSION } from '../lib/brand'

type WorkspaceSidebarProps = {
  collapsed: boolean
  onToggle: () => void
  onSettings: () => void
  onHelp: () => void
  onShortcuts: () => void
}

const toolItems: Array<{ id: Panel; label: string; icon: string }> = [
  { id: 'git', label: 'Git changes', icon: '⑂' },
  { id: 'branches', label: 'Branches', icon: '⑇' },
  { id: 'tasks', label: 'Tasks', icon: '☑' },
  { id: 'vscode', label: 'VS Code bridge', icon: '⌘' },
  { id: 'terminal', label: 'Terminal', icon: '›_' },
  { id: 'help', label: 'Help', icon: '?' },
]

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

export default function WorkspaceSidebar({ collapsed, onToggle, onSettings, onHelp, onShortcuts }: WorkspaceSidebarProps) {
  const {
    activePanel, setActivePanel, workspacePath, files, selectedFile, setSelectedFile, addOpenFile,
    sessions, newChat, loadSession,
  } = useStore()
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [filesOpen, setFilesOpen] = useState(true)

  const projectGroups = useMemo(() => {
    const groups = new Map<string, typeof sessions>()
    sessions.slice(0, 30).forEach((session) => {
      const key = session.resume?.workspacePath ? basename(session.resume.workspacePath) : 'Personal'
      groups.set(key, [...(groups.get(key) || []), session])
    })
    return [...groups.entries()]
  }, [sessions])

  if (collapsed) {
    return (
      <aside className="vd-workspace-sidebar vd-workspace-sidebar-collapsed" aria-label="Collapsed workspace sidebar">
        <button className="vd-sidebar-expand" aria-label="Expand workspace sidebar" title="Expand sidebar" onClick={onToggle}>›</button>
      </aside>
    )
  }

  return (
    <aside className="vd-workspace-sidebar" aria-label="Workspace navigation">
      <div className="vd-sidebar-header">
        <div>
          <div className="vd-sidebar-title">Workspace</div>
          <div className="vd-sidebar-subtitle" title={workspacePath || 'No workspace open'}>{workspacePath ? basename(workspacePath) : 'No workspace open'}</div>
        </div>
        <button className="vd-icon-button" aria-label="Collapse workspace sidebar" title="Collapse sidebar" onClick={onToggle}>‹</button>
      </div>

      <button className="vd-new-chat" onClick={() => { void newChat(); setActivePanel('chat') }}>
        <span>＋</span><span>New chat</span><kbd>Ctrl+N</kbd>
      </button>

      <div className="vd-sidebar-section">
        <button className="vd-section-toggle" onClick={() => setProjectsOpen((value) => !value)} aria-expanded={projectsOpen}>
          <span>{projectsOpen ? '⌄' : '›'} Projects</span><span className="vd-count">{projectGroups.length}</span>
        </button>
        {projectsOpen && (projectGroups.length === 0 ? (
          <div className="vd-sidebar-empty">Projects appear after the first saved chat.</div>
        ) : projectGroups.map(([project, projectSessions]) => (
          <div key={project} className="vd-project-group">
            <div className="vd-project-name"><span>▸</span><span>{project}</span><span className="vd-count">{projectSessions.length}</span></div>
            {projectSessions.slice(0, 4).map((session) => (
              <button key={session.id} className={`vd-session-row ${useStore.getState().currentSessionId === session.id ? 'active' : ''}`} onClick={() => { void loadSession(session.id); setActivePanel('chat') }} title={session.title}>
                <span>·</span><span>{session.title}</span>
              </button>
            ))}
          </div>
        )))}
      </div>

      <div className="vd-sidebar-section">
        <button className="vd-section-toggle" onClick={() => setActivePanel('sessions')}>
          <span>▾ All chats</span><span className="vd-count">{sessions.length}</span>
        </button>
      </div>

      <div className="vd-sidebar-section vd-file-tree-section">
        <div className="vd-section-toggle" role="button" tabIndex={0} onClick={() => setFilesOpen((value) => !value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setFilesOpen((value) => !value) }} aria-expanded={filesOpen}>
          <span>{filesOpen ? '⌄' : '›'} Files</span><button className="vd-mini-action" aria-label="Open files panel" onClick={(event) => { event.stopPropagation(); setActivePanel('files') }}>Open</button>
        </div>
        {filesOpen && (
          <div className="vd-file-tree" role="tree" aria-label="Workspace files">
            {files.length === 0 ? <div className="vd-sidebar-empty">Open a workspace to browse files.</div> : files.slice(0, 80).map((file) => (
              <button
                key={file.path}
                role="treeitem"
                className={`vd-file-row ${selectedFile === file.path ? 'active' : ''}`}
                title={file.path}
                onClick={() => {
                  if (file.isDirectory) { setActivePanel('files'); return }
                  setSelectedFile(file.path); addOpenFile(file.path)
                }}
              >
                <span aria-hidden="true">{file.isDirectory ? '▸' : '·'}</span><span>{file.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="vd-sidebar-section vd-tools-section">
        <div className="vd-section-label">Tools</div>
        {toolItems.map((item) => (
          <button key={item.id} className={`vd-tool-row ${activePanel === item.id ? 'active' : ''}`} onClick={() => setActivePanel(item.id)}>
            <span aria-hidden="true">{item.icon}</span><span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="vd-sidebar-footer">
        <AvatarMenu onSettings={onSettings} onHelp={onHelp} onShortcuts={onShortcuts} />
        <span className="vd-sidebar-footer-label">VD Agent · v{APP_VERSION}</span>
      </div>
    </aside>
  )
}

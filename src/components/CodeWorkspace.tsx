import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import CodeEditor from './CodeEditor'
import GitPanel from './GitPanel'
import MultiTerminal from './MultiTerminal'
import SearchResults from './SearchResults'
import AgentChat from './AgentChat'
import { useStore } from '../store'
import type { FileEntry } from '../types'
import type { LayoutPreferences } from '../lib/layoutPersistence'

type CodeWorkspaceProps = {
  layout: LayoutPreferences
  onLayout: (patch: Partial<LayoutPreferences>, persist?: boolean) => void
  onOpenFolder: () => Promise<void>
  onSettings: () => void
  onHelp: () => void
  onCommandPalette: () => void
}

type CodeMenuItem = { label: string; action: () => void; disabled?: boolean }

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

function joinWorkspace(root: string, name: string): string {
  return `${root.replace(/[\\/]$/, '')}/${name}`
}

function languageFor(path: string | null): string {
  const ext = path?.split('.').pop()?.toLowerCase() || ''
  const languages: Record<string, string> = { ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', jsx: 'JavaScript React', py: 'Python', css: 'CSS', html: 'HTML', json: 'JSON', md: 'Markdown', rs: 'Rust', go: 'Go', sql: 'SQL' }
  return languages[ext] || (path ? 'Plain text' : 'No file')
}

function CodeMenuBar({ menus }: { menus: Record<string, CodeMenuItem[]> }) {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(null) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return <nav ref={ref} className="vd-code-menubar" role="menubar" aria-label="Code mode menu">
    {Object.entries(menus).map(([label, items]) => <div key={label} className="vd-code-menu-item">
      <button role="menuitem" aria-haspopup="menu" aria-expanded={open === label} onClick={() => setOpen((value) => value === label ? null : label)}>{label}</button>
      {open === label && <div className="vd-code-menu-popup" role="menu" aria-label={`${label} menu`}>
        {items.map((item) => <button key={item.label} role="menuitem" disabled={item.disabled} onClick={() => { setOpen(null); item.action() }}>{item.label}</button>)}
      </div>}
    </div>)}
  </nav>
}

function ExplorerTree({ files, selectedFile, onOpen, onRename, onDelete }: { files: FileEntry[]; selectedFile: string | null; onOpen: (file: FileEntry) => void; onRename: () => void; onDelete: () => void }) {
  return <div className="vd-code-explorer-tree" role="tree" aria-label="Code explorer files">
    {files.length === 0 ? <div className="vd-code-empty">Open a folder to browse files.</div> : files.slice(0, 200).map((file) => <button key={file.path} role="treeitem" className={selectedFile === file.path ? 'active' : ''} title={file.path} onClick={() => onOpen(file)}>
      <span>{file.isDirectory ? '▸' : '·'}</span><span>{file.name}</span>
    </button>)}
    {selectedFile && <div className="vd-code-file-actions"><button onClick={onRename}>Rename</button><button onClick={onDelete}>Delete</button></div>}
  </div>
}

export default function CodeWorkspace({ layout, onLayout, onOpenFolder, onSettings, onHelp, onCommandPalette }: CodeWorkspaceProps) {
  const {
    workspacePath, files, setAllFiles, selectedFile, setSelectedFile, addOpenFile, openFiles,
    fileContent, fileDirty, gitStatus, gitLog, setGitLog, settings, setSearchResults,
  } = useStore()
  const [leftTab, setLeftTab] = useState<'explorer' | 'search' | 'source-control'>('explorer')
  const [searchQuery, setSearchQuery] = useState('')
  const [status, setStatus] = useState('Ready')
  const [diagnostics, setDiagnostics] = useState<Array<{ severity?: string }>>([])
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const resizeCleanup = useRef<(() => void) | null>(null)

  useEffect(() => () => resizeCleanup.current?.(), [])
  useEffect(() => {
    if (!workspacePath || !selectedFile) { setDiagnostics([]); return }
    let cancelled = false
    void window.api.lspDiagnostics(workspacePath, selectedFile).then((next) => { if (!cancelled && Array.isArray(next)) setDiagnostics(next) })
    return () => { cancelled = true }
  }, [selectedFile, workspacePath, fileContent])
  useEffect(() => {
    if (!workspacePath) { setGitLog([]); return }
    void window.api.gitLog(workspacePath, 30).then((next) => { if (Array.isArray(next)) setGitLog(next) })
  }, [workspacePath, setGitLog])

  const outline = useMemo(() => fileContent.split('\n').map((line, index) => {
    const match = line.match(/^\s*(export\s+)?(async\s+)?(function|class|interface|type|const|let|def)\s+([A-Za-z_$][\w$]*)/)
    return match ? { name: match[4], line: index + 1 } : null
  }).filter(Boolean) as Array<{ name: string; line: number }>, [fileContent])

  const refreshFiles = async () => {
    if (!workspacePath) return
    const next = await window.api.walkDirectory(workspacePath)
    if (Array.isArray(next)) setAllFiles(next)
  }
  const openFile = (file: FileEntry) => {
    if (file.isDirectory) return
    setSelectedFile(file.path)
    addOpenFile(file.path)
  }
  const createEntry = async (directory: boolean) => {
    if (!workspacePath) { setStatus('Open a folder first.') ; return }
    const name = window.prompt(directory ? 'New folder name' : 'New file name')?.trim()
    if (!name || /[\\/]/.test(name) || name === '.' || name === '..') return
    const path = joinWorkspace(workspacePath, name)
    const result = directory ? await window.api.createDirectory(path) : await window.api.createFile(path)
    setStatus('error' in result ? result.error : `${directory ? 'Created folder' : 'Created file'} ${name}`)
    await refreshFiles()
  }
  const renameSelected = async () => {
    if (!selectedFile) return
    const name = window.prompt('Rename selected file', baseName(selectedFile))?.trim()
    if (!name || /[\\/]/.test(name)) return
    const nextPath = joinWorkspace(selectedFile.slice(0, Math.max(selectedFile.lastIndexOf('/'), selectedFile.lastIndexOf('\\'))), name)
    const result = await window.api.rename(selectedFile, nextPath)
    setStatus('error' in result ? result.error : `Renamed to ${name}`)
    await refreshFiles()
  }
  const deleteSelected = async () => {
    if (!selectedFile || !window.confirm(`Delete ${baseName(selectedFile)}?`)) return
    const result = await window.api.deleteFile(selectedFile)
    setStatus('error' in result ? result.error : `Deleted ${baseName(selectedFile)}`)
    setSelectedFile(null)
    await refreshFiles()
  }
  const searchFiles = async () => {
    if (!workspacePath || !searchQuery.trim()) return
    const result = await window.api.toolExecute({ name: 'search_code', args: { pattern: searchQuery.trim(), limit: 100 }, workspace: workspacePath })
    if ('error' in result) setStatus(result.error || 'Search failed.')
    else { setSearchResults(result.result || ''); setStatus(`Search complete for ${searchQuery.trim()}`) }
  }
  const openVsCode = async () => {
    if (!workspacePath) { setStatus('Open a folder first to use VS Code.'); return }
    const result = await window.api.vscodeOpenWorkspace(workspacePath)
    setStatus('error' in result ? `${result.error} Install VS Code if needed.` : (result.result || 'Opened in VS Code.'))
  }
  const dispatchEditor = (name: string) => window.dispatchEvent(new Event(name))
  const beginResize = (kind: 'left' | 'right', event: React.PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const start = kind === 'left' ? layout.sidebarWidth : layout.historyWidth
    const move = (next: PointerEvent) => onLayout(kind === 'left' ? { sidebarWidth: start + next.clientX - startX } : { historyWidth: start - (next.clientX - startX) })
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); resizeCleanup.current = null; onLayout({}, true) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    resizeCleanup.current = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }

  const menus: Record<string, CodeMenuItem[]> = {
    File: [
      { label: 'Open folder…', action: () => { void onOpenFolder() } },
      { label: 'New file', action: () => { void createEntry(false) } },
      { label: 'New folder', action: () => { void createEntry(true) } },
      { label: 'Save', action: () => dispatchEditor('vd:code-save'), disabled: !selectedFile || !fileDirty },
      { label: 'Save all', action: () => dispatchEditor('vd:code-save'), disabled: openFiles.length === 0 },
      { label: 'Close tab', action: () => setSelectedFile(null), disabled: !selectedFile },
    ],
    Edit: [{ label: 'Find', action: () => dispatchEditor('vd:code-find') }, { label: 'Replace', action: () => dispatchEditor('vd:code-replace') }],
    Selection: [{ label: 'Select all', action: () => dispatchEditor('vd:code-select-all') }],
    View: [
      { label: 'Toggle explorer', action: () => onLayout({ sidebarCollapsed: !layout.sidebarCollapsed }, true) },
      { label: 'Toggle terminal', action: () => onLayout({ terminalCollapsed: !layout.terminalCollapsed }, true) },
      { label: 'Toggle agent panel', action: () => onLayout({ historyCollapsed: !layout.historyCollapsed }, true) },
    ],
    Go: [{ label: 'Go to file (Ctrl+P)', action: onCommandPalette }, { label: 'Go to definition (F12)', action: () => dispatchEditor('vd:code-definition'), disabled: !selectedFile }],
    Run: [{ label: 'Open terminal', action: () => onLayout({ terminalCollapsed: false }, true) }],
    Terminal: [{ label: 'Toggle terminal', action: () => onLayout({ terminalCollapsed: !layout.terminalCollapsed }, true) }],
    Help: [{ label: 'Settings', action: onSettings }, { label: 'Documentation and diagnostics', action: onHelp }],
  }

  const gridStyle = { gridTemplateColumns: `${layout.sidebarCollapsed ? 0 : layout.sidebarWidth}px 5px minmax(0, 1fr) 5px ${layout.historyCollapsed ? 0 : layout.historyWidth}px` }
  const outlineItems = outline.slice(0, 80)

  return <section className="vd-code-workspace" aria-label="Code workspace">
    <CodeMenuBar menus={menus} />
    <div className="vd-code-toolbar">
      <span className="vd-code-title">Code</span>
      <span className="vd-code-workspace-name">{workspacePath ? baseName(workspacePath) : 'No folder open'}</span>
      <div className="vd-code-toolbar-actions"><button className="btn btn-sm" onClick={() => { void onOpenFolder() }}>Open folder</button><button className="btn btn-sm" onClick={() => { void openVsCode() }}>Open in VS Code</button></div>
    </div>
    <div className="vd-code-grid" style={gridStyle}>
      {!layout.sidebarCollapsed && <aside className="vd-code-left" aria-label="Code explorer">
        <div className="vd-code-tabs" role="tablist" aria-label="Code side panels">
          {([['explorer', 'Explorer'], ['search', 'Search'], ['source-control', 'Source Control']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={leftTab === id} className={leftTab === id ? 'active' : ''} onClick={() => setLeftTab(id)}>{label}</button>)}
        </div>
        {leftTab === 'explorer' && <>
          <div className="vd-code-actions"><button onClick={() => { void createEntry(false) }} title="New file">＋ File</button><button onClick={() => { void createEntry(true) }} title="New folder">＋ Folder</button><button onClick={() => { void refreshFiles() }} title="Refresh files">↻</button></div>
          <ExplorerTree files={files} selectedFile={selectedFile} onOpen={openFile} onRename={() => { void renameSelected() }} onDelete={() => { void deleteSelected() }} />
          {selectedFile && <div className="vd-code-outline"><button className="vd-code-section" onClick={() => setOutlineOpen((value) => !value)}>{outlineOpen ? '⌄' : '›'} Outline</button>{outlineOpen && (outlineItems.length ? outlineItems.map((item) => <button key={`${item.name}-${item.line}`} onClick={() => { setStatus(`Outline: ${item.name} at line ${item.line}`) }}>ƒ {item.name} <small>:{item.line}</small></button>) : <div className="vd-code-empty">No symbols detected.</div>)}</div>}
          <div className="vd-code-timeline"><button className="vd-code-section" onClick={() => setTimelineOpen((value) => !value)}>{timelineOpen ? '⌄' : '›'} Timeline</button>{timelineOpen && (gitLog.length ? gitLog.slice(0, 8).map((entry) => <div key={entry.hash} title={entry.message}><strong>{entry.hash.slice(0, 7)}</strong> {entry.message}</div>) : <div className="vd-code-empty">No git history available.</div>)}</div>
        </>}
        {leftTab === 'search' && <div className="vd-code-search"><div className="vd-code-search-row"><input aria-label="Search in files" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchFiles() }} placeholder="Search in files" /><button onClick={() => { void searchFiles() }}>⌕</button></div><SearchResults /></div>}
        {leftTab === 'source-control' && <div className="vd-code-panel-scroll"><GitPanel /></div>}
      </aside>}
      {!layout.sidebarCollapsed && <div className="vd-code-resize" role="separator" aria-label="Resize code explorer" onPointerDown={(event) => beginResize('left', event)} />}
      <main className="vd-code-editor-pane"><CodeEditor /></main>
      {!layout.historyCollapsed && <div className="vd-code-resize" role="separator" aria-label="Resize code agent panel" onPointerDown={(event) => beginResize('right', event)} />}
      {!layout.historyCollapsed && <aside className="vd-code-agent" aria-label="Code mode agent panel"><div className="vd-code-agent-header"><span>Agent</span><button onClick={() => onLayout({ historyCollapsed: true }, true)} aria-label="Collapse agent panel">›</button></div><AgentChat hideTerminal /></aside>}
    </div>
    {!layout.terminalCollapsed && <div className="vd-code-terminal" style={{ height: layout.terminalHeight }}><div className="vd-code-terminal-header"><span>Terminal</span><button onClick={() => onLayout({ terminalCollapsed: true }, true)}>Collapse</button></div><MultiTerminal /></div>}
    <footer className="vd-code-statusbar"><span>{gitStatus?.branch ? `⑂ ${gitStatus.branch}` : '⑂ no branch'}</span><span>{diagnostics.filter((item) => item.severity === 'error').length} errors · {diagnostics.filter((item) => item.severity === 'warning').length} warnings</span><span>Ln {cursor.line}, Col {cursor.column}</span><span>{languageFor(selectedFile)} · UTF-8</span><span>{settings.providers.find((provider) => provider.id === settings.activeProvider)?.model || 'Auto model'}</span><span>{settings.layout?.workingMode || 'build'}</span><span>{status}</span></footer>
  </section>
}

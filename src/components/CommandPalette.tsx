/**
 * CommandPalette — Ctrl+P file search and command palette
 *
 * Cursor-like quick navigation:
 * - Files mode: fuzzy search all workspace files
 * - Commands mode: navigate panels, toggle features, git actions
 * - Tab to switch between files and commands
 * - Arrow keys to navigate, Enter to select
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useStore } from '../store'


interface Command {
  id: string
  label: string
  description?: string
  category: string
  icon: string
  shortcut?: string
  action: () => void
}

export default function CommandPalette() {
  const {
    showCommandPalette, setShowCommandPalette,
    setActivePanel, allFiles, setSelectedFile, addOpenFile,
    workspacePath, setWorkspacePath, toggleTerminal,
    clearMessages,
    settings, toggleCommandPalette,
  } = useStore()

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<'files' | 'commands'>('files')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Build command list
  const commands: Command[] = useMemo(() => [
    { id: 'open-folder', label: 'Open Folder', description: 'Open a workspace folder', category: 'Workspace', icon: '📂', action: async () => { const dir = await window.api.openDirectory(); if (dir) { setWorkspacePath(dir); setShowCommandPalette(false) } } },
    { id: 'toggle-terminal', label: 'Toggle Terminal', description: 'Show/hide the terminal panel', category: 'View', icon: '⬛', shortcut: 'Ctrl+`', action: () => { toggleTerminal(); setShowCommandPalette(false) } },
    { id: 'panel-chat', label: 'Go to Agent Chat', category: 'Navigation', icon: '🤖', action: () => { setActivePanel('chat'); setShowCommandPalette(false) } },
    { id: 'panel-files', label: 'Go to File Browser', category: 'Navigation', icon: '📁', action: () => { setActivePanel('files'); setShowCommandPalette(false) } },
    { id: 'panel-git', label: 'Go to Git', category: 'Navigation', icon: '🔀', action: () => { setActivePanel('git'); setShowCommandPalette(false) } },
    { id: 'panel-branches', label: 'Go to Branch Manager', category: 'Navigation', icon: '🌿', action: () => { setActivePanel('branches'); setShowCommandPalette(false) } },
    { id: 'panel-tasks', label: 'Go to Tasks', category: 'Navigation', icon: '📋', action: () => { setActivePanel('tasks'); setShowCommandPalette(false) } },
    { id: 'panel-settings', label: 'Go to Settings', category: 'Navigation', icon: '⚙️', action: () => { setActivePanel('settings'); setShowCommandPalette(false) } },
    { id: 'clear-chat', label: 'Clear Chat Messages', category: 'Agent', icon: '🗑️', action: () => { clearMessages(); setShowCommandPalette(false) } },
    { id: 'git-status', label: 'Show Git Status', category: 'Git', icon: '📊', shortcut: 'Ctrl+Shift+G', action: () => { setActivePanel('git'); setShowCommandPalette(false) } },
    { id: 'active-provider', label: `Active Model: ${settings.providers.find(p => p.id === settings.activeProvider)?.name || settings.activeProvider}`, category: 'Agent', icon: '🤖', action: () => { setActivePanel('settings'); setShowCommandPalette(false) } },
  ], [settings, workspacePath])

  // File results
  const fileResults = useMemo(() => {
    if (!query) return allFiles.slice(0, 30)
    const q = query.toLowerCase()
    return allFiles
      .filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      .slice(0, 30)
  }, [query, allFiles])

  // Command results
  const commandResults = useMemo(() => {
    if (!query) return commands
    const q = query.toLowerCase()
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    )
  }, [query, commands])

  const results = mode === 'files' ? [] : commandResults
  const fileCount = fileResults.length

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, mode])

  useEffect(() => {
    if (showCommandPalette) {
      setQuery('')
      setMode('commands')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showCommandPalette])

  // Keyboard shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        toggleCommandPalette()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setMode('commands')
        if (!showCommandPalette) toggleCommandPalette()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault()
        setActivePanel('git')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCommandPalette])

  const executeSelected = useCallback(() => {
    if (mode === 'files') {
      if (fileResults[selectedIndex]) {
        setSelectedFile(fileResults[selectedIndex].path)
        addOpenFile(fileResults[selectedIndex].path)
        setShowCommandPalette(false)
      }
    } else {
      if (results[selectedIndex]) {
        results[selectedIndex].action()
      }
    }
  }, [selectedIndex, mode, fileResults, results])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const maxIndex = mode === 'files' ? fileCount - 1 : results.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, maxIndex))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executeSelected()
    } else if (e.key === 'Escape') {
      setShowCommandPalette(false)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      setMode((m) => m === 'files' ? 'commands' : 'files')
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!showCommandPalette) return null

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', justifyContent: 'center', paddingTop: '15vh',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setShowCommandPalette(false) }}
    >
      <div style={{
        width: 560, maxHeight: 440, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Search bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 10, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>
            {mode === 'files' ? '📁' : '⚡'}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'files' ? 'Search files...' : 'Type a command...'}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setMode('files')}
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                background: mode === 'files' ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: mode === 'files' ? 'white' : 'var(--text-secondary)',
                border: 'none',
              }}
            >
              Files
            </button>
            <button
              onClick={() => setMode('commands')}
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                background: mode === 'commands' ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: mode === 'commands' ? 'white' : 'var(--text-secondary)',
                border: 'none',
              }}
            >
              Commands
            </button>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tab to switch</span>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {mode === 'files' ? (
            fileResults.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                {workspacePath ? 'No files match your search' : 'Open a folder first (Ctrl+Shift+P → Open Folder)'}
              </div>
            ) : (
              fileResults.map((file, i) => (
                <div
                  key={file.path}
                  onClick={() => { setSelectedFile(file.path); addOpenFile(file.path); setShowCommandPalette(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                    cursor: 'pointer', fontSize: 13,
                    background: selectedIndex === i ? 'rgba(59,130,246,0.15)' : 'transparent',
                    borderLeft: selectedIndex === i ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
                  <span>{file.isDirectory ? '📁' : getFileIcon(file.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.path}
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            results.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No commands match
              </div>
            ) : (
              (() => {
                let lastCategory = ''
                return results.map((cmd, i) => {
                  const showCategory = cmd.category !== lastCategory
                  lastCategory = cmd.category
                  return (
                    <div key={cmd.id}>
                      {showCategory && (
                        <div style={{
                          padding: '6px 16px', fontSize: 11, fontWeight: 600,
                          color: 'var(--text-muted)', textTransform: 'uppercase',
                          marginTop: i > 0 ? 6 : 0,
                        }}>
                          {cmd.category}
                        </div>
                      )}
                      <div
                        onClick={cmd.action}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px',
                          cursor: 'pointer', fontSize: 13,
                          background: selectedIndex === i ? 'rgba(59,130,246,0.15)' : 'transparent',
                          borderLeft: selectedIndex === i ? '2px solid var(--accent)' : '2px solid transparent',
                        }}
                      >
                        <span style={{ width: 20, textAlign: 'center' }}>{cmd.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{cmd.label}</div>
                          {cmd.description && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cmd.description}</div>
                          )}
                        </div>
                        {cmd.shortcut && (
                          <span style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace',
                            background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                          }}>
                            {cmd.shortcut}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              })()
            )
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '6px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span>↑↓ Navigate</span>
          <span>Enter Select</span>
          <span>Tab Switch</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  )
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: '🟦', tsx: '🟦', js: '🟨', jsx: '🟨', json: '📦',
    md: '📝', css: '🎨', html: '🌐', py: '🐍', rs: '🦀',
    go: '🔵', yaml: '⚙️', yml: '⚙️', toml: '⚙️', sh: '⬛',
    dockerfile: '🐳', gitignore: '👻',
  }
  return map[ext] || '📄'
}

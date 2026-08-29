/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Sidebar — Navigation sidebar
 *
 * Vertical icon bar with tooltips showing keyboard shortcuts:
 * - Agent, Files, Git, Branches, Tasks, Sessions, Terminal, Settings
 * - Command Palette trigger (Ctrl+P)
 * - Terminal toggle (Ctrl+`)
 *
 * Accessibility: role="navigation", aria-label on every button, aria-keyshortcuts
 */
import { useStore } from '../store'
import type { Panel } from '../types'

const PANELS: { id: Panel; icon: string; label: string; shortcut?: string }[] = [
  { id: 'chat', icon: '🤖', label: 'Agent', shortcut: 'Ctrl+Shift+A' },
  { id: 'files', icon: '📁', label: 'Files', shortcut: 'Ctrl+B' },
  { id: 'git', icon: '🔀', label: 'Git', shortcut: 'Ctrl+G' },
  { id: 'branches', icon: '🌿', label: 'Branches' },
  { id: 'tasks', icon: '📋', label: 'Tasks' },
  { id: 'sessions', icon: '💾', label: 'Sessions' },
  { id: 'terminal', icon: '⬛', label: 'Terminal', shortcut: 'Ctrl+`' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

export default function Sidebar() {
  const { activePanel, setActivePanel, toggleTerminal, showTerminal, toggleCommandPalette } = useStore()

  return (
    <nav className="sidebar" role="navigation" aria-label="Main navigation">
      {/* Logo */}
      <div
        role="img"
        aria-label="Freebuff Agent logo"
        style={{
          width: 32, height: 32, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--accent), #a855f7)',
          fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 8,
        }}
      >
        F
      </div>

      {/* Search / command palette */}
      <button
        className="sidebar-button"
        onClick={toggleCommandPalette}
        title="Command Palette (Ctrl+P)"
        aria-label="Open command palette"
        aria-keyshortcuts="Control+P"
        style={{ marginBottom: 4 }}
      >
        🔍
      </button>

      <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '4px 0' }} />

      {/* Panel buttons */}
      <div role="tablist" aria-label="Panels" style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
        {PANELS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={activePanel === p.id}
            aria-label={`${p.label} panel${p.shortcut ? ` (${p.shortcut})` : ''}`}
            aria-keyshortcuts={p.shortcut || undefined}
            className={`sidebar-button ${activePanel === p.id ? 'active' : ''}`}
            onClick={() => setActivePanel(p.id)}
            title={`${p.label}${p.shortcut ? ` (${p.shortcut})` : ''}`}
          >
            {p.icon}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Terminal toggle */}
      <button
        className={`sidebar-button ${showTerminal ? 'active' : ''}`}
        onClick={toggleTerminal}
        title="Toggle Terminal (Ctrl+`)"
        aria-label={`${showTerminal ? 'Hide' : 'Show'} terminal`}
        aria-keyshortcuts="Control+`"
        aria-pressed={showTerminal}
      >
        ▶
      </button>

      {/* Version */}
      <div style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4, lineHeight: 1.3 }} title="Freebuff Agent v1.0.0 by Virender Dhiman">
        v1.0.0
      </div>
    </nav>
  )
}

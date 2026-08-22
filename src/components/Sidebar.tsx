import { useStore } from '../store'
import type { Panel } from '../types'

const PANELS: { id: Panel; icon: string; label: string; shortcut?: string }[] = [
  { id: 'chat', icon: '🤖', label: 'Agent', shortcut: '' },
  { id: 'files', icon: '📁', label: 'Files' },
  { id: 'git', icon: '🔀', label: 'Git', shortcut: 'Ctrl+G' },
  { id: 'branches', icon: '🌿', label: 'Branches' },
  { id: 'tasks', icon: '📋', label: 'Tasks' },
  { id: 'terminal', icon: '⬛', label: 'Terminal', shortcut: 'Ctrl+`' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

export default function Sidebar() {
  const { activePanel, setActivePanel, toggleTerminal, showTerminal, toggleCommandPalette } = useStore()

  return (
    <nav className="sidebar">
      {/* Logo / brand */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--accent), #a855f7)',
        fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 8,
      }}>
        F
      </div>

      {/* Search / command palette */}
      <button
        className="sidebar-button"
        onClick={toggleCommandPalette}
        title="Command Palette (Ctrl+P)"
        style={{ marginBottom: 4 }}
      >
        🔍
      </button>

      <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '4px 0' }} />

      {/* Panel buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
        {PANELS.map((p) => (
          <button
            key={p.id}
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
        style={{ marginBottom: 8 }}
      >
        ▶
      </button>
    </nav>
  )
}

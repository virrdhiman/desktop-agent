import type { Panel } from '../types'

type LeftRailProps = {
  activePanel: Panel
  collapsed: boolean
  onToggle: () => void
  onHome: () => void
  onSettings: () => void
}

export default function LeftRail({ activePanel, collapsed, onToggle, onHome, onSettings }: LeftRailProps) {
  const items = [
    { id: 'home', label: 'Home', icon: '⌂', active: activePanel === 'chat', onClick: onHome },
    { id: 'layout', label: collapsed ? 'Expand layout' : 'Collapse layout', icon: '◫', active: false, onClick: onToggle },
    { id: 'settings', label: 'Settings', icon: '⚙', active: activePanel === 'settings', onClick: onSettings },
  ]

  return (
    <nav className="vd-left-rail" aria-label="Primary navigation">
      <div className="vd-rail-brand" role="img" aria-label="VD Agent">VD</div>
      <div className="vd-rail-items">
        {items.map((item) => (
          <button
            key={item.id}
            className={`vd-rail-button ${item.active ? 'active' : ''}`}
            aria-label={item.label}
            aria-pressed={item.active}
            title={item.label}
            onClick={item.onClick}
          >
            <span aria-hidden="true">{item.icon}</span><span className="vd-rail-label">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="vd-rail-spacer" />
    </nav>
  )
}

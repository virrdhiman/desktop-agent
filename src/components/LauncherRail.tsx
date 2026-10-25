import type { RightPanelTab } from '../lib/layoutPersistence'

type LauncherRailProps = { activePanel: RightPanelTab; onSelect: (panel: RightPanelTab) => void }

export default function LauncherRail({ activePanel, onSelect }: LauncherRailProps) {
  const launchers: Array<{ id: RightPanelTab; label: string; icon: string }> = [
    { id: 'browser', label: 'Browser', icon: '◉' },
    { id: 'files', label: 'Files', icon: '▣' },
    { id: 'terminal', label: 'Terminal', icon: '›_' },
    { id: 'changes', label: 'Changes', icon: '⑂' },
  ]
  return (
    <aside className="vd-launcher-rail" aria-label="Quick launchers">
      {launchers.map((launcher) => (
        <button key={launcher.id} className={`vd-launcher-button ${activePanel === launcher.id ? 'active' : ''}`} aria-label={launcher.label} title={launcher.label} aria-pressed={activePanel === launcher.id} onClick={() => onSelect(launcher.id)}>
          <span aria-hidden="true">{launcher.icon}</span><span className="vd-launcher-label">{launcher.label.split(' / ')[0]}</span>
        </button>
      ))}
    </aside>
  )
}

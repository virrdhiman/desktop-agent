import type { RightPanelTab } from '../lib/layoutPersistence'
import FileBrowser from './FileBrowser'
import GitPanel from './GitPanel'
import MultiTerminal from './MultiTerminal'
import SearchResults from './SearchResults'
import TaskPanel from './TaskPanel'
import VsCodeBridgePanel from './VsCodeBridgePanel'

type RightToolPanelProps = {
  tab: RightPanelTab
  onTab: (tab: RightPanelTab) => void
  onCollapse: () => void
  width: number
  onResizeStart: (event: React.PointerEvent) => void
}

const tabs: Array<{ id: RightPanelTab; label: string; shortLabel: string }> = [
  { id: 'browser', label: 'Search results', shortLabel: 'Search' },
  { id: 'terminal', label: 'Terminal', shortLabel: 'Term' },
  { id: 'files', label: 'Files', shortLabel: 'Files' },
  { id: 'changes', label: 'Changes', shortLabel: 'Git' },
  { id: 'vscode', label: 'VS Code bridge', shortLabel: 'VS' },
  { id: 'tasks', label: 'Tasks', shortLabel: 'Tasks' },
]

function contentFor(tab: RightPanelTab) {
  if (tab === 'browser') return <SearchResults />
  if (tab === 'terminal') return <MultiTerminal />
  if (tab === 'files') return <FileBrowser />
  if (tab === 'changes') return <GitPanel />
  if (tab === 'vscode') return <VsCodeBridgePanel />
  return <TaskPanel />
}

export default function RightToolPanel({ tab, onTab, onCollapse, width, onResizeStart }: RightToolPanelProps) {
  const current = tabs.find((item) => item.id === tab) || tabs[0]
  return (
    <aside className="vd-right-tools" style={{ width }} aria-label="Right tools area">
      <div className="vd-resize-handle vd-resize-right" role="separator" aria-label="Resize right tools" onPointerDown={onResizeStart} />
      <section className="vd-right-panel" aria-label="Right tool panel">
        <header className="vd-right-panel-header">
          <strong>{current.label}</strong>
          <button className="vd-icon-button" aria-label="Collapse right tools" title="Collapse right tools" onClick={onCollapse}>›</button>
        </header>
        <div className="vd-right-panel-tabs" role="tablist" aria-label="Right tools">
          {tabs.map((item) => (
            <button key={item.id} role="tab" aria-selected={tab === item.id} aria-label={item.label} title={item.label} className={tab === item.id ? 'active' : ''} onClick={() => onTab(item.id)}>
              {item.shortLabel}
            </button>
          ))}
        </div>
        <div className="vd-right-panel-content">{contentFor(tab)}</div>
      </section>
    </aside>
  )
}

import { useState, type CSSProperties } from 'react'
import { useStore } from '../store'
import SessionsPanel from './SessionsPanel'
import SearchResults from './SearchResults'

export default function HistoryPane({ collapsed, onToggle, style }: { collapsed: boolean; onToggle: () => void; style?: CSSProperties }) {
  const [tab, setTab] = useState<'history' | 'search'>('history')
  const sessions = useStore((state) => state.sessions)
  if (collapsed) return <aside className="vd-history-pane vd-history-collapsed"><button className="vd-sidebar-expand" aria-label="Expand history" title="Expand history" onClick={onToggle}>‹</button></aside>
  return (
    <aside className="vd-history-pane" style={style} aria-label="Session and chat history">
      <div className="vd-pane-header"><div><div className="vd-sidebar-title">Context</div><div className="vd-sidebar-subtitle">Sessions & history</div></div><button className="vd-icon-button" aria-label="Collapse history" title="Collapse history" onClick={onToggle}>›</button></div>
      <div className="vd-history-tabs" role="tablist" aria-label="History tabs">
        <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Chats <span>{sessions.length}</span></button>
        <button role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>Search</button>
      </div>
      <div className="vd-history-content">{tab === 'history' ? <SessionsPanel /> : <SearchResults />}</div>
    </aside>
  )
}

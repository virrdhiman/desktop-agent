/**
 * SessionsPanel — Conversation history manager
 *
 * Features:
 * - List all saved conversation sessions
 * - Load a previous session
 * - Delete sessions
 * - Shows message count and timestamp
 * - Active session indicator
 */
import { useStore } from '../store'

export default function SessionsPanel() {
  const { sessions, loadSession, deleteSession, currentSessionId } = useStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <h2>💾 Sessions</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {sessions.length} saved
        </span>
      </div>

      <div className="panel-body" style={{ flex: 1, overflowY: 'auto' }}>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💾</div>
            <div className="empty-state-text">No saved sessions</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              Sessions are saved automatically when you have messages.<br />
              Use the 💾 button in the Agent chat to save.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sessions.map((s) => (
              <div
                key={s.id}
                className="card"
                style={{
                  padding: '12px 14px', cursor: 'pointer',
                  border: currentSessionId === s.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: currentSessionId === s.id ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)',
                }}
                onClick={() => loadSession(s.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(s.timestamp).toLocaleString()} · {s.messages.length} messages
                    </div>
                    {currentSessionId === s.id && (
                      <div style={{ marginTop: 4 }}>
                        <span className="badge badge-blue" style={{ fontSize: 10 }}>Active</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn btn-sm"
                      onClick={(e) => { e.stopPropagation(); loadSession(s.id) }}
                    >
                      📂
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                      style={{ color: 'var(--error)' }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

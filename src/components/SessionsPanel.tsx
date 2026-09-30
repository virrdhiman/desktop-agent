/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * SessionsPanel — Chat history manager
 *
 * Conversations are auto-saved to <userData>/conversations on this machine.
 * - List saved chats, newest first
 * - Open a previous chat in the Agent panel
 * - Delete a chat (removes its file from disk)
 */
import { useStore } from '../store'

export default function SessionsPanel() {
  const { sessions, loadSession, deleteSession, currentSessionId, newChat, setActivePanel } = useStore()

  const open = (id: string) => {
    void loadSession(id)
    setActivePanel('chat')
  }

  const remove = (id: string) => {
    if (window.confirm('Delete this chat from disk? This cannot be undone.')) void deleteSession(id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <h2>💾 Sessions</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {sessions.length} saved
          </span>
          <button
            className="btn btn-sm"
            onClick={() => { void newChat(); setActivePanel('chat') }}
          >
            ＋ New chat
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ flex: 1, overflowY: 'auto' }}>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💾</div>
            <div className="empty-state-text">No saved chats</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              Chats are saved automatically on this machine as you talk to the agent<br />
              and are restored when you restart the app.
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
                onClick={() => open(s.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(s.updatedAt).toLocaleString()} · {s.messages.length} messages
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
                      aria-label={`Open chat ${s.title}`}
                      title="Open"
                      onClick={(e) => { e.stopPropagation(); open(s.id) }}
                    >
                      📂
                    </button>
                    <button
                      className="btn btn-sm"
                      aria-label={`Delete chat ${s.title}`}
                      title="Delete from disk"
                      onClick={(e) => { e.stopPropagation(); remove(s.id) }}
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

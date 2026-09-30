/** Local conversation history, resume state, export, and checkpoint recovery. */
import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { ChatSession } from '../types'

export default function SessionsPanel() {
  const {
    sessions, loadSession, deleteSession, currentSessionId, newChat, setActivePanel,
    renameSession, toggleSessionPin, reloadSessions, addMessage, setAllFiles,
  } = useStore()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sessions
    return sessions.filter((session) =>
      session.title.toLowerCase().includes(needle) ||
      session.messages.some((message) => message.content.toLowerCase().includes(needle)) ||
      session.resume?.workspacePath?.toLowerCase().includes(needle)
    )
  }, [query, sessions])

  const open = async (id: string) => {
    await loadSession(id)
    setActivePanel('chat')
  }

  const remove = (id: string) => {
    if (window.confirm('Delete this chat from disk? This cannot be undone.')) void deleteSession(id)
  }

  const rename = (session: ChatSession) => {
    const title = window.prompt('Rename chat', session.title)
    if (title?.trim()) void renameSession(session.id, title)
  }

  const restore = async (session: ChatSession) => {
    const checkpoint = session.resume?.checkpoint
    if (!checkpoint) return
    if (!window.confirm(`Restore ${checkpoint.files.length} file checkpoint from ${new Date(checkpoint.createdAt).toLocaleString()}? Current versions of those files will be replaced.`)) return
    setBusy(session.id)
    try {
      const result = await window.api.restoreCheckpoint(session.id, checkpoint.id)
      if ('error' in result) {
        window.alert(`Restore failed: ${result.error}`)
        return
      }
      await loadSession(session.id)
      const files = await window.api.walkDirectory(result.workspace)
      setAllFiles(files)
      addMessage({
        id: `${Date.now()}-restore`,
        role: 'system',
        timestamp: Date.now(),
        content: `Restored checkpoint ${checkpoint.id}: ${result.restored.length} file(s) restored, ${result.removed.length} newly created file(s) removed${result.skipped.length ? `, ${result.skipped.length} oversized file(s) skipped` : ''}.`,
      })
      setActivePanel('chat')
    } finally {
      setBusy('')
    }
  }

  const importChats = async () => {
    setBusy('import')
    try {
      const result = await window.api.importConversations()
      if (!Array.isArray(result)) window.alert(`Import failed: ${result.error}`)
      else await reloadSessions()
    } finally {
      setBusy('')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <h2>Sessions</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sessions.length} saved locally</span>
          <button className="btn btn-sm" onClick={importChats} disabled={busy === 'import'} title="Import chats">Import</button>
          <button className="btn btn-sm btn-primary" onClick={() => { void newChat(); setActivePanel('chat') }}>New chat</button>
        </div>
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles, messages, or workspace paths"
          aria-label="Search saved chats"
        />
      </div>

      <div className="panel-body" style={{ flex: 1, overflowY: 'auto' }}>
        {shown.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">{sessions.length ? 'No chats match this search' : 'No saved chats'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              Chats and their working state are saved automatically on this machine.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shown.map((session) => {
              const resume = session.resume
              return (
                <div
                  key={session.id}
                  className="card"
                  style={{
                    padding: '12px 14px', cursor: 'pointer',
                    border: currentSessionId === session.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: currentSessionId === session.id ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)',
                  }}
                  onClick={() => { void open(session.id) }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {session.pinned && <span title="Pinned">Pinned</span>}
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        {new Date(session.updatedAt).toLocaleString()} · {session.messages.length} messages
                        {resume?.tasks?.length ? ` · ${resume.tasks.length} tasks` : ''}
                      </div>
                      {resume?.workspacePath && (
                        <div title={resume.workspacePath} style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {resume.workspacePath}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                        {currentSessionId === session.id && <span className="badge badge-blue" style={{ fontSize: 10 }}>Active</span>}
                        {resume?.lastVerification && (
                          <span className={`badge ${resume.lastVerification.ok ? 'badge-green' : ''}`} style={{ fontSize: 10 }}>
                            Last check {resume.lastVerification.ok ? 'passed' : 'failed'}
                          </span>
                        )}
                        {resume?.checkpoint && <span className="badge" style={{ fontSize: 10 }}>{resume.checkpoint.files.length} recoverable files</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" title={session.pinned ? 'Unpin' : 'Pin'} onClick={(event) => { event.stopPropagation(); void toggleSessionPin(session.id) }}>Pin</button>
                      <button className="btn btn-sm" title="Rename" onClick={(event) => { event.stopPropagation(); rename(session) }}>Rename</button>
                      <button className="btn btn-sm" title="Export" onClick={(event) => { event.stopPropagation(); void window.api.exportConversation(session.id) }}>Export</button>
                      {resume?.checkpoint && (
                        <button className="btn btn-sm" disabled={busy === session.id} title="Restore files to the last pre-edit checkpoint" onClick={(event) => { event.stopPropagation(); void restore(session) }}>
                          Restore
                        </button>
                      )}
                      <button className="btn btn-sm" aria-label={`Delete chat ${session.title}`} title="Delete from disk" onClick={(event) => { event.stopPropagation(); remove(session.id) }} style={{ color: 'var(--error)' }}>Delete</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

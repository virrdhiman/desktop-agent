/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * BranchManager — Git branch management UI
 *
 * Features:
 * - List all local branches with current branch highlighted
 * - Create new branches
 * - Switch between branches
 * - Delete branches
 * - Stash management (stash/pop)
 * - Branch info (ahead/behind tracking)
 */
import { useEffect, useState, useCallback } from 'react'
import { useStore } from '../store'

export default function BranchManager() {
  const {
    workspacePath, gitBranches, setGitBranches,
    gitStatus, addTerminalEntry,
  } = useStore()

  const [newBranch, setNewBranch] = useState('')
  const [loading, setLoading] = useState(false)
  const [stashMsg, setStashMsg] = useState<string | null>(null)

  const loadBranches = useCallback(async () => {
    if (!workspacePath) return
    try {
      const result = await window.api.gitBranches(workspacePath)
      if (!('error' in result)) setGitBranches(result)
    } catch (err) { console.error('Failed to load branches:', err) }
  }, [workspacePath])

  useEffect(() => { loadBranches() }, [loadBranches])

  const handleCreate = useCallback(async () => {
    if (!newBranch.trim() || !workspacePath) return
    setLoading(true)
    try {
      const result = await window.api.gitCreateBranch(workspacePath, newBranch.trim())
      if ('error' in result) {
        addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Branch creation failed: ${result.error}`, timestamp: Date.now() })
      } else {
        addTerminalEntry({ id: Date.now().toString(), type: 'success', content: `Created branch: ${newBranch.trim()}`, timestamp: Date.now() })
      }
    } catch (err: any) {
      addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Branch creation error: ${err.message}`, timestamp: Date.now() })
    }
    setNewBranch('')
    await loadBranches()
    setLoading(false)
  }, [newBranch, workspacePath])

  const handleSwitch = useCallback(async (branch: string) => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const result = await window.api.gitSwitchBranch(workspacePath, branch)
      if ('error' in result) {
        addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Switch failed: ${result.error}`, timestamp: Date.now() })
      } else {
        addTerminalEntry({ id: Date.now().toString(), type: 'success', content: `Switched to: ${branch}`, timestamp: Date.now() })
      }
    } catch (err: any) {
      addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Switch error: ${err.message}`, timestamp: Date.now() })
    }
    await loadBranches()
    setLoading(false)
  }, [workspacePath])

  const handleDelete = useCallback(async (branch: string) => {
    if (!workspacePath || !confirm(`Delete branch "${branch}"?`)) return
    setLoading(true)
    try {
      const result = await window.api.gitDeleteBranch(workspacePath, branch)
      if ('error' in result) {
        addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Delete failed: ${result.error}`, timestamp: Date.now() })
      } else {
        addTerminalEntry({ id: Date.now().toString(), type: 'success', content: `Deleted branch: ${branch}`, timestamp: Date.now() })
      }
    } catch (err: any) {
      addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Delete error: ${err.message}`, timestamp: Date.now() })
    }
    await loadBranches()
    setLoading(false)
  }, [workspacePath])

  const handleStash = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const result = await window.api.gitStash(workspacePath)
      if ('error' in result) {
        addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Stash failed: ${result.error}`, timestamp: Date.now() })
      } else {
        addTerminalEntry({ id: Date.now().toString(), type: 'success', content: `Changes stashed`, timestamp: Date.now() })
        setStashMsg(result.message || 'Stashed')
      }
    } catch (err: any) {
      addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Stash error: ${err.message}`, timestamp: Date.now() })
    }
    setLoading(false)
  }, [workspacePath])

  const handleStashPop = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const result = await window.api.gitStashPop(workspacePath)
      if ('error' in result) {
        addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Stash pop failed: ${result.error}`, timestamp: Date.now() })
      } else {
        addTerminalEntry({ id: Date.now().toString(), type: 'success', content: 'Stash popped', timestamp: Date.now() })
        setStashMsg(null)
      }
    } catch (err: any) {
      addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Stash pop error: ${err.message}`, timestamp: Date.now() })
    }
    setLoading(false)
  }, [workspacePath])

  if (!workspacePath) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🌿</div>
        <div className="empty-state-text">Open a workspace first</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <h2>🌿 Branch Manager</h2>
        <button className="btn btn-sm" onClick={loadBranches} disabled={loading}>🔄 Refresh</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Branches */}
        <div style={{ width: 360, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Create branch */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              Create Branch
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="input"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                placeholder="new-branch-name"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                style={{ fontSize: 12 }}
              />
              <button className="btn btn-sm btn-primary" onClick={handleCreate} disabled={loading || !newBranch.trim()}>
                + Create
              </button>
            </div>
          </div>

          {/* Branch list */}
          <div className="panel-body" style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            {gitBranches?.branches.map((branch: string) => (
              <div
                key={branch}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 6, marginBottom: 2,
                  background: gitBranches.current === branch ? 'rgba(59,130,246,0.1)' : 'transparent',
                  border: `1px solid ${gitBranches.current === branch ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                <span style={{ fontSize: 12 }}>
                  {gitBranches.current === branch ? '📍' : '🌿'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: gitBranches.current === branch ? 600 : 400 }}>
                    {branch}
                  </div>
                  {gitBranches.current === branch && (
                    <div style={{ fontSize: 11, color: 'var(--accent)' }}>Current branch</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {gitBranches.current !== branch && (
                    <>
                      <button className="btn btn-sm" onClick={() => handleSwitch(branch)} disabled={loading}>
                        ↩ Switch
                      </button>
                      <button className="btn btn-sm" onClick={() => handleDelete(branch)} disabled={loading} style={{ color: 'var(--error)' }}>
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Stash + Info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Branch Operations</div>

          {/* Stash */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📦 Stash</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Save uncommitted changes to a stack, then reapply later.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-warning" onClick={handleStash} disabled={loading}>
                📦 Stash Changes
              </button>
              <button className="btn btn-sm btn-success" onClick={handleStashPop} disabled={loading || !stashMsg}>
                📤 Pop Stash
              </button>
            </div>
            {stashMsg && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.1)', borderRadius: 6, fontSize: 12 }}>
                📦 {stashMsg}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>ℹ️ Quick Info</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Current: </span>
                <span style={{ fontWeight: 600 }}>{gitBranches?.current || 'N/A'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Total branches: </span>
                <span style={{ fontWeight: 600 }}>{gitBranches?.branches.length || 0}</span>
              </div>
              {gitStatus && (
                <>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Ahead: </span>
                    <span style={{ fontWeight: 600, color: gitStatus.ahead > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {gitStatus.ahead}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Behind: </span>
                    <span style={{ fontWeight: 600, color: gitStatus.behind > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {gitStatus.behind}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>💡 Tips</div>
            <ul style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, paddingLeft: 16 }}>
              <li>Use descriptive branch names: <code>feat/add-auth</code>, <code>fix/null-pointer</code></li>
              <li>Stash before switching branches to avoid conflicts</li>
              <li>The agent can also manage branches — just ask!</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

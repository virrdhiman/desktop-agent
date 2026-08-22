import { useEffect, useState, useCallback } from 'react'
import { useStore } from '../store'

export default function GitPanel() {
  const {
    workspacePath, isRepo, setIsRepo,
    gitStatus, setGitStatus, gitLog, setGitLog,
    gitDiff, setGitDiff,
    addTerminalEntry,
  } = useStore()

  const [commitMsg, setCommitMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [diffFile, setDiffFile] = useState<string | null>(null)
  const [diffViewMode, setDiffViewMode] = useState<'unified' | 'split'>('unified')

  const refresh = useCallback(async () => {
    if (!workspacePath) return
    const isRepoCheck = await window.api.gitIsRepo(workspacePath)
    setIsRepo(isRepoCheck)
    if (!isRepoCheck) return

    const [status, log] = await Promise.all([
      window.api.gitStatus(workspacePath),
      window.api.gitLog(workspacePath, 30),
    ])
    if (!('error' in status)) setGitStatus(status as any)
    if (Array.isArray(log)) setGitLog(log)
  }, [workspacePath])

  useEffect(() => { refresh() }, [refresh])

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim() || !workspacePath) return
    setLoading(true)
    addTerminalEntry({ id: Date.now().toString(), type: 'command', content: `git commit -m "${commitMsg}"`, timestamp: Date.now() })

    const result = await window.api.gitCommit(workspacePath, commitMsg)
    if ('error' in result) {
      addTerminalEntry({ id: (Date.now() + 1).toString(), type: 'error', content: result.error, timestamp: Date.now() })
    } else {
      addTerminalEntry({ id: (Date.now() + 1).toString(), type: 'success', content: `Committed successfully. ${result.summary || ''}`, timestamp: Date.now() })
    }
    setCommitMsg('')
    await refresh()
    setLoading(false)
  }, [commitMsg, workspacePath, refresh])

  const handlePush = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    addTerminalEntry({ id: Date.now().toString(), type: 'command', content: 'git push', timestamp: Date.now() })

    const result = await window.api.gitPush(workspacePath)
    if ('error' in result) {
      addTerminalEntry({ id: (Date.now() + 1).toString(), type: 'error', content: result.error, timestamp: Date.now() })
    } else {
      addTerminalEntry({ id: (Date.now() + 1).toString(), type: 'success', content: 'Push successful!', timestamp: Date.now() })
    }
    await refresh()
    setLoading(false)
  }, [workspacePath, refresh])

  const handlePull = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    addTerminalEntry({ id: Date.now().toString(), type: 'command', content: 'git pull', timestamp: Date.now() })

    const result = await window.api.gitPull(workspacePath)
    if ('error' in result) {
      addTerminalEntry({ id: (Date.now() + 1).toString(), type: 'error', content: result.error, timestamp: Date.now() })
    } else {
      addTerminalEntry({ id: (Date.now() + 1).toString(), type: 'success', content: `Pull successful. ${result.summary || ''}`, timestamp: Date.now() })
    }
    await refresh()
    setLoading(false)
  }, [workspacePath, refresh])

  const handleInit = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    const result = await window.api.gitInit(workspacePath)
    if ('error' in result) {
      addTerminalEntry({ id: Date.now().toString(), type: 'error', content: result.error, timestamp: Date.now() })
    } else {
      addTerminalEntry({ id: Date.now().toString(), type: 'success', content: 'Repository initialized!', timestamp: Date.now() })
    }
    await refresh()
    setLoading(false)
  }, [workspacePath, refresh])

  const showDiff = useCallback(async (file?: string) => {
    if (!workspacePath) return
    const d = await window.api.gitDiff(workspacePath, file)
    setDiffFile(file || null)
    setGitDiff(typeof d === 'string' ? d : d.error || '')
  }, [workspacePath])

  if (!workspacePath) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔀</div>
        <div className="empty-state-text">Open a workspace folder first</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <h2>🔀 Git</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {gitStatus?.branch && <span className="badge badge-blue">{gitStatus.branch}</span>}
          <button className="btn btn-sm" onClick={refresh} disabled={loading}>🔄 Refresh</button>
        </div>
      </div>

      {!isRepo ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-state-icon">📁</div>
          <div className="empty-state-text">Not a git repository</div>
          <button className="btn btn-primary" onClick={handleInit} disabled={loading}>Initialize Repository</button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: Status + Actions */}
          <div style={{ width: 320, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {gitStatus && (
              <div className="panel-body" style={{ paddingBottom: 0 }}>
                <div className="card" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>🌿 {gitStatus.branch}</span>
                    {gitStatus.isClean ? (
                      <span className="badge badge-green">Clean</span>
                    ) : (
                      <span className="badge badge-yellow">Dirty</span>
                    )}
                  </div>
                  {gitStatus.tracking && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Tracking: {gitStatus.tracking}
                      {gitStatus.ahead > 0 && ` · ${gitStatus.ahead} ahead`}
                      {gitStatus.behind > 0 && ` · ${gitStatus.behind} behind`}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="panel-body" style={{ paddingTop: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  className="input"
                  placeholder="Commit message..."
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  rows={2}
                  style={{ fontSize: 12, resize: 'none' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-success" onClick={handleCommit} disabled={loading || !commitMsg.trim()}>✓ Commit</button>
                  <button className="btn btn-sm btn-primary" onClick={handlePush} disabled={loading}>⬆ Push</button>
                  <button className="btn btn-sm btn-warning" onClick={handlePull} disabled={loading}>⬇ Pull</button>
                </div>
              </div>
            </div>

            <div className="divider" />

            <div className="panel-body" style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Changes</div>
              {gitStatus?.staged.map((f) => (
                <FileRow key={`s-${f}`} file={f} label="S" color="green" onClick={() => showDiff(f)} />
              ))}
              {gitStatus?.modified.map((f) => (
                <FileRow key={`m-${f}`} file={f} label="M" color="yellow" onClick={() => showDiff(f)} />
              ))}
              {gitStatus?.not_added.map((f) => (
                <FileRow key={`n-${f}`} file={f} label="?" color="blue" onClick={() => showDiff(f)} />
              ))}
              {gitStatus?.deleted.map((f) => (
                <FileRow key={`d-${f}`} file={f} label="D" color="red" onClick={() => showDiff(f)} />
              ))}
              {gitStatus?.isClean && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>No changes</div>
              )}
            </div>
          </div>

          {/* Right: Diff / Log */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {gitDiff ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="panel-header">
                  <h2 style={{ fontSize: 13 }}>📝 Diff {diffFile ? `(${diffFile})` : '(all)'}</h2>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 2, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <button
                        className={`btn btn-sm ${diffViewMode === 'unified' ? 'btn-primary' : ''}`}
                        onClick={() => setDiffViewMode('unified')}
                        style={{ borderRadius: 0, fontSize: 11 }}
                      >
                        Unified
                      </button>
                      <button
                        className={`btn btn-sm ${diffViewMode === 'split' ? 'btn-primary' : ''}`}
                        onClick={() => setDiffViewMode('split')}
                        style={{ borderRadius: 0, fontSize: 11 }}
                      >
                        Split
                      </button>
                    </div>
                    <button className="btn btn-sm" onClick={() => { setGitDiff(''); setDiffFile(null) }}>✕ Close</button>
                  </div>
                </div>
                {diffViewMode === 'unified' ? (
                  <SyntaxHighlightedDiff diff={gitDiff} />
                ) : (
                  <SplitDiffView diff={gitDiff} />
                )}
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="panel-header">
                  <h2 style={{ fontSize: 13 }}>📋 History</h2>
                </div>
                <div className="panel-body" style={{ flex: 1, overflowY: 'auto' }}>
                  {gitLog.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>No commits yet</div>
                  ) : (
                    gitLog.map((entry) => (
                      <div key={entry.hash} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{entry.message}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{entry.hash.slice(0, 7)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {entry.author} · {new Date(entry.date).toLocaleDateString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Syntax-highlighted unified diff viewer
function SyntaxHighlightedDiff({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <div style={{ flex: 1, overflow: 'auto', background: '#0d1117' }}>
      {lines.map((line, i) => {
        let bg = 'transparent'
        let color = 'var(--text-secondary)'

        if (line.startsWith('+')) {
          bg = 'rgba(34, 197, 94, 0.12)'
          color = '#4ade80'
        } else if (line.startsWith('-')) {
          bg = 'rgba(239, 68, 68, 0.12)'
          color = '#f87171'
        } else if (line.startsWith('@@')) {
          bg = 'rgba(59, 130, 246, 0.12)'
          color = '#60a5fa'
        } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
          bg = 'var(--bg-tertiary)'
          color = 'var(--text-muted)'
        }

        return (
          <div key={i} style={{
            padding: '1px 16px', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, lineHeight: 1.5, background: bg, color,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            borderLeft: line.startsWith('+') ? '3px solid #4ade80' :
                        line.startsWith('-') ? '3px solid #f87171' :
                        line.startsWith('@') ? '3px solid #60a5fa' : '3px solid transparent',
          }}>
            {line}
          </div>
        )
      })}
    </div>
  )
}

// Split diff view (left: old, right: new)
function SplitDiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  const leftLines: string[] = []
  const rightLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('+')) {
      rightLines.push(line.slice(1))
      leftLines.push('')
    } else if (line.startsWith('-')) {
      leftLines.push(line.slice(1))
      rightLines.push('')
    } else if (line.startsWith(' ')) {
      leftLines.push(line.slice(1))
      rightLines.push(line.slice(1))
    } else if (line.startsWith('@')) {
      leftLines.push(line)
      rightLines.push(line)
    } else {
      leftLines.push(line)
      rightLines.push(line)
    }
  }



  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left: old */}
      <div style={{ flex: 1, overflow: 'auto', background: '#0d1117', borderRight: '1px solid var(--border)' }}>
        {leftLines.map((line, i) => (
          <div key={i} style={{
            padding: '1px 12px', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap',
            color: line.startsWith('-') ? '#f87171' : 'var(--text-secondary)',
            background: line.startsWith('-') ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
            borderLeft: line.startsWith('-') ? '3px solid #f87171' : '3px solid transparent',
          }}>
            {line}
          </div>
        ))}
      </div>
      {/* Right: new */}
      <div style={{ flex: 1, overflow: 'auto', background: '#0d1117' }}>
        {rightLines.map((line, i) => (
          <div key={i} style={{
            padding: '1px 12px', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap',
            color: line.startsWith('+') ? '#4ade80' : 'var(--text-secondary)',
            background: line.startsWith('+') ? 'rgba(34, 197, 94, 0.08)' : 'transparent',
            borderLeft: line.startsWith('+') ? '3px solid #4ade80' : '3px solid transparent',
          }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

function FileRow({ file, label, color, onClick }: { file: string; label: string; color: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <span className={`badge badge-${color}`} style={{ minWidth: 18, textAlign: 'center' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
    </div>
  )
}

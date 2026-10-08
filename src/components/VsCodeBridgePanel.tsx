import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../store'
import type { VsCodeBridgeStatus } from '../../electron/preload'

function fmtTime(value?: number) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, fontSize: 12, alignItems: 'start' }}>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function FileList({ files }: { files: string[] }) {
  if (!files.length) return <span style={{ color: 'var(--text-muted)' }}>None</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {files.slice(0, 18).map((file) => (
        <span key={file} className="badge badge-blue" style={{ borderRadius: 6, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {file}
        </span>
      ))}
      {files.length > 18 && <span className="badge badge-purple">+{files.length - 18}</span>}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: ReactNode; tone?: 'green' | 'yellow' | 'red' | 'blue' }) {
  const color = tone === 'green' ? 'var(--success)' : tone === 'yellow' ? 'var(--warning)' : tone === 'red' ? 'var(--error)' : 'var(--accent)'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--bg-primary)', minWidth: 120 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

export default function VsCodeBridgePanel() {
  const { workspacePath, addTerminalEntry } = useStore()
  const [status, setStatus] = useState<VsCodeBridgeStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionResult, setActionResult] = useState('')

  const refresh = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    const next = await window.api.vscodeStatus(workspacePath)
    setLoading(false)
    if ('error' in next) {
      setActionResult(next.error)
      return
    }
    setStatus(next)
  }, [workspacePath])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 2500)
    return () => window.clearInterval(timer)
  }, [refresh])

  const runTool = async (name: string, args: Record<string, unknown>) => {
    if (!workspacePath) return
    const result = await window.api.toolExecute({ name, args, workspace: workspacePath })
    const text = result.error || result.result || 'Command finished.'
    setActionResult(text)
    addTerminalEntry({ id: `${Date.now()}-vscode`, type: result.error ? 'error' : 'success', content: `${name}: ${text}`, timestamp: Date.now() })
    await refresh()
  }

  const runVsCodeCommand = async (command: string) => {
    await runTool('vscode_command', { command })
  }

  const runSetupAction = async (label: string, action: () => Promise<{ result?: string; error?: string } | void>) => {
    setLoading(true)
    try {
      const result = await action()
      const text = result && typeof result === 'object' && 'error' in result
        ? result.error || `${label} failed.`
        : result && typeof result === 'object' && 'result' in result
          ? result.result || `${label} finished.`
          : `${label} started.`
      setActionResult(text)
      addTerminalEntry({ id: `${Date.now()}-vscode-setup`, type: text.includes('failed') ? 'error' : 'success', content: `${label}: ${text}`, timestamp: Date.now() })
    } catch (err: any) {
      setActionResult(err.message || `${label} failed.`)
    } finally {
      setLoading(false)
      await refresh()
    }
  }

  const connected = !!status?.connected
  const activeFile = status?.state?.activeFile
  const setup = status?.setup
  const ai = status?.state?.ai
  const preview = status?.state?.preview

  if (!workspacePath) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="panel-header"><h2>VS Code Bridge</h2></div>
        <div className="empty-state"><div className="empty-state-text">Open a workspace to use the VS Code bridge.</div></div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <h2>VS Code Bridge</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge ${connected ? 'badge-green' : 'badge-red'}`}>
            {connected ? 'Connected' : 'Not connected'}
          </span>
          <button className="btn btn-sm" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Metric label="Bridge" value={connected ? 'Connected' : 'Offline'} tone={connected ? 'green' : 'red'} />
          <Metric label="AI Model" value={ai?.model || 'Unknown'} tone={ai?.ok ? 'green' : 'yellow'} />
          <Metric label="Index" value={status?.state?.index ? `${status.state.index.files} files` : 'Not built'} tone={status?.state?.index ? 'blue' : 'yellow'} />
          <Metric label="Patch Preview" value={preview ? `${preview.hunks} hunks` : 'None'} tone={preview ? 'yellow' : 'blue'} />
        </section>

        <section className="card" style={{ display: 'grid', gap: 10 }}>
          <Row label="Status" value={status?.message || 'Checking...'} />
          <Row label="Workspace" value={workspacePath} />
          <Row label="Bridge file" value={status?.bridgeFile || ''} />
          <Row label="Pending commands" value={String(status?.commandsPending ?? 0)} />
          <Row label="Last export" value={`${fmtTime(status?.state?.updatedAt)}${status?.ageSeconds == null ? '' : ` (${status.ageSeconds}s ago)`}`} />
          <Row
            label="VS Code index"
            value={status?.state?.index
              ? `${status.state.index.files} files, ${status.state.index.symbols} symbols, ${status.state.index.imports || 0} imports, ${status.state.index.semanticFiles || 0} semantic files, ${fmtTime(status.state.index.updatedAt)}`
              : <span style={{ color: 'var(--text-muted)' }}>Not exported yet</span>}
          />
          <Row
            label="AI status"
            value={ai
              ? `${ai.ok ? 'Ready' : 'Needs attention'} · ${ai.provider} · ${ai.model} · ${ai.message || 'No message'}`
              : <span style={{ color: 'var(--text-muted)' }}>Not exported yet</span>}
          />
          {ai?.inline && (
            <Row label="Inline completions" value={`${ai.inline.ai} AI, ${ai.inline.local} local fallback, ${ai.inline.failed} failed${ai.inline.lastLatencyMs ? `, ${ai.inline.lastLatencyMs}ms last AI` : ''}`} />
          )}
          <Row
            label="Patch preview"
            value={preview
              ? `${preview.file} · ${preview.hunks} hunks · +${preview.additions}/-${preview.deletions}`
              : <span style={{ color: 'var(--text-muted)' }}>None</span>}
          />
        </section>

        <section className="card" style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ fontSize: 13 }}>VS Code Actions</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" disabled={!connected || loading} onClick={() => void runVsCodeCommand('vdAgent.openDashboard')}>
              Dashboard
            </button>
            <button className="btn btn-sm" disabled={!connected || loading} onClick={() => void runVsCodeCommand('vdAgent.rebuildIndex')}>
              Rebuild Index
            </button>
            <button className="btn btn-sm" disabled={!connected || loading} onClick={() => void runVsCodeCommand('vdAgent.processCommands')}>
              Process Commands
            </button>
            <button className="btn btn-sm" disabled={!connected || loading} onClick={() => void runVsCodeCommand('vdAgent.checkAiStatus')}>
              AI Status
            </button>
            <button className="btn btn-sm" disabled={!connected || loading} onClick={() => void runVsCodeCommand('vdAgent.selectAiModel')}>
              Select Model
            </button>
            <button className="btn btn-sm" disabled={!connected || loading || !preview} onClick={() => void runVsCodeCommand('vdAgent.reviewLastPreview')}>
              Review Hunks
            </button>
            <button className="btn btn-sm" disabled={!connected || loading} onClick={() => void runVsCodeCommand('vdAgent.acceptLastPreview')}>
              Accept Preview
            </button>
            <button className="btn btn-sm" disabled={!connected || loading} onClick={() => void runVsCodeCommand('vdAgent.rejectLastPreview')}>
              Reject Preview
            </button>
          </div>
        </section>

        <section className="card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 13 }}>VS Code Setup</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!setup?.vscodeAvailable && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => setup?.downloadUrl && void runSetupAction('Open VS Code Download', () => window.api.openPath(setup.downloadUrl))}
                  disabled={loading || !setup?.downloadUrl}
                >
                  Install VS Code
                </button>
              )}
              {setup?.vscodeAvailable && (
                <button
                  className="btn btn-sm"
                  onClick={() => void runSetupAction('Open Workspace in VS Code', () => window.api.vscodeOpenWorkspace(workspacePath))}
                  disabled={loading}
                >
                  Open Workspace
                </button>
              )}
              {setup?.vscodeAvailable && setup.installReady && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => void runSetupAction('Install VD Agent Bridge', () => window.api.vscodeInstallBridge())}
                  disabled={loading}
                >
                  Install Bridge
                </button>
              )}
            </div>
          </div>
          <Row label="VS Code" value={setup?.vscodeAvailable ? `Found${setup.vscodeVersion ? ` (${setup.vscodeVersion})` : ''}` : 'Not found'} />
          <Row label="CLI" value={setup?.vscodeCommand || <span style={{ color: 'var(--text-muted)' }}>Install VS Code, then refresh</span>} />
          <Row label="Bridge package" value={setup?.installReady ? setup.vsixPath : `${setup?.vsixPath || ''} (missing)`} />
          <Row label="Setup" value={setup?.message || 'Checking VS Code setup...'} />
          <Row
            label="Workspace trust"
            value="Restricted Mode supports active-editor export and local inline autocomplete. Trust the workspace for indexing, terminals, command execution, and edit/apply workflows."
          />
          {setup?.installCommand && <Row label="Manual command" value={<code>{setup.installCommand}</code>} />}
        </section>

        <section className="card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <h3 style={{ fontSize: 13 }}>Editor Context</h3>
            <button
              className="btn btn-sm"
              disabled={!activeFile}
              onClick={() => activeFile && void runTool('vscode_open', { path: activeFile })}
            >
              Open Active File
            </button>
          </div>
          <Row label="Active file" value={activeFile || <span style={{ color: 'var(--text-muted)' }}>None</span>} />
          <Row label="Language" value={status?.state?.activeLanguage || 'Unknown'} />
          <Row label="Visible files" value={<FileList files={status?.state?.visibleFiles || []} />} />
          <Row label="Open files" value={<FileList files={status?.state?.openFiles || []} />} />
          {status?.state?.selection?.text && (
            <Row
              label={`Selection ${status.state.selection.startLine}:${status.state.selection.startColumn}`}
              value={(
                <pre style={{
                  margin: 0,
                  padding: 10,
                  maxHeight: 180,
                  overflow: 'auto',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                  fontSize: 12,
                }}>
                  {status.state.selection.text}
                </pre>
              )}
            />
          )}
        </section>

        <section className="card" style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ fontSize: 13 }}>Last Command</h3>
          {status?.lastResult ? (
            <>
              <Row label="Result" value={<span className={`badge ${status.lastResult.ok ? 'badge-green' : 'badge-red'}`}>{status.lastResult.ok ? 'OK' : 'Failed'}</span>} />
              <Row label="Action" value={status.lastResult.action || 'Unknown'} />
              <Row label="Time" value={fmtTime(status.lastResult.updatedAt)} />
              <Row label="Message" value={status.lastResult.message || 'No message'} />
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No command result yet.</div>
          )}
          {actionResult && (
            <pre style={{
              margin: 0,
              padding: 10,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              whiteSpace: 'pre-wrap',
              fontSize: 12,
            }}>
              {actionResult}
            </pre>
          )}
        </section>

        <section className="card" style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ fontSize: 13 }}>How It Works</h3>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Install the local bridge, open this same workspace in VS Code, then run `VD Agent: Export Workspace Context`.
            The agent can then read active editor context and send open/edit/diff commands through the bridge.
          </div>
        </section>
      </div>
    </div>
  )
}

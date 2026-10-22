import { useCallback, useEffect, useState } from 'react'

type DiagnosticsPayload = Awaited<ReturnType<typeof window.api.readDiagnostics>>

export default function HelpPanel() {
  const [payload, setPayload] = useState<DiagnosticsPayload | null>(null)
  const [message, setMessage] = useState('Loading diagnostics…')

  const loadDiagnostics = useCallback(async () => {
    setMessage('Loading diagnostics…')
    try {
      const next = await window.api.readDiagnostics()
      setPayload(next)
      setMessage('')
    } catch (error: any) {
      setPayload(null)
      setMessage(`Diagnostics unavailable: ${error?.message || String(error)}`)
    }
  }, [])

  useEffect(() => { void loadDiagnostics() }, [loadDiagnostics])

  const copyDiagnostics = async () => {
    if (!payload) return
    try {
      const result = await window.api.copyDiagnostics(payload.reportText)
      if (!result.success) throw new Error(result.error || 'Clipboard is unavailable.')
      setMessage('Diagnostics copied to the clipboard.')
    } catch (error: any) {
      setMessage(`Copy failed: ${error?.message || String(error)}`)
    }
  }

  const lines = (payload?.lines || []).slice(-200)
  const application = payload?.report.application
  const settings = payload?.report.settings

  return (
    <section aria-label="Help > Diagnostics" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>Help</h1>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Diagnostics</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => { void loadDiagnostics() }}>Refresh</button>
          <button className="btn btn-sm btn-primary" disabled={!payload} onClick={() => { void copyDiagnostics() }}>Copy diagnostics</button>
        </div>
      </div>

      {application && (
        <div className="card" style={{ padding: 12, marginBottom: 16, fontSize: 12 }}>
          <strong>{application.name} {application.version}</strong>
          <span style={{ color: 'var(--text-muted)', marginLeft: 10 }}>
            {application.platform} · {application.osRelease} · {application.architecture}
          </span>
        </div>
      )}

      {payload && (
        <details open style={{ marginBottom: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Non-secret settings</summary>
          <pre style={{ margin: '8px 0 0', padding: 12, border: '1px solid var(--border)', borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 11 }}>
            {JSON.stringify(settings || {}, null, 2)}
          </pre>
        </details>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Last {lines.length} redacted log line{lines.length === 1 ? '' : 's'} (maximum 200). Credentials, headers, cookies, and provider keys are excluded.
      </div>
      <pre
        aria-label="Diagnostics log"
        style={{ minHeight: 240, maxHeight: 560, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-alt)', fontFamily: 'monospace', fontSize: 11 }}
      >{lines.length ? lines.join('\n') : 'No diagnostic events recorded.'}</pre>
      {message && <div role="status" style={{ marginTop: 10, fontSize: 12, color: message.includes('failed') || message.includes('unavailable') ? 'var(--error)' : 'var(--text-muted)' }}>{message}</div>}
    </section>
  )
}

import { useState } from 'react'
import { useStore } from '../store'

export default function SurfaceSwitch() {
  const isIdeWindow = window.api.windowRole === 'ide'
  const [surface] = useState<"agent" | "code">(isIdeWindow ? 'code' : 'agent')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)

  const selectSurface = async (next: "agent" | "code") => {
    setStatus(null)
    setBusy(true)
    try {
      if (next === 'code') {
        const response = await window.api.openIdeWindow()
        setStatus({ kind: 'success', text: response.created ? 'IDE window opened.' : 'IDE window focused.' })
        return
      }
      if (isIdeWindow) {
        const response = await window.api.focusMainWindow()
        setStatus(response.success ? { kind: 'success', text: 'Agent window focused.' } : { kind: 'error', text: response.error || 'Agent window is not available.' })
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setStatus({ kind: 'error', text })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="surface-switch-wrap">
      <div className="surface-switch" role="group" aria-label="Application surface">
        <button className={surface === "agent" ? "active" : ""} disabled={busy} onClick={() => { void selectSurface("agent") }}>Agent</button>
        <button className={surface === "code" ? "active" : ""} disabled={busy} onClick={() => { void selectSurface("code") }}>Code</button>
      </div>
      {status && <div className={`surface-status ${status.kind}`} role="status" aria-live="polite">
        <span>{status.text}</span>
      </div>}
    </div>
  )
}

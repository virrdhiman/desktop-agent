import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { mergeLayoutPreferences } from '../lib/layoutPersistence'

export default function SurfaceSwitch() {
  const workspacePath = useStore((state) => state.workspacePath)
  const setWorkspacePath = useStore((state) => state.setWorkspacePath)
  const settings = useStore((state) => state.settings)
  const setSettings = useStore((state) => state.setSettings)
  const [surface, setSurface] = useState<"agent" | "code">(settings.layout?.surface || "agent")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)
  useEffect(() => { setSurface(settings.layout?.surface || "agent") }, [settings.layout?.surface])

  const persistSurface = (next: "agent" | "code") => {
    setSurface(next)
    const updated = { ...settings, layout: mergeLayoutPreferences(settings.layout, { surface: next }) }
    setSettings(updated)
    void window.api.saveSettings(updated)
  }

  const openWorkspaceInCode = async (workspace: string) => {
    setBusy(true)
    setStatus(null)
    try {
      const response = await window.api.vscodeOpenWorkspace(workspace)
      if (response.error) {
        setSurface('agent')
        const hint = /not found|not installed|cli/i.test(response.error)
          ? ' Install VS Code, then ensure the code command is available.'
          : ''
        setStatus({ kind: 'error', text: `${response.error}${hint}` })
        return
      }
      persistSurface('code')
      setStatus({ kind: 'success', text: response.result || `Opened ${workspace} in VS Code.` })
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setSurface('agent')
      setStatus({ kind: 'error', text: `${text} Install VS Code if it is not available.` })
    } finally {
      setBusy(false)
    }
  }

  const selectSurface = (next: "agent" | "code") => {
    if (next === 'agent') {
      persistSurface(next)
      setStatus(null)
      return
    }
    if (!workspacePath) {
      setSurface('agent')
      setStatus({ kind: 'info', text: 'Open a workspace folder first to use VS Code.' })
      return
    }
    void openWorkspaceInCode(workspacePath)
  }

  const openFolderFirst = async () => {
    const folder = await window.api.openDirectory()
    if (!folder) return
    setWorkspacePath(folder)
    await openWorkspaceInCode(folder)
  }

  return (
    <div className="surface-switch-wrap">
      <div className="surface-switch" role="group" aria-label="Application surface">
      <button className={surface === "agent" ? "active" : ""} onClick={() => selectSurface("agent")}>Agent</button>
        <button className={surface === "code" ? "active" : ""} disabled={busy} onClick={() => selectSurface("code")}>Code (VS Code)</button>
      </div>
      {status && <div className={`surface-status ${status.kind}`} role="status" aria-live="polite">
        <span>{status.text}</span>
        {status.kind === 'info' && <button onClick={() => { void openFolderFirst() }}>Open folder</button>}
      </div>}
    </div>
  )
}

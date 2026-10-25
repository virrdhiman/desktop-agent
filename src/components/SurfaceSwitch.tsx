import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { mergeLayoutPreferences } from '../lib/layoutPersistence'

export default function SurfaceSwitch() {
  const workspacePath = useStore((state) => state.workspacePath)
  const settings = useStore((state) => state.settings)
  const setSettings = useStore((state) => state.setSettings)
  const [surface, setSurface] = useState<"agent" | "code">(settings.layout?.surface || "agent")
  useEffect(() => { setSurface(settings.layout?.surface || "agent") }, [settings.layout?.surface])
  const selectSurface = (next: "agent" | "code") => {
    setSurface(next)
    const updated = { ...settings, layout: mergeLayoutPreferences(settings.layout, { surface: next }) }
    setSettings(updated)
    void window.api.saveSettings(updated)
    if (next === "code" && workspacePath) void window.api.vscodeOpenWorkspace(workspacePath)
  }
  return (
    <div className="surface-switch" role="group" aria-label="Application surface">
      <button className={surface === "agent" ? "active" : ""} onClick={() => selectSurface("agent")}>Agent</button>
      <button className={surface === "code" ? "active" : ""} onClick={() => selectSurface("code")}>Code (VS Code)</button>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

type MenuAction = { label: string; action: () => void }
type AppMenuBarProps = {
  onNewChat: () => void
  onOpenFolder: () => void
  onCommandPalette: () => void
  onToggleSidebar: () => void
  onToggleTerminal: () => void
  onSettings: () => void
  onHelp: () => void
}

export default function AppMenuBar(props: AppMenuBarProps) {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLElement>(null)
  const menus: Record<string, MenuAction[]> = {
    File: [{ label: 'New chat', action: props.onNewChat }, { label: 'Open folder…', action: props.onOpenFolder }],
    Edit: [{ label: 'Command palette', action: props.onCommandPalette }, { label: 'Keyboard shortcuts', action: props.onHelp }],
    View: [{ label: 'Toggle sidebar', action: props.onToggleSidebar }, { label: 'Toggle terminal', action: props.onToggleTerminal }],
    Help: [{ label: 'Documentation & diagnostics', action: props.onHelp }, { label: 'Settings', action: props.onSettings }],
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(null) }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const run = (action: () => void) => { setOpen(null); action() }

  return (
    <nav ref={ref} className="top-menus" role="menubar" aria-label="Application menu">
      {Object.entries(menus).map(([label, actions]) => <div className="vd-app-menu" key={label}>
        <button role="menuitem" aria-haspopup="menu" aria-expanded={open === label} onClick={() => setOpen((current) => current === label ? null : label)}>{label}</button>
        {open === label && <div className="vd-app-menu-popup" role="menu" aria-label={`${label} menu`}>
          {actions.map((item) => <button key={item.label} role="menuitem" onClick={() => run(item.action)}>{item.label}</button>)}
        </div>}
      </div>)}
    </nav>
  )
}

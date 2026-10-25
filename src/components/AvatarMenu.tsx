import { useEffect, useRef, useState } from 'react'

type AvatarMenuProps = { onSettings: () => void; onHelp: () => void; onShortcuts: () => void }

export default function AvatarMenu({ onSettings, onHelp, onShortcuts }: AvatarMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [])]
      if (items.length === 0) return
      event.preventDefault()
      const current = items.indexOf(document.activeElement as HTMLElement)
      const next = event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length
      items[next].focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])
  return (
    <div className="vd-avatar-wrap">
      <button ref={triggerRef} className="vd-avatar" aria-label="Open account menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>VD</button>
      {open && <>
        <button className="vd-menu-backdrop" aria-label="Close account menu" onClick={() => setOpen(false)} />
        <div ref={menuRef} className="vd-avatar-menu" role="menu" aria-label="Account menu">
          <button role="menuitem" onClick={() => { setOpen(false); onSettings() }}>⚙ Settings <kbd>Ctrl+,</kbd></button>
          <button role="menuitem" onClick={() => { setOpen(false); onHelp() }}>▣ Docs</button>
          <button role="menuitem" onClick={() => { setOpen(false); onShortcuts() }}>⌨ Shortcuts</button>
          <button role="menuitem" disabled title="No account yet">⇥ Log Out <span className="vd-menu-note">no account yet</span></button>
        </div>
      </>}
    </div>
  )
}

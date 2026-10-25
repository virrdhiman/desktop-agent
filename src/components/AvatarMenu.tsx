import { useState } from 'react'

type AvatarMenuProps = { onSettings: () => void; onHelp: () => void; onShortcuts: () => void }

export default function AvatarMenu({ onSettings, onHelp, onShortcuts }: AvatarMenuProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="vd-avatar-wrap">
      <button className="vd-avatar" aria-label="Open account menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>VD</button>
      {open && <>
        <button className="vd-menu-backdrop" aria-label="Close account menu" onClick={() => setOpen(false)} />
        <div className="vd-avatar-menu" role="menu" aria-label="Account menu">
          <button role="menuitem" onClick={() => { setOpen(false); onSettings() }}>⚙ Settings <kbd>Ctrl+,</kbd></button>
          <button role="menuitem" onClick={() => { setOpen(false); onHelp() }}>▣ Docs</button>
          <button role="menuitem" onClick={() => { setOpen(false); onShortcuts() }}>⌨ Shortcuts</button>
          <button role="menuitem" disabled title="No account yet">⇥ Log Out <span className="vd-menu-note">no account yet</span></button>
        </div>
      </>}
    </div>
  )
}

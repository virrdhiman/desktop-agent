import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Settings } from '../types'
import type { WorkingMode } from '../lib/layoutPersistence'

const MODES: Array<[WorkingMode, string]> = [['plan', 'Plan'], ['build', 'Build'], ['multitask', 'Multitask'], ['ask', 'Ask'], ['review', 'Review'], ['debug', 'Debug']]

export default function WorkingModeSelector({ settings, onChange }: { settings: Settings; onChange: (settings: Settings) => void }) {
  const value = settings.layout?.workingMode || (settings.planMode ? 'plan' : 'build')
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const currentLabel = MODES.find(([id]) => id === value)?.[1] || 'Build'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const choose = (workingMode: WorkingMode) => {
    const readOnly = workingMode === 'plan' || workingMode === 'ask' || workingMode === 'review'
    onChange({
      ...settings,
      planMode: readOnly,
      teamMode: workingMode === 'multitask' ? 'always' : settings.teamMode,
      layout: { ...(settings.layout || {}), version: 1, workingMode } as Settings['layout'],
    })
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const index = MODES.findIndex(([id]) => id === value)
      const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + MODES.length) % MODES.length
      choose(MODES[next][0])
    }
  }

  return (
    <div className="vd-working-mode" ref={menuRef}>
      <button className="vd-composer-chip" aria-haspopup="menu" aria-expanded={open} aria-label="Working mode" onClick={() => setOpen((current) => !current)} onKeyDown={onKeyDown} title="Working mode; Plan, Ask, and Review are read-only">
        ◈ {currentLabel} <span className="vd-chip-chevron">⌃</span>
      </button>
      {open && <div className="vd-working-mode-menu" role="menu" aria-label="Working modes">
        {MODES.map(([id, label]) => <button key={id} role="menuitem" className={id === value ? 'active' : ''} onClick={() => choose(id)}>
          <span>{label}</span><small>{id === 'multitask' ? 'Parallel team execution' : id === 'build' || id === 'debug' ? 'Write-capable' : 'Read-only until approved'}</small>
        </button>)}
      </div>}
    </div>
  )
}

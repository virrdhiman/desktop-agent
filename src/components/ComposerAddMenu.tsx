import { useEffect, useRef, useState } from 'react'
import type { FileEntry, Settings } from '../types'

type ComposerAddMenuProps = {
  input: string
  workspacePath: string
  allFiles: FileEntry[]
  settings: Settings
  planMode: boolean
  onInput: (value: string) => void
  onSettings: (settings: Settings) => void
  onPlanMode: (enabled: boolean) => void
}

type AddItem = { id: string; label: string; detail: string; icon: string; section: 'Add' | 'Tools'; action: () => void }

function isAllowedPath(path: string, workspacePath: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  if (/\/(\.env[^/]*|[^/]*key[^/]*|[^/]*\.pem)$/.test(normalized)) return false
  if (normalized.includes('/pit/')) return false
  if (!workspacePath) return true
  const root = workspacePath.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
  return normalized === root || normalized.startsWith(`${root}/`)
}

export default function ComposerAddMenu({ input, workspacePath, allFiles, settings, planMode, onInput, onSettings, onPlanMode }: ComposerAddMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const hasSlashTrigger = input.startsWith('/')

  useEffect(() => { if (hasSlashTrigger) setOpen(true) }, [hasSlashTrigger])
  useEffect(() => { if (open) setActiveIndex(0) }, [open, query])

  const insertHint = (hint: string) => {
    const separator = input && !/\s$/.test(input) ? ' ' : ''
    onInput(`${input}${separator}${hint} `)
    setOpen(false)
  }

  const attachPicked = (files: FileList | null) => {
    if (!files) return
    const picked = [...files].map((file) => {
      const candidate = (file as File & { path?: string }).path || file.name
      return isAllowedPath(candidate, workspacePath) ? candidate : null
    }).filter((path): path is string => Boolean(path)).slice(0, 20)
    if (picked.length > 0) insertHint(`Attached context: ${picked.join(', ')}`)
  }

  const items: AddItem[] = [
    { id: 'files', label: 'Files and folders', detail: 'Attach workspace context', icon: '📎', section: 'Add', action: () => fileInput.current?.click() },
    { id: 'goal', label: 'Goal', detail: settings.goal ? 'Update persistent goal' : 'Keep a goal above the chat', icon: '◎', section: 'Add', action: () => { const goal = window.prompt('Workspace goal', settings.goal || '')?.trim(); if (goal) onSettings({ ...settings, goal }); else if (goal === '') onSettings({ ...settings, goal: '' }); setOpen(false) } },
    { id: 'plan', label: 'Plan mode', detail: planMode ? 'On · waits before tools' : 'Propose before acting', icon: '☷', section: 'Add', action: () => { onPlanMode(!planMode); setOpen(false) } },
    { id: 'code-review', label: 'Code review', detail: 'Review a workspace file', icon: '⌕', section: 'Tools', action: () => insertHint('[Capability: code review]') },
    { id: 'pdf', label: 'PDF extraction', detail: 'Read text from a workspace PDF', icon: '▤', section: 'Tools', action: () => insertHint('[Capability: PDF extraction]') },
    { id: 'spreadsheet', label: 'Spreadsheets', detail: 'Read or write approved workspace sheets', icon: '▦', section: 'Tools', action: () => insertHint('[Capability: spreadsheets]') },
    { id: 'ocr', label: 'OCR image', detail: 'Read text from a workspace image', icon: '▧', section: 'Tools', action: () => insertHint('[Capability: OCR image]') },
    ...(settings.browserToolEnabled ? [{ id: 'browser', label: 'Browser', detail: 'Use the opt-in browser tool', icon: '◉', section: 'Tools' as const, action: () => insertHint('[Capability: browser]') }] : []),
  ]
  const filtered = items.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(query.toLowerCase()))

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (filtered.length) setActiveIndex((value) => (value + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length); return }
    if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); filtered[activeIndex].action() }
  }

  return (
    <div className="vd-add-menu-wrap">
      <input ref={fileInput} type="file" multiple hidden onChange={(event) => attachPicked(event.target.files)} />
      <input ref={folderInput} type="file" hidden onChange={(event) => attachPicked(event.target.files)} />
      <button className="vd-add-button" aria-label="Add context or capability" aria-haspopup="menu" aria-expanded={open} title="Add context, goal, plan mode, or tools" onClick={() => setOpen((value) => !value)}>＋</button>
      {open && <div ref={menuRef} className="vd-add-menu" role="menu" aria-label="Add to composer" onKeyDown={handleKeyDown}>
        <div className="vd-add-search"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter actions…" aria-label="Filter add actions" /></div>
        {(['Add', 'Tools'] as const).map((section) => <div key={section} className="vd-add-section">
          <div className="vd-add-section-label">{section}</div>
          {filtered.filter((item) => item.section === section).map((item) => {
            const index = filtered.indexOf(item)
            return <button key={item.id} role="menuitem" tabIndex={index === activeIndex ? 0 : -1} className={`vd-add-item ${index === activeIndex ? 'active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={item.action}><span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>
          })}
        </div>)}
        <div className="vd-add-hint">↑↓ navigate · Enter select · Esc close</div>
      </div>}
    </div>
  )
}

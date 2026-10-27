import { useEffect, useRef, useState } from 'react'
import type { FileEntry, Settings } from '../types'
import type { ComposerMenuItem } from '../lib/composerAddMenu'

type ComposerAddMenuProps = {
  items: ComposerMenuItem[]
  query: string
  activeIndex: number
  onQueryChange: (query: string) => void
  onMove: (delta: number) => void
  onSelect: (item: ComposerMenuItem) => void
  onClose: () => void
}

type LegacyComposerAddMenuProps = {
  input: string
  workspacePath: string
  allFiles: FileEntry[]
  settings: Settings
  planMode: boolean
  onInput: (value: string) => void
  onSettings: (settings: Settings) => void
  onPlanMode: (enabled: boolean) => void
}

type Props = ComposerAddMenuProps | LegacyComposerAddMenuProps

function isLegacyProps(props: Props): props is LegacyComposerAddMenuProps {
  return 'input' in props
}

export default function ComposerAddMenu(props: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [legacyOpen, setLegacyOpen] = useState(() => isLegacyProps(props) && props.input.startsWith('/'))
  const [legacyQuery, setLegacyQuery] = useState('')
  const [legacyActiveIndex, setLegacyActiveIndex] = useState(0)

  useEffect(() => {
    menuRef.current?.focus()
  }, [legacyOpen])

  if (isLegacyProps(props)) {
    const { input, settings, planMode, onInput, onSettings, onPlanMode } = props
    const legacyItems = [
      { id: 'files', label: 'Files and folders', detail: 'Attach workspace context', icon: '📎', action: () => setLegacyOpen(false) },
      { id: 'goal', label: 'Goal', detail: settings.goal ? 'Update persistent goal' : 'Keep a goal above the chat', icon: '◎', action: () => { const goal = window.prompt('Workspace goal', settings.goal || '')?.trim(); if (goal !== undefined) onSettings({ ...settings, goal }); setLegacyOpen(false) } },
      { id: 'plan', label: 'Plan mode', detail: planMode ? 'On · waits before tools' : 'Propose before acting', icon: '☷', action: () => { onPlanMode(!planMode); setLegacyOpen(false) } },
      { id: 'code-review', label: 'Code review', detail: 'Review a workspace file', icon: '⌕', action: () => { onInput(`${input}${input && !/\s$/.test(input) ? ' ' : ''}[Capability: code review] `); setLegacyOpen(false) } },
      ...(settings.pdfToolEnabled ? [{ id: 'pdf', label: 'PDF extraction', detail: 'Read text from a workspace PDF', icon: '▤', action: () => { onInput(`${input}${input && !/\s$/.test(input) ? ' ' : ''}[Capability: PDF extraction] `); setLegacyOpen(false) } }] : []),
      ...(settings.spreadsheetToolEnabled ? [{ id: 'spreadsheet', label: 'Spreadsheets', detail: 'Read or write approved workspace sheets', icon: '▦', action: () => { onInput(`${input}${input && !/\s$/.test(input) ? ' ' : ''}[Capability: spreadsheets] `); setLegacyOpen(false) } }] : []),
      ...(settings.ocrToolEnabled ? [{ id: 'ocr', label: 'OCR image', detail: 'Read text from a workspace image', icon: '▧', action: () => { onInput(`${input}${input && !/\s$/.test(input) ? ' ' : ''}[Capability: OCR image] `); setLegacyOpen(false) } }] : []),
      ...(settings.browserToolEnabled ? [{ id: 'browser', label: 'Browser', detail: 'Use the opt-in browser tool', icon: '◉', action: () => { onInput(`${input}${input && !/\s$/.test(input) ? ' ' : ''}[Capability: browser] `); setLegacyOpen(false) } }] : []),
    ]
    const filtered = legacyItems.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(legacyQuery.toLowerCase()))
    const onLegacyKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') { event.preventDefault(); setLegacyOpen(false) }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (filtered.length) setLegacyActiveIndex((value) => (value + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length) }
      else if (event.key === 'Enter' && filtered[legacyActiveIndex]) { event.preventDefault(); filtered[legacyActiveIndex].action() }
    }
    return (
      <div className="vd-add-menu-wrap">
        <button className="vd-add-button" aria-label="Add context or capability" aria-haspopup="menu" aria-expanded={legacyOpen} title="Add context, goal, plan mode, or tools" onClick={() => setLegacyOpen((value) => !value)}>＋</button>
        {legacyOpen && <div ref={menuRef} className="vd-add-menu" role="menu" aria-label="Add to composer" onKeyDown={onLegacyKeyDown}>
          <div className="vd-add-search"><input autoFocus value={legacyQuery} onChange={(event) => { setLegacyQuery(event.target.value); setLegacyActiveIndex(0) }} placeholder="Filter actions…" aria-label="Filter add actions" /></div>
          {(['Add', 'Tools'] as const).map((section) => <div key={section} className="vd-add-section"><div className="vd-add-section-label">{section}</div>{filtered.filter((item) => section === 'Add' ? ['files', 'goal', 'plan'].includes(item.id) : !['files', 'goal', 'plan'].includes(item.id)).map((item) => { const index = filtered.indexOf(item); return <button key={item.id} role="menuitem" className={`vd-add-item ${index === legacyActiveIndex ? 'active' : ''}`} onClick={item.action}><span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></button> })}</div>)}
        </div>}
      </div>
    )
  }

  const { items, query, activeIndex, onQueryChange, onMove, onSelect, onClose } = props

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      onMove(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      onMove(-1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[activeIndex]
      if (item) onSelect(item)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      onMove(event.shiftKey ? -1 : 1)
      return
    }
    if (event.key === 'Backspace') {
      event.preventDefault()
      onQueryChange(query.slice(0, -1))
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      onQueryChange(`${query}${event.key}`)
    }
  }

  let lastSection = ''
  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={0}
      aria-label="Add to chat"
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute', bottom: '100%', left: 14, width: 360, maxWidth: 'calc(100% - 28px)',
        maxHeight: 320, overflowY: 'auto', marginBottom: 6, padding: 5,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 -8px 24px rgba(0,0,0,0.24)', zIndex: 120, outline: 'none',
      }}
    >
      <div style={{ padding: '6px 9px 5px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
        {query ? `Filter: ${query}` : 'Add to this request'}
      </div>
      {items.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>No matching capabilities.</div>}
      {items.map((item, index) => {
        const section = item.section === 'add' ? 'Add' : 'Tools'
        const heading = section !== lastSection
        lastSection = section
        return (
          <div key={item.id}>
            {heading && <div style={{ padding: '8px 9px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{section}</div>}
            <div
              id={`composer-menu-${item.id}`}
              role="menuitem"
              aria-selected={index === activeIndex}
              onMouseEnter={() => onMove(index - activeIndex)}
              onClick={() => onSelect(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 7,
                cursor: 'pointer', background: index === activeIndex ? 'var(--bg-tertiary)' : 'transparent',
              }}
            >
              <span aria-hidden="true" style={{ width: 22, textAlign: 'center', fontSize: 16 }}>{item.icon}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-primary)' }}>{item.label}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-muted)' }}>{item.description}</span>
              </span>
              {item.section === 'tools' && <span aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: 11 }}>↵</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

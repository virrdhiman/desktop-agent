import { useEffect, useRef } from 'react'
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

export default function ComposerAddMenu({
  items, query, activeIndex, onQueryChange, onMove, onSelect, onClose,
}: ComposerAddMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    menuRef.current?.focus()
  }, [])

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

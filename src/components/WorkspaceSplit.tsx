/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export const MIN_SPLIT_PERCENT = 25
export const MAX_SPLIT_PERCENT = 75
export const DEFAULT_SPLIT_PERCENT = 40

export function clampSplitPercent(value: number): number {
  return Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, value))
}

type WorkspaceSplitProps = {
  primary: ReactNode
  secondary: ReactNode
  primaryLabel?: string
  secondaryLabel?: string
}

function isStackedViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 900px)').matches
    : false
}

/**
 * Resizable chat/editor surface. The separator is both pointer-draggable and
 * keyboard-operable, while CSS stacks the panes on narrow windows.
 */
export default function WorkspaceSplit({
  primary,
  secondary,
  primaryLabel = 'Chat pane',
  secondaryLabel = 'Editor pane',
}: WorkspaceSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT_PERCENT)
  const [stacked, setStacked] = useState(isStackedViewport)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 900px)')
    const update = () => setStacked(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  const setFromPointer = useCallback((clientX: number, clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    const position = stacked ? clientY - bounds.top : clientX - bounds.left
    const total = stacked ? bounds.height : bounds.width
    if (total <= 0) return
    setSplitPercent(clampSplitPercent((position / total) * 100))
  }, [stacked])

  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent) => setFromPointer(event.clientX, event.clientY)
    const stop = () => {
      setDragging(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [dragging, setFromPointer])

  const adjustBy = (amount: number) => setSplitPercent((current) => clampSplitPercent(current + amount))
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const increase = stacked ? event.key === 'ArrowDown' : event.key === 'ArrowRight'
    const decrease = stacked ? event.key === 'ArrowUp' : event.key === 'ArrowLeft'
    if (increase || decrease || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (event.key === 'Home') setSplitPercent(MIN_SPLIT_PERCENT)
      else if (event.key === 'End') setSplitPercent(MAX_SPLIT_PERCENT)
      else adjustBy(increase ? 5 : -5)
    }
  }

  return (
    <div ref={containerRef} className="workspace-split" style={{ '--workspace-split': `${splitPercent}%` } as React.CSSProperties}>
      <section className="workspace-pane workspace-pane-primary" aria-label={primaryLabel}>
        {primary}
      </section>
      <button
        type="button"
        className="workspace-split-handle"
        role="separator"
        aria-orientation={stacked ? 'horizontal' : 'vertical'}
        aria-label="Resize chat and editor panes"
        aria-valuemin={MIN_SPLIT_PERCENT}
        aria-valuemax={MAX_SPLIT_PERCENT}
        aria-valuenow={Math.round(splitPercent)}
        aria-valuetext={`${Math.round(splitPercent)}% chat, ${Math.round(100 - splitPercent)}% editor`}
        onPointerDown={(event) => {
          event.preventDefault()
          setDragging(true)
          setFromPointer(event.clientX, event.clientY)
        }}
        onKeyDown={handleKeyDown}
      >
        <span aria-hidden="true" />
      </button>
      <section className="workspace-pane workspace-pane-secondary" aria-label={secondaryLabel}>
        {secondary}
      </section>
    </div>
  )
}

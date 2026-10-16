/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WorkspaceSplit, {
  DEFAULT_SPLIT_PERCENT,
  MAX_SPLIT_PERCENT,
  MIN_SPLIT_PERCENT,
  clampSplitPercent,
} from './WorkspaceSplit'

describe('WorkspaceSplit', () => {
  it('clamps split values to usable pane bounds', () => {
    expect(clampSplitPercent(MIN_SPLIT_PERCENT - 1)).toBe(MIN_SPLIT_PERCENT)
    expect(clampSplitPercent(MAX_SPLIT_PERCENT + 1)).toBe(MAX_SPLIT_PERCENT)
    expect(clampSplitPercent(50)).toBe(50)
  })

  it('exposes an accessible separator and adjusts it with keyboard controls', () => {
    render(<WorkspaceSplit primary={<div>Chat</div>} secondary={<div>Editor</div>} />)

    expect(screen.getByRole('region', { name: 'Chat pane' })).toHaveTextContent('Chat')
    expect(screen.getByRole('region', { name: 'Editor pane' })).toHaveTextContent('Editor')
    const separator = screen.getByRole('separator')
    expect(separator).toHaveAttribute('aria-valuenow', String(DEFAULT_SPLIT_PERCENT))

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow', String(DEFAULT_SPLIT_PERCENT + 5))
    fireEvent.keyDown(separator, { key: 'Home' })
    expect(separator).toHaveAttribute('aria-valuenow', String(MIN_SPLIT_PERCENT))
    fireEvent.keyDown(separator, { key: 'End' })
    expect(separator).toHaveAttribute('aria-valuenow', String(MAX_SPLIT_PERCENT))
  })
})

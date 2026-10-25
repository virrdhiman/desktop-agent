import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYOUT_PREFERENCES } from '../lib/layoutPersistence'
import RightToolPanel from './RightToolPanel'

vi.mock('./FileBrowser', () => ({ default: () => <div>files content</div> }))
vi.mock('./GitPanel', () => ({ default: () => <div>changes content</div> }))
vi.mock('./MultiTerminal', () => ({ default: () => <div>terminal content</div> }))
vi.mock('./SearchResults', () => ({ default: () => <div>browser content</div> }))
vi.mock('./TaskPanel', () => ({ default: () => <div>tasks content</div> }))
vi.mock('./VsCodeBridgePanel', () => ({ default: () => <div>vscode content</div> }))

describe('right tool panel', () => {
  it('switches tabs and exposes the collapse action', () => {
    const onTab = vi.fn()
    const onCollapse = vi.fn()
    render(<RightToolPanel tab={DEFAULT_LAYOUT_PREFERENCES.rightPanelTab} width={340} onTab={onTab} onCollapse={onCollapse} onResizeStart={vi.fn()} />)
    expect(screen.getByText('terminal content')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    expect(onTab).toHaveBeenCalledWith('files')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse right tools' }))
    expect(onCollapse).toHaveBeenCalledOnce()
  })
})

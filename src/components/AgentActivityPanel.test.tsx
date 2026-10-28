import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AgentActivityPanel from './AgentActivityPanel'
import type { AgentActivityRun } from '../lib/agentActivity'

const run: AgentActivityRun = {
  id: 'panel-run', startedAt: 100, updatedAt: 2_100, status: 'done', durationMs: 2_000,
  steps: [
    { id: 's1', kind: 'status', label: 'Request started', status: 'done', startedAt: 100, finishedAt: 100, durationMs: 0 },
    { id: 's2', kind: 'tool', label: 'Reading src/app.tsx', toolName: 'read_file', status: 'done', startedAt: 200, finishedAt: 500, durationMs: 300, details: 'File read.' },
    { id: 's3', kind: 'file', label: 'File edited', status: 'done', startedAt: 600, finishedAt: 600, filePath: 'src/app.tsx', addedLines: 2, removedLines: 1 },
  ],
}

describe('AgentActivityPanel', () => {
  it('shows elapsed time, collapsible details and opens an edited file in Code', () => {
    const onOpenFile = vi.fn()
    render(<AgentActivityPanel run={run} onOpenFile={onOpenFile} />)
    expect(screen.getByText('Worked for 2s, 2 steps')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Reading src/app.tsx'))
    expect(screen.getByText('File read.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open src/app.tsx in Code' }))
    expect(onOpenFile).toHaveBeenCalledWith('src/app.tsx')
  })

  it('renders long runs with a bounded scroll region', () => {
    const largeRun = { ...run, steps: Array.from({ length: 120 }, (_, index) => ({
      id: `step-${index}`, kind: 'tool' as const, label: `Step ${index}`, status: 'done' as const, startedAt: index, finishedAt: index + 1,
    })) }
    const { container } = render(<AgentActivityPanel run={largeRun} />)
    expect(container.querySelectorAll('.vd-agent-activity-step')).toHaveLength(120)
    expect(container.querySelector('[aria-live="off"]')).toHaveStyle({ maxHeight: '210px', overflow: 'auto' })
  })
})

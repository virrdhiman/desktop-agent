import { useEffect, useState } from 'react'
import type { AgentActivityRun, AgentActivityStep } from '../lib/agentActivity'

interface Props {
  run: AgentActivityRun
  answerStreaming?: boolean
  onOpenFile?: (path: string) => void
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`
}

function stepMark(step: AgentActivityStep): string {
  if (step.status === 'running') return '◌'
  if (step.status === 'error') return '×'
  if (step.status === 'cancelled') return '–'
  return '✓'
}

export default function AgentActivityPanel({ run, answerStreaming = false, onOpenFile }: Props) {
  const [expanded, setExpanded] = useState(run.status === 'running')
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (run.status !== 'running') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [run.status])
  useEffect(() => {
    if (answerStreaming) setExpanded(false)
  }, [answerStreaming])

  const elapsed = formatElapsed(run.durationMs ?? (run.status === 'running' ? now - run.startedAt : run.updatedAt - run.startedAt))
  const stepCount = run.steps.filter((step) => step.kind !== 'status').length
  const summary = run.status === 'running'
    ? `Working for ${elapsed} · ${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`
    : `Worked for ${elapsed}, ${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`

  return (
    <details
      className="vd-agent-activity"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      aria-label="Agent activity"
      style={{
        border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg-secondary)',
        marginBottom: 8, overflow: 'hidden', overflowAnchor: 'none',
      }}
    >
      <summary
        aria-label={summary}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 12, listStylePosition: 'inside' }}
      >
        <span>{summary}</span>
        {run.status === 'running' && <span className="vd-agent-activity-spinner" aria-label="Current step running">◌</span>}
        {run.status === 'error' && <span style={{ color: 'var(--error)' }}>Failed</span>}
        {run.status === 'cancelled' && <span style={{ color: 'var(--text-muted)' }}>Stopped</span>}
      </summary>
      <div
        aria-live={run.status === 'running' ? 'polite' : 'off'}
        style={{ height: run.status === 'running' ? 170 : undefined, maxHeight: 210, overflow: 'auto', padding: '0 8px 8px', overflowAnchor: 'none', scrollbarGutter: 'stable' }}
      >
        {run.steps.map((step) => (
          <details key={step.id} className="vd-agent-activity-step" style={{ borderTop: '1px solid var(--border)', padding: '5px 2px' }}>
            <summary style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 26, listStylePosition: 'inside' }}>
              <span aria-label={step.status} style={{ width: 16, textAlign: 'center', fontWeight: 700, color: step.status === 'error' ? 'var(--error)' : step.status === 'running' ? 'var(--accent)' : 'var(--text-secondary)' }}>{stepMark(step)}</span>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--text-primary)', fontSize: 12, overflowWrap: 'anywhere' }}>{step.label}</span>
              {typeof step.durationMs === 'number' && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{formatElapsed(step.durationMs)}</span>}
            </summary>
            <div style={{ margin: '4px 8px 4px 27px', color: step.status === 'error' ? 'var(--error)' : 'var(--text-secondary)', fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {step.filePath && <div>
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Open ${step.filePath} in Code`}
                  onClick={() => onOpenFile?.(step.filePath!)}
                  style={{ padding: 0, border: 0, background: 'transparent', color: 'var(--accent)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
                >{step.filePath}</button>
                <div>+{step.addedLines || 0} / −{step.removedLines || 0} lines</div>
              </div>}
              {step.details && <pre style={{ margin: '4px 0 0', maxHeight: 120, overflow: 'auto', padding: 7, borderRadius: 6, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--font-mono, monospace)' }}>{step.details}</pre>}
              {step.status === 'error' && !step.details && <span>The step did not complete.</span>}
            </div>
          </details>
        ))}
      </div>
      <style>{`@keyframes vd-agent-activity-spin { to { transform: rotate(360deg) } } .vd-agent-activity-spinner { display:inline-block; color:var(--accent); animation:vd-agent-activity-spin 1s linear infinite; }`}</style>
    </details>
  )
}

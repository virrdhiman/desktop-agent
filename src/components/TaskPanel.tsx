/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * TaskPanel — Agent task tracking
 *
 * Shows all autonomous agent tasks with:
 * - Expandable task cards with step details
 * - Tool call tracking (running/done/error)
 * - Timestamps for each step
 * - Error display
 */
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { AgentTask, CheckpointSummary, ToolExecutionSummary, VerificationSummary } from '../types'

export type TaskReviewSummary = {
  changedFiles: string[]
  commands: string[]
  verification: VerificationSummary | undefined
  checkpoint: CheckpointSummary | undefined
}

/** Build the small, user-facing post-run review from state already collected during the run. */
export function buildTaskReviewSummary(
  task: AgentTask,
  edits: { path: string; timestamp?: number }[],
  executions: ToolExecutionSummary[],
  verification: VerificationSummary | undefined,
  checkpoint: CheckpointSummary | undefined,
): TaskReviewSummary {
  const writeTools = new Set(['write_file', 'edit_file', 'create_file', 'delete_file', 'multi_file_edit', 'archive_extract', 'vscode_apply_edit'])
  const stepChangedFiles = task.steps.flatMap((step) => {
    const call = step.toolCall
    if (!call || !writeTools.has(call.name)) return []
    const direct = typeof call.args?.path === 'string' ? [call.args.path] : []
    const batch = Array.isArray(call.args?.edits)
      ? call.args.edits.flatMap((edit: unknown) => typeof (edit as { path?: unknown })?.path === 'string' ? [(edit as { path: string }).path] : [])
      : []
    return [...direct, ...batch]
  })
  const recentEdits = edits.filter((edit) => edit.timestamp === undefined || edit.timestamp >= task.createdAt)
  const commands = task.steps
    .flatMap((step) => step.toolCall?.name === 'run_command' && typeof step.toolCall.args?.command === 'string'
      ? [step.toolCall.args.command]
      : [])
  const executedCommands = executions
    .filter((run) => run.name === 'run_command' && run.timestamp >= task.createdAt)
    .map((run) => {
      try {
        const args = JSON.parse(run.argsSummary) as { command?: unknown }
        return typeof args.command === 'string' ? args.command : ''
      } catch {
        return run.argsSummary.match(/(?:^|[,{\s])(?:command[=:])(["']?)(.+?)\1(?:[,}]|$)/)?.[2] || ''
      }
    })
    .filter(Boolean)
  const taskCommands = [...new Set(commands.length > 0 ? commands : executedCommands)]
  const changedFiles = [...new Set(stepChangedFiles.length > 0
    ? [...stepChangedFiles, ...recentEdits.filter((edit) => stepChangedFiles.includes(edit.path)).map((edit) => edit.path)]
    : recentEdits.map((edit) => edit.path))]
  const taskVerification = verification && verification.timestamp >= task.createdAt && taskCommands.includes(verification.command)
    ? verification
    : undefined
  const taskCheckpoint = checkpoint && checkpoint.createdAt >= task.createdAt
    && (changedFiles.length === 0 || checkpoint.files.some((file) => changedFiles.includes(file)))
    ? checkpoint
    : undefined
  return {
    changedFiles,
    commands: taskCommands,
    verification: taskVerification,
    checkpoint: taskCheckpoint,
  }
}

export default function TaskPanel() {
  const { tasks, fileEditHistory, toolExecutions, lastVerification, latestCheckpoint } = useStore()
  const [expandedTask, setExpandedTask] = useState<string | null>(
    tasks.length > 0 ? tasks[tasks.length - 1].id : null
  )
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null)
  const taskButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const focusTask = (taskId: string) => taskButtonRefs.current[taskId]?.focus()

  const handleTaskKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, taskId: string) => {
    const ordered = [...tasks].reverse()
    const index = ordered.findIndex((task) => task.id === taskId)
    if (index < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? ordered.length - 1 :
      (index + (event.key === 'ArrowDown' ? 1 : -1) + ordered.length) % ordered.length
    focusTask(ordered[nextIndex].id)
  }

  useEffect(() => {
    if (!expandedTask && tasks.length > 0) setExpandedTask(tasks[tasks.length - 1].id)
  }, [tasks, expandedTask])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <h2>📋 Tasks</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} · {tasks.filter(t => t.status === 'running').length} active
        </span>
      </div>

      <div className="panel-body" style={{ flex: 1, overflowY: 'auto' }}>
        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-text">No tasks yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Agent tasks appear here when the AI takes actions
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...tasks].reverse().map((task) => {
              const isExpanded = expandedTask === task.id
              const toolSteps = task.steps.filter(s => s.type === 'action')
              const errorSteps = task.steps.filter(s => s.type === 'error')
              const traceSteps = task.steps.filter(s => s.trace)

              return (
                <div key={task.id} className="card" style={{ overflow: 'hidden' }}>
                  {/* Task header */}
                  <button
                    type="button"
                    ref={(element) => { taskButtonRefs.current[task.id] = element }}
                    onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    onKeyDown={(event) => handleTaskKeyDown(event, task.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`task-details-${task.id}`}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} task ${task.title}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: 'pointer', padding: '4px 0', width: '100%',
                      background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                        ▶
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.title}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {toolSteps.length > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          ⚡ {toolSteps.length}
                        </span>
                      )}
                      {errorSteps.length > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--error)' }}>
                          ✕ {errorSteps.length}
                        </span>
                      )}
                      <span className={`badge ${
                        task.status === 'done' ? 'badge-green' :
                        task.status === 'running' ? 'badge-yellow' :
                        task.status === 'error' ? 'badge-red' : 'badge-blue'
                      }`}>
                        {task.status === 'done' ? '✓' : task.status === 'running' ? '⟳' :
                         task.status === 'error' ? '✕' : '○'} {task.status}
                      </span>
                    </div>
                  </button>

                  {/* Task steps (expanded) */}
                    {isExpanded && (
                      <div id={`task-details-${task.id}`} role="region" aria-label={`${task.title} details`} style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                        <div aria-labelledby={`review-title-${task.id}`} style={{ marginBottom: 10, padding: 9, borderRadius: 6, background: 'rgba(59,130,246,0.06)', border: '1px solid var(--border)' }}>
                          <div id={`review-title-${task.id}`} style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>Post-run review</div>
                         {(() => {
                           const review = buildTaskReviewSummary(task, fileEditHistory, toolExecutions, lastVerification, latestCheckpoint)
                           return (
                              <div style={{ display: 'grid', gap: 7, fontSize: 11 }}>
                                <div>
                                  <div role="heading" aria-level={3} style={{ color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Files</div>
                                  {review.changedFiles.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{review.changedFiles.map((file) => <li key={file}>{file}</li>)}</ul> : <div>No file changes recorded</div>}
                                </div>
                                <div>
                                  <div role="heading" aria-level={3} style={{ color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Commands</div>
                                  {review.commands.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{review.commands.map((command) => <li key={command}><code style={{ fontSize: 11 }}>{command}</code></li>)}</ul> : <div>No commands recorded</div>}
                                </div>
                                <div>
                                  <div role="heading" aria-level={3} style={{ color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Verification</div>
                                  <div style={{ color: review.verification ? (review.verification.ok ? 'var(--success)' : 'var(--error)') : 'var(--text-secondary)' }}>
                                    {review.verification ? `${review.verification.ok ? '✓ Passed' : '✕ Failed'} · ${review.verification.command}` : 'Not run yet'}
                                  </div>
                                </div>
                                <div>
                                  <div role="heading" aria-level={3} style={{ color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Restore</div>
                                  <div>{review.checkpoint ? `Available · ${review.checkpoint.files.length} file${review.checkpoint.files.length === 1 ? '' : 's'} · restore from Sessions` : 'No checkpoint available'}</div>
                               </div>
                             </div>
                           )
                         })()}
                       </div>
                       {traceSteps.length > 0 && (
                        <div style={{ marginBottom: 10, padding: 8, borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>Agent trace</div>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{traceSteps.length} role events</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {traceSteps.map((step) => {
                              const trace = step.trace!
                              const traceId = `${task.id}:${step.id}`
                              const traceOpen = expandedTrace === traceId
                              const statusColor = trace.status === 'done' ? 'var(--success)' :
                                trace.status === 'error' || trace.status === 'blocked' ? 'var(--error)' : 'var(--warning)'
                              return (
                                <div key={traceId} style={{ borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedTrace(traceOpen ? null : traceId)}
                                    style={{
                                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                      gap: 8, padding: '7px 9px', background: 'transparent', border: 'none',
                                      color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
                                    }}
                                    aria-expanded={traceOpen}
                                  >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                                      <span style={{ fontSize: 11, transform: traceOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
                                      <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trace.role}</span>
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                      {trace.provider && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{trace.provider}</span>}
                                      <span style={{ fontSize: 10, color: statusColor, textTransform: 'uppercase' }}>{trace.status}</span>
                                    </span>
                                  </button>
                                  {traceOpen && (
                                    <div style={{ padding: '0 9px 9px', display: 'grid', gap: 7 }}>
                                      {([
                                        ['Input', trace.input],
                                        ['Output', trace.output],
                                        ['Evidence', trace.evidence],
                                      ] as const).filter(([, value]) => value && value.trim()).map(([label, value]) => (
                                        <div key={label}>
                                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                                          <pre style={{
                                            margin: 0, padding: 8, maxHeight: 220, overflow: 'auto',
                                            borderRadius: 4, background: 'var(--bg-tertiary)', whiteSpace: 'pre-wrap',
                                            fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45,
                                          }}>{value}</pre>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {task.steps.map((step, i) => (
                        <div key={step.id} style={{
                          padding: '6px 8px',
                          background: i % 2 === 0 ? 'var(--bg-primary)' : 'transparent',
                          borderRadius: 4,
                          fontSize: 12,
                          marginBottom: 2,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{
                              color: step.type === 'thought' ? 'var(--text-muted)' :
                                     step.type === 'action' ? 'var(--accent)' :
                                     step.type === 'error' ? 'var(--error)' : 'var(--success)',
                            }}>
                              {step.type === 'thought' ? '💭' :
                               step.type === 'action' ? '⚡' :
                               step.type === 'error' ? '✕' : '👁'}
                            </span>
                            <span style={{ fontWeight: 500, textTransform: 'capitalize', fontSize: 11, color: 'var(--text-secondary)' }}>
                              {step.type}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                              {new Date(step.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4, paddingLeft: 24 }}>
                            {step.content}
                          </div>
                          {step.toolCall && (
                            <div style={{
                              marginTop: 4, marginLeft: 24, padding: '4px 8px',
                              background: 'var(--bg-tertiary)', borderRadius: 4,
                              fontFamily: 'monospace', fontSize: 11,
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                              <span style={{ color: 'var(--accent)' }}>{step.toolCall.name}</span>
                              <span style={{ color: 'var(--text-muted)' }}>
                                ({JSON.stringify(step.toolCall.args).slice(0, 100)})
                              </span>
                              {step.toolCall.status === 'running' && <span style={{ color: 'var(--warning)' }}>⟳</span>}
                              {step.toolCall.status === 'done' && <span style={{ color: 'var(--success)' }}>✓</span>}
                              {step.toolCall.status === 'error' && <span style={{ color: 'var(--error)' }}>✕</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

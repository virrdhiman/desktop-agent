/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
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
import { useState } from 'react'
import { useStore } from '../store'

export default function TaskPanel() {
  const { tasks } = useStore()
  const [expandedTask, setExpandedTask] = useState<string | null>(
    tasks.length > 0 ? tasks[tasks.length - 1].id : null
  )

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

              return (
                <div key={task.id} className="card" style={{ overflow: 'hidden' }}>
                  {/* Task header */}
                  <div
                    onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: 'pointer', padding: '4px 0',
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
                  </div>

                  {/* Task steps (expanded) */}
                  {isExpanded && (
                    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
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

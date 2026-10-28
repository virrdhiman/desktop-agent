import { describe, expect, it } from 'vitest'
import {
  changedLineCounts, maskAgentActivityText, reduceAgentActivity, sanitizeAgentActivityEvent,
  type AgentActivityEvent,
} from './agentActivity'

const event = (value: AgentActivityEvent) => value

describe('agent activity reducer', () => {
  it('keeps ordered model, tool, output, and file steps with bounded details', () => {
    let run = reduceAgentActivity(null, event({ type: 'run-started', runId: 'run-1', timestamp: 10 }))
    run = reduceAgentActivity(run, event({ type: 'model-thinking', runId: 'run-1', label: 'Waiting for local model', timestamp: 20 }))
    run = reduceAgentActivity(run, event({ type: 'tool-call-started', runId: 'run-1', toolName: 'read_file', label: 'Reading src/app.tsx', timestamp: 30 }))
    run = reduceAgentActivity(run, event({ type: 'tool-call-finished', runId: 'run-1', toolName: 'read_file', success: true, summary: 'Read 20 lines', durationMs: 12, timestamp: 42 }))
    run = reduceAgentActivity(run, event({ type: 'tool-call-started', runId: 'run-1', toolName: 'run_command', label: 'Running npm test', timestamp: 50 }))
    run = reduceAgentActivity(run, event({ type: 'command-output', runId: 'run-1', output: 'last output line', timestamp: 60 }))
    run = reduceAgentActivity(run, event({ type: 'tool-call-finished', runId: 'run-1', toolName: 'run_command', success: true, summary: 'Command passed', durationMs: 30, timestamp: 80 }))
    run = reduceAgentActivity(run, event({ type: 'file-edited', runId: 'run-1', path: 'src/app.tsx', addedLines: 2, removedLines: 1, timestamp: 90 }))
    run = reduceAgentActivity(run, event({ type: 'run-finished', runId: 'run-1', status: 'done', durationMs: 80, timestamp: 90 }))

    expect(run?.status).toBe('done')
    expect(run?.steps.map((step) => step.label)).toEqual([
      'Request started', 'Waiting for local model', 'Reading src/app.tsx', 'Running npm test', 'File edited',
    ])
    expect(run?.steps[2]).toMatchObject({ status: 'done', details: 'Read 20 lines', durationMs: 12 })
    expect(run?.steps[3]).toMatchObject({ status: 'done', details: 'Command passed' })
    expect(run?.steps[4]).toMatchObject({ filePath: 'src/app.tsx', addedLines: 2, removedLines: 1 })
  })

  it('marks active and remaining steps cancelled when Stop ends a run', () => {
    let run = reduceAgentActivity(null, event({ type: 'run-started', runId: 'run-2', timestamp: 1 }))
    run = reduceAgentActivity(run, event({ type: 'tool-call-started', runId: 'run-2', toolName: 'run_command', label: 'Running a long command', timestamp: 2 }))
    run = reduceAgentActivity(run, event({ type: 'run-finished', runId: 'run-2', status: 'cancelled', durationMs: 1_000, timestamp: 1_002 }))
    expect(run?.status).toBe('cancelled')
    expect(run?.steps.find((step) => step.toolName === 'run_command')?.status).toBe('cancelled')
    const steps = run?.steps || []
    expect(steps[steps.length - 1]).toMatchObject({ label: 'Remaining steps cancelled', status: 'cancelled' })
  })

  it('redacts known keys, named credentials, bearer values, and common token formats', () => {
    const safe = maskAgentActivityText([
      'provider response: fixture-secret-123',
      'OPENAI_API_KEY=another-secret',
      'Authorization: Bearer abc.def.ghi',
      'token=ghp_abcdefghijklmnopqrstuvwxyz123456',
    ].join('\n'), ['fixture-secret-123'])
    expect(safe).not.toContain('fixture-secret-123')
    expect(safe).not.toContain('another-secret')
    expect(safe).not.toContain('abc.def.ghi')
    expect(safe).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456')
    expect(safe).toContain('[redacted]')
  })

  it('sanitizes IPC payload sizes and rejects sensitive file paths', () => {
    const output = sanitizeAgentActivityEvent({
      type: 'command-output', runId: 'run-3', timestamp: 1, output: 'A'.repeat(5_000),
    })
    expect(output?.type).toBe('command-output')
    if (output?.type === 'command-output') expect(output.output.length).toBeLessThanOrEqual(3_000)
    expect(sanitizeAgentActivityEvent({ type: 'file-edited', runId: 'run-3', timestamp: 1, path: '.env.local', addedLines: 1, removedLines: 0 })).toBeNull()
  })

  it('counts changed lines without exposing file contents', () => {
    expect(changedLineCounts('one\ntwo\nthree', 'one\nchanged\nthree\nfour')).toEqual({ addedLines: 2, removedLines: 1 })
  })
})

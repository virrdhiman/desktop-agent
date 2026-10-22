import { describe, expect, it } from 'vitest'
import { buildSessionHandoff, buildSessionStatusSummary } from './sessionSummary'
import type { ChatSession } from '../types'

const session: ChatSession = {
  id: 's1', title: 'Fix build', createdAt: 1, updatedAt: 2, messages: [],
  resume: { workspacePath: 'C:\\repo', providerId: 'openai', tasks: [{ id: 't1', title: 'Build', status: 'running', steps: [], createdAt: 1 }] },
}

describe('session status summary', () => {
  it('summarizes the local resume context and task progress', () => {
    expect(buildSessionStatusSummary(session, { providerName: 'OpenAI', model: 'gpt', tasks: session.resume?.tasks })).toEqual([
      'Session: Fix build', 'Workspace: C:\\repo', 'Task progress: 0/1 done · 1 running',
      'Provider: OpenAI (gpt)', 'Verification: Not run', 'Resume point: Files and task state available',
    ])
  })

  it('creates a handoff without credentials or telemetry', () => {
    const handoff = buildSessionHandoff(session, { providerName: 'OpenAI', tasks: session.resume?.tasks })
    expect(handoff).toContain('# Session handoff')
    expect(handoff).toContain('Next step:')
    expect(handoff).not.toContain('apiKey')
  })
})

import type { AgentTask, ChatSession, VerificationSummary } from '../types'

export type SessionContext = {
  workspacePath?: string
  providerName?: string
  model?: string
  tasks?: AgentTask[]
  verification?: VerificationSummary
  selectedFile?: string | null
  checkpointFiles?: number
}

function taskProgress(tasks: AgentTask[]): string {
  if (tasks.length === 0) return 'No tracked tasks'
  const done = tasks.filter((task) => task.status === 'done').length
  const running = tasks.filter((task) => task.status === 'running').length
  const errors = tasks.filter((task) => task.status === 'error').length
  return `${done}/${tasks.length} done${running ? ` · ${running} running` : ''}${errors ? ` · ${errors} failed` : ''}`
}

/** A safe, local-only status snapshot used by the sessions UI and handoff text. */
export function buildSessionStatusSummary(session: ChatSession | null, context: SessionContext): string[] {
  const resume = session?.resume
  const tasks = context.tasks || resume?.tasks || []
  const verification = context.verification || resume?.lastVerification
  return [
    `Session: ${session?.title || 'New chat'}`,
    `Workspace: ${context.workspacePath || resume?.workspacePath || 'Not open'}`,
    `Task progress: ${taskProgress(tasks)}`,
    `Provider: ${context.providerName || resume?.providerId || 'Not selected'}${context.model || resume?.model ? ` (${context.model || resume?.model})` : ''}`,
    `Verification: ${verification ? `${verification.ok ? 'passed' : 'failed'} — ${verification.command}` : 'Not run'}`,
    `Resume point: ${context.selectedFile || resume?.selectedFile || context.checkpointFiles || resume?.checkpoint?.files.length || tasks.length ? 'Files and task state available' : 'Conversation only'}`,
  ]
}

export function buildSessionHandoff(session: ChatSession | null, context: SessionContext): string {
  return [
    '# Session handoff',
    ...buildSessionStatusSummary(session, context),
    '',
    'Next step: Review the task state and continue from the current workspace.',
  ].join('\n')
}

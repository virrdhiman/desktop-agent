export const MAX_AGENT_ACTIVITY_STEPS = 250
export const MAX_AGENT_ACTIVITY_DETAIL_CHARS = 3_000

export type AgentActivityStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface AgentActivityStep {
  id: string
  kind: 'status' | 'model' | 'tool' | 'file' | 'output' | 'error' | 'cancelled'
  label: string
  status: AgentActivityStatus
  startedAt: number
  finishedAt?: number
  durationMs?: number
  toolName?: string
  filePath?: string
  addedLines?: number
  removedLines?: number
  details?: string
}

export interface AgentActivityRun {
  id: string
  startedAt: number
  updatedAt: number
  status: AgentActivityStatus
  durationMs?: number
  steps: AgentActivityStep[]
}

export type AgentActivityEvent =
  | { type: 'run-started'; runId: string; timestamp: number }
  | { type: 'model-thinking'; runId: string; label: string; timestamp: number }
  | { type: 'tool-call-started'; runId: string; toolName: string; label: string; timestamp: number }
  | { type: 'tool-call-finished'; runId: string; toolName: string; success: boolean; summary: string; durationMs: number; timestamp: number }
  | { type: 'file-edited'; runId: string; path: string; addedLines: number; removedLines: number; timestamp: number }
  | { type: 'command-output'; runId: string; output: string; timestamp: number }
  | { type: 'error'; runId: string; message: string; timestamp: number }
  | { type: 'run-finished'; runId: string; status: 'done' | 'error' | 'cancelled'; durationMs: number; steps: number; timestamp: number }

const SECRET_PATH = /(^|[\\/])(?:\.env(?:\.|$)|[^\\/]*(?:api[-_]?key|secret|credential|private[-_]?key)[^\\/]*|[^\\/]*\.pem$)/i

/** Keep labels useful while preventing sensitive names and raw file contents from entering the trace. */
export function agentActivityToolLabel(name: string, args: Record<string, unknown>, workspace = ''): string {
  const rawPath = typeof args.path === 'string' ? args.path : ''
  const normalizedWorkspace = workspace.replace(/[\\/]+$/, '').replace(/\\/g, '/')
  const normalizedPath = rawPath.replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/')
  const relativePath = normalizedWorkspace && normalizedPath.toLowerCase().startsWith(`${normalizedWorkspace.toLowerCase()}/`)
    ? normalizedPath.slice(normalizedWorkspace.length + 1)
    : pathSegments[pathSegments.length - 1] || normalizedPath
  const safePath = !rawPath || SECRET_PATH.test(rawPath) ? '' : maskAgentActivityText(relativePath).slice(0, 150)
  const pathLabel = safePath ? ` ${safePath}` : ''
  if (name === 'read_file') return `Reading${pathLabel || ' a file'}`
  if (name === 'write_file' || name === 'create_file' || name === 'edit_file' || name === 'multi_file_edit') return `Editing${pathLabel || ' files'}`
  if (name === 'run_command') {
    const command = typeof args.command === 'string' ? args.command.trim() : ''
    const safePrefix = command.match(/^([A-Za-z0-9_./-]+)(?:\s+([A-Za-z0-9_./-]+))?/)
    return safePrefix ? `Running ${safePrefix.slice(1).filter(Boolean).join(' ')}` : 'Running a command'
  }
  if (name === 'browser') {
    const operation = String(args.operation || '').toLowerCase()
    return operation.includes('search') ? 'Searching the web' : 'Using the browser'
  }
  if (name.includes('search')) {
    return 'Searching the workspace'
  }
  return `${name.replace(/_/g, ' ')}${pathLabel}`.slice(0, 180)
}

export function safeActivityFilePath(path: string): string | null {
  if (!path.trim() || SECRET_PATH.test(path)) return null
  return maskAgentActivityText(path).slice(0, 240)
}

const secretAssignment = /(^|\n)(\s*(?:export\s+)?[A-Za-z_][A-Za-z\d_.-]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|PASSWD|PWD)[A-Za-z\d_.-]*\s*[:=]\s*)(.*)$/gim
const namedSecret = /\b((?:api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|token|password|secret|credential|authorization|auth)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi
const bearerToken = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi
const commonToken = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g
const jwt = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g

/** Redacts known provider values and common credential formats before activity leaves its source. */
export function maskAgentActivityText(value: unknown, knownSecrets: string[] = []): string {
  let text = String(value ?? '')
  for (const secret of knownSecrets) {
    if (typeof secret === 'string' && secret.length >= 4) text = text.split(secret).join('[redacted]')
  }
  return text
    .replace(secretAssignment, '$1$2[redacted]')
    .replace(bearerToken, 'Bearer [redacted]')
    .replace(namedSecret, '$1[redacted]')
    .replace(commonToken, '[redacted]')
    .replace(jwt, '[redacted]')
    .slice(-MAX_AGENT_ACTIVITY_DETAIL_CHARS)
}

function cappedSteps(steps: AgentActivityStep[]): AgentActivityStep[] {
  return steps.length > MAX_AGENT_ACTIVITY_STEPS ? steps.slice(-MAX_AGENT_ACTIVITY_STEPS) : steps
}

function appendStep(run: AgentActivityRun, step: AgentActivityStep): AgentActivityRun {
  return { ...run, updatedAt: step.finishedAt || step.startedAt, steps: cappedSteps([...run.steps, step]) }
}

function closeRunning(steps: AgentActivityStep[], timestamp: number, status: AgentActivityStatus): AgentActivityStep[] {
  return steps.map((step) => step.status !== 'running' ? step : {
    ...step,
    status,
    finishedAt: timestamp,
    durationMs: Math.max(0, timestamp - step.startedAt),
  })
}

/** Deterministic reducer used by the live chat panel and history snapshots. */
export function reduceAgentActivity(run: AgentActivityRun | null, event: AgentActivityEvent): AgentActivityRun | null {
  if (event.type === 'run-started') {
    return {
      id: event.runId,
      startedAt: event.timestamp,
      updatedAt: event.timestamp,
      status: 'running',
      steps: [{
        id: `${event.runId}:start`, kind: 'status', label: 'Request started', status: 'done',
        startedAt: event.timestamp, finishedAt: event.timestamp, durationMs: 0,
      }],
    }
  }
  if (!run || run.id !== event.runId || run.status !== 'running') return run

  if (event.type === 'model-thinking') {
    const steps = closeRunning(run.steps, event.timestamp, 'done')
    const step: AgentActivityStep = {
      id: `${run.id}:model:${event.timestamp}:${steps.length}`, kind: 'model',
      label: maskAgentActivityText(event.label).slice(0, 180), status: 'running', startedAt: event.timestamp,
    }
    return { ...run, updatedAt: event.timestamp, steps: cappedSteps([...steps, step]) }
  }

  if (event.type === 'tool-call-started') {
    const steps = closeRunning(run.steps, event.timestamp, 'done')
    const step: AgentActivityStep = {
      id: `${run.id}:tool:${event.timestamp}:${steps.length}`, kind: 'tool',
      label: maskAgentActivityText(event.label).slice(0, 180), status: 'running', startedAt: event.timestamp,
      toolName: event.toolName.slice(0, 80),
    }
    return { ...run, updatedAt: event.timestamp, steps: cappedSteps([...steps, step]) }
  }

  if (event.type === 'tool-call-finished') {
    let index = -1
    for (let cursor = run.steps.length - 1; cursor >= 0; cursor -= 1) {
      const step = run.steps[cursor]
      if (step.kind === 'tool' && step.toolName === event.toolName && step.status === 'running') { index = cursor; break }
    }
    if (index < 0) return appendStep(run, {
      id: `${run.id}:tool:${event.timestamp}:${run.steps.length}`, kind: 'tool',
      label: event.toolName, status: event.success ? 'done' : 'error', startedAt: event.timestamp,
      finishedAt: event.timestamp, durationMs: Math.max(0, event.durationMs), toolName: event.toolName,
      details: maskAgentActivityText(event.summary),
    })
    const steps = [...run.steps]
    const summary = maskAgentActivityText(event.summary)
    steps[index] = {
      ...steps[index], status: event.success ? 'done' : 'error', finishedAt: event.timestamp,
      durationMs: Math.max(0, event.durationMs),
      details: event.toolName === 'run_command' && steps[index].details
        ? maskAgentActivityText(`${steps[index].details}\n\n${summary}`)
        : summary,
    }
    return { ...run, updatedAt: event.timestamp, steps }
  }

  if (event.type === 'file-edited') {
    return appendStep(run, {
      id: `${run.id}:file:${event.timestamp}:${run.steps.length}`, kind: 'file', label: 'File edited',
      status: 'done', startedAt: event.timestamp, finishedAt: event.timestamp, filePath: event.path.slice(0, 240),
      addedLines: Math.max(0, Math.floor(event.addedLines)), removedLines: Math.max(0, Math.floor(event.removedLines)),
    })
  }

  if (event.type === 'command-output') {
    let index = -1
    for (let cursor = run.steps.length - 1; cursor >= 0; cursor -= 1) {
      const step = run.steps[cursor]
      if (step.kind === 'tool' && step.toolName === 'run_command' && step.status === 'running') { index = cursor; break }
    }
    if (index < 0) return run
    const steps = [...run.steps]
    steps[index] = { ...steps[index], details: maskAgentActivityText(event.output) }
    return { ...run, updatedAt: event.timestamp, steps }
  }

  if (event.type === 'error') {
    return appendStep(run, {
      id: `${run.id}:error:${event.timestamp}:${run.steps.length}`, kind: 'error', label: 'Could not complete this step',
      status: 'error', startedAt: event.timestamp, finishedAt: event.timestamp,
      details: maskAgentActivityText(event.message, []),
    })
  }

  if (event.type === 'run-finished') {
    const stepStatus: AgentActivityStatus = event.status
    let steps = closeRunning(run.steps, event.timestamp, stepStatus)
    if (event.status === 'cancelled') {
      steps = cappedSteps([...steps, {
        id: `${run.id}:cancelled:${event.timestamp}`, kind: 'cancelled', label: 'Remaining steps cancelled',
        status: 'cancelled', startedAt: event.timestamp, finishedAt: event.timestamp, durationMs: 0,
      }])
    }
    return {
      ...run, updatedAt: event.timestamp, status: event.status,
      durationMs: Math.max(0, event.durationMs), steps,
    }
  }

  return run
}

/** Accepts only bounded, display-safe event fields from IPC. */
export function sanitizeAgentActivityEvent(value: unknown, knownSecrets: string[] = []): AgentActivityEvent | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const runId = typeof raw.runId === 'string' ? raw.runId.trim().slice(0, 128) : ''
  if (!runId || /[\r\n]/.test(runId)) return null
  const timestamp = Number.isFinite(Number(raw.timestamp)) ? Number(raw.timestamp) : Date.now()
  const text = (input: unknown, limit: number) => maskAgentActivityText(input, knownSecrets).slice(-limit)
  const toolName = typeof raw.toolName === 'string' && /^[a-z0-9_-]{1,80}$/i.test(raw.toolName) ? raw.toolName : ''

  switch (raw.type) {
    case 'run-started': return { type: 'run-started', runId, timestamp }
    case 'model-thinking': return typeof raw.label === 'string' ? { type: 'model-thinking', runId, label: text(raw.label, 180), timestamp } : null
    case 'tool-call-started': return toolName && typeof raw.label === 'string'
      ? { type: 'tool-call-started', runId, toolName, label: text(raw.label, 180), timestamp } : null
    case 'tool-call-finished': return toolName && typeof raw.success === 'boolean'
      ? { type: 'tool-call-finished', runId, toolName, success: raw.success, summary: text(raw.summary, 1_500), durationMs: Math.max(0, Math.min(86_400_000, Number(raw.durationMs) || 0)), timestamp } : null
    case 'file-edited': {
      if (typeof raw.path !== 'string' || !safeActivityFilePath(raw.path)) return null
      return {
        type: 'file-edited', runId, path: text(raw.path, 240),
        addedLines: Math.max(0, Math.min(1_000_000, Math.floor(Number(raw.addedLines) || 0))),
        removedLines: Math.max(0, Math.min(1_000_000, Math.floor(Number(raw.removedLines) || 0))), timestamp,
      }
    }
    case 'command-output': return typeof raw.output === 'string' ? { type: 'command-output', runId, output: text(raw.output, MAX_AGENT_ACTIVITY_DETAIL_CHARS), timestamp } : null
    case 'error': return typeof raw.message === 'string' ? { type: 'error', runId, message: text(raw.message, 500), timestamp } : null
    case 'run-finished': {
      if (raw.status !== 'done' && raw.status !== 'error' && raw.status !== 'cancelled') return null
      return {
        type: 'run-finished', runId, status: raw.status,
        durationMs: Math.max(0, Math.min(86_400_000, Number(raw.durationMs) || 0)),
        steps: Math.max(0, Math.min(MAX_AGENT_ACTIVITY_STEPS, Math.floor(Number(raw.steps) || 0))), timestamp,
      }
    }
    default: return null
  }
}

/** Validates activity loaded from conversation files before it reaches the UI. */
export function sanitizeAgentActivityRun(value: unknown, knownSecrets: string[] = []): AgentActivityRun | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const validStatuses = new Set<AgentActivityStatus>(['running', 'done', 'error', 'cancelled'])
  if (typeof raw.id !== 'string' || !raw.id.trim() || !validStatuses.has(raw.status as AgentActivityStatus) || !Array.isArray(raw.steps)) return undefined
  const finite = (input: unknown, fallback = 0) => Number.isFinite(Number(input)) ? Number(input) : fallback
  const steps: AgentActivityStep[] = raw.steps.slice(-MAX_AGENT_ACTIVITY_STEPS).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const step = entry as Record<string, unknown>
    const kind = step.kind as AgentActivityStep['kind']
    const status = step.status as AgentActivityStatus
    if (!['status', 'model', 'tool', 'file', 'output', 'error', 'cancelled'].includes(kind) || !validStatuses.has(status)) return []
    const sourceLabel = maskAgentActivityText(step.label, knownSecrets).slice(0, 180)
    const label = SECRET_PATH.test(sourceLabel) ? 'Sensitive file operation' : sourceLabel
    const path = typeof step.filePath === 'string' ? safeActivityFilePath(step.filePath) : null
    const toolName = typeof step.toolName === 'string' && /^[a-z0-9_-]{1,80}$/i.test(step.toolName) ? step.toolName : undefined
    return [{
      id: typeof step.id === 'string' ? step.id.slice(0, 160) : `restored:${index}`,
      kind,
      label: label || 'Agent activity',
      status,
      startedAt: Math.max(0, finite(step.startedAt)),
      ...(Number.isFinite(Number(step.finishedAt)) ? { finishedAt: Math.max(0, finite(step.finishedAt)) } : {}),
      ...(Number.isFinite(Number(step.durationMs)) ? { durationMs: Math.max(0, Math.min(86_400_000, finite(step.durationMs))) } : {}),
      ...(toolName ? { toolName } : {}),
      ...(path ? { filePath: maskAgentActivityText(path, knownSecrets).slice(0, 240) } : {}),
      ...(Number.isFinite(Number(step.addedLines)) ? { addedLines: Math.max(0, Math.min(1_000_000, Math.floor(finite(step.addedLines)))) } : {}),
      ...(Number.isFinite(Number(step.removedLines)) ? { removedLines: Math.max(0, Math.min(1_000_000, Math.floor(finite(step.removedLines)))) } : {}),
      ...(typeof step.details === 'string' ? { details: maskAgentActivityText(step.details, knownSecrets) } : {}),
    }]
  })
  return {
    id: raw.id.trim().slice(0, 128),
    startedAt: Math.max(0, finite(raw.startedAt)),
    updatedAt: Math.max(0, finite(raw.updatedAt, finite(raw.startedAt))),
    status: raw.status as AgentActivityStatus,
    ...(Number.isFinite(Number(raw.durationMs)) ? { durationMs: Math.max(0, Math.min(86_400_000, finite(raw.durationMs))) } : {}),
    steps,
  }
}

export function changedLineCounts(before: string, after: string): { addedLines: number; removedLines: number } {
  const oldLines = before.split(/\r?\n/)
  const newLines = after.split(/\r?\n/)
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1
  let suffix = 0
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1
  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix)
  const newMiddle = newLines.slice(prefix, newLines.length - suffix)
  if (oldMiddle.length * newMiddle.length > 4_000_000) {
    return { addedLines: newMiddle.length, removedLines: oldMiddle.length }
  }
  let previous = new Uint32Array(newMiddle.length + 1)
  for (const oldLine of oldMiddle) {
    const current = new Uint32Array(newMiddle.length + 1)
    for (let index = 1; index <= newMiddle.length; index += 1) {
      current[index] = oldLine === newMiddle[index - 1]
        ? previous[index - 1] + 1
        : Math.max(previous[index], current[index - 1])
    }
    previous = current
  }
  const unchanged = previous[newMiddle.length]
  return { addedLines: newMiddle.length - unchanged, removedLines: oldMiddle.length - unchanged }
}

import { spawn, type ChildProcess } from 'node:child_process'
import { maskAgentActivityText, MAX_AGENT_ACTIVITY_DETAIL_CHARS } from '../src/lib/agentActivity'

export interface AgentCommandResult {
  error: { code?: number | string | null; killed?: boolean; signal?: string | null; message?: string } | null
  stdout: string
  stderr: string
}

interface AgentCommandOptions {
  command: string
  cwd: string
  runId?: string
  timeoutMs: number
  knownSecrets?: string[]
  onOutput?: (tail: string) => void
}

const activeCommands = new Map<string, Set<ChildProcess>>()
const MAX_CAPTURE_CHARS = 1_000_000
const OUTPUT_EVENT_INTERVAL_MS = 220
const intentionallyCancelled = new WeakSet<ChildProcess>()

function appendBounded(current: string, chunk: string): string {
  const next = current + chunk
  return next.length > MAX_CAPTURE_CHARS ? next.slice(-MAX_CAPTURE_CHARS) : next
}

function track(runId: string | undefined, child: ChildProcess): void {
  if (!runId) return
  const children = activeCommands.get(runId) || new Set<ChildProcess>()
  children.add(child)
  activeCommands.set(runId, children)
}

function untrack(runId: string | undefined, child: ChildProcess): void {
  if (!runId) return
  const children = activeCommands.get(runId)
  children?.delete(child)
  if (children?.size === 0) activeCommands.delete(runId)
}

/** Stops only agent-owned child processes; an omitted run id cancels every active agent command. */
export function cancelActiveAgentCommands(runId?: string): void {
  const targets = runId ? [[runId, activeCommands.get(runId)] as const] : [...activeCommands.entries()]
  for (const [id, children] of targets) {
    for (const child of children || []) {
      killAgentChild(child)
    }
    if (!children?.size) activeCommands.delete(id)
  }
}

function killAgentChild(child: ChildProcess): void {
  if (!child.pid) return
  intentionallyCancelled.add(child)
  if (process.platform === 'win32') {
    try {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.once('error', () => { try { child.kill('SIGTERM') } catch { /* Process already exited. */ } })
      killer.unref()
      return
    } catch { /* Fall through to the direct child signal. */ }
  }
  try { child.kill('SIGTERM') } catch { /* Exit may have raced with Stop. */ }
}

/** Runs the approved command while keeping only bounded output and publishing a redacted live tail. */
export function runAgentCommand(options: AgentCommandOptions): Promise<AgentCommandResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let activityTail = ''
    let lastOutputAt = 0
    let outputTimer: ReturnType<typeof setTimeout> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    let spawnError: Error | undefined
    let settled = false
    const knownSecrets = [
      ...(options.knownSecrets || []),
      ...Object.values(process.env).filter((value): value is string => typeof value === 'string' && value.length >= 8),
    ]
    const emitOutput = (force = false) => {
      if (!options.runId || !options.onOutput || !activityTail) return
      const elapsed = Date.now() - lastOutputAt
      if (!force && elapsed < OUTPUT_EVENT_INTERVAL_MS) {
        if (!outputTimer) outputTimer = setTimeout(() => { outputTimer = undefined; emitOutput(true) }, OUTPUT_EVENT_INTERVAL_MS - elapsed)
        return
      }
      lastOutputAt = Date.now()
      const lastLines = activityTail.split(/\r?\n/).slice(-12).join('\n')
      options.onOutput(maskAgentActivityText(lastLines, knownSecrets))
    }
    const onChunk = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {
      const text = String(chunk)
      if (target === 'stdout') stdout = appendBounded(stdout, text)
      else stderr = appendBounded(stderr, text)
      activityTail = `${stdout}\n${stderr}`.slice(-MAX_AGENT_ACTIVITY_DETAIL_CHARS)
      emitOutput()
    }

    let child: ChildProcess
    try {
      child = spawn(options.command, {
        cwd: options.cwd,
        shell: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ error: { message: error instanceof Error ? error.message : String(error) }, stdout, stderr })
      return
    }

    track(options.runId, child)
    child.stdout?.on('data', (chunk) => onChunk('stdout', chunk))
    child.stderr?.on('data', (chunk) => onChunk('stderr', chunk))
    child.once('error', (error) => { spawnError = error })
    timeout = setTimeout(() => {
      timedOut = true
      killAgentChild(child)
    }, options.timeoutMs)

    const settle = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      if (outputTimer) clearTimeout(outputTimer)
      emitOutput(true)
      untrack(options.runId, child)
      let error: AgentCommandResult['error'] = null
      if (spawnError) error = { message: spawnError.message }
      else if (timedOut) error = { code: null, killed: true, signal: signal || 'SIGTERM', message: 'Command timed out' }
      else if (intentionallyCancelled.has(child)) error = { code: null, killed: true, signal: signal || 'SIGTERM', message: 'Command cancelled' }
      else if (signal) error = { code: null, killed: true, signal }
      else if (code !== 0) error = { code }
      resolve({ error, stdout, stderr })
    }
    child.once('close', settle)
  })
}

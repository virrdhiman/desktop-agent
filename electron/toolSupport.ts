/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Pure helpers for tool execution: resolving relative paths against the open workspace,
 * and turning a shell command's outcome into a result the model cannot misread.
 */
import path from 'path'

export const COMMAND_TIMEOUT_MS = 30_000
const MAX_STREAM_CHARS = 20_000

const PATH_KEYS = ['path', 'cwd', 'audio_path']
/** Tools whose `path` defaults to the current directory, which should mean the workspace. */
const DIRECTORY_TOOLS = new Set([
  'list_files', 'search_files', 'search_code', 'read_directory_tree',
  'git_status', 'git_diff', 'git_commit', 'git_log', 'git_branch', 'git_stash',
  'git_generate_commit', 'git_undo_last', 'git_discard_changes',
])

function resolveIn(workspace: string, value: unknown): unknown {
  return typeof value === 'string' && value && !path.isAbsolute(value) ? path.resolve(workspace, value) : value
}

/**
 * Args with relative paths resolved against the workspace. Without a workspace the args are
 * returned unchanged, so absolute paths keep working.
 */
export function resolveToolArgs(name: string, args: Record<string, any> | undefined, workspace?: string): Record<string, any> {
  const out: Record<string, any> = { ...(args || {}) }
  if (!workspace) return out

  for (const key of PATH_KEYS) out[key] = resolveIn(workspace, out[key])
  if (name === 'image_analysis' && typeof out.image_url === 'string' && !/^https?:/i.test(out.image_url)) {
    out.image_url = resolveIn(workspace, out.image_url)
  }
  if (Array.isArray(out.edits)) {
    out.edits = out.edits.map((e: any) => (e && typeof e === 'object' ? { ...e, path: resolveIn(workspace, e.path) } : e))
  }
  if (DIRECTORY_TOOLS.has(name) && !out.path) out.path = workspace
  if (name === 'run_command' && !out.cwd) out.cwd = workspace
  for (const key of PATH_KEYS) if (out[key] === undefined) delete out[key]
  return out
}

function tail(text: string): string {
  const t = text.trimEnd()
  return t.length > MAX_STREAM_CHARS ? `[... ${t.length - MAX_STREAM_CHARS} earlier characters cut]\n${t.slice(-MAX_STREAM_CHARS)}` : t
}

function sections(stdout: string, stderr: string): string {
  const parts: string[] = []
  if (stdout.trim()) parts.push(`--- stdout ---\n${tail(stdout)}`)
  if (stderr.trim()) parts.push(`--- stderr ---\n${tail(stderr)}`)
  return parts.join('\n')
}

type ExecError = { code?: number | string | null; killed?: boolean; signal?: string | null; message?: string } | null

/** Exit code 0 is a result; anything else is an error that still carries the output. */
export function formatCommandResult(
  command: string,
  error: ExecError,
  stdout: string,
  stderr: string,
  timeoutMs = COMMAND_TIMEOUT_MS
): { result: string } | { error: string } {
  const output = sections(stdout || '', stderr || '')
  if (!error) return { result: output || 'Command completed with exit code 0 and no output.' }

  if (error.killed && (error.signal === 'SIGTERM' || error.signal === 'SIGKILL')) {
    return { error: [`Command timed out after ${Math.round(timeoutMs / 1000)} s and was stopped: ${command}`, output].filter(Boolean).join('\n') }
  }
  if (typeof error.code === 'number') {
    return { error: [`Command failed with exit code ${error.code}: ${command}`, output].filter(Boolean).join('\n') }
  }
  return { error: [`Command could not run: ${command}\n${error.message || String(error.code || 'unknown error')}`, output].filter(Boolean).join('\n') }
}

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

const PATH_KEYS = ['path', 'cwd', 'audio_path', 'archive_path', 'output_path']
/** Tools whose `path` defaults to the current directory, which should mean the workspace. */
const DIRECTORY_TOOLS = new Set([
  'list_files', 'search_files', 'search_code', 'repo_map', 'repo_search', 'read_directory_tree',
  'vscode_context',
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

function commandRecoveryHint(command: string, stdout: string, stderr: string): string {
  const text = `${command}\n${stdout}\n${stderr}`.toLowerCase()
  if (/enoent|not recognized|command not found|is not recognized/.test(text)) return 'Recovery: check the command name, package scripts, or PATH; prefer npm scripts listed in package.json when available.'
  if (/npm err! missing script|missing script:/.test(text)) return 'Recovery: run npm run to list available scripts, then use the closest project-defined script.'
  if (/module not found|cannot find module|failed to resolve import/.test(text)) return 'Recovery: inspect package.json and the import path; install only if the dependency is intentionally missing.'
  if (/eaddrinuse|address already in use|port .* already in use/.test(text)) return 'Recovery: choose another port or stop the existing dev server before retrying.'
  if (/permission denied|access is denied|eperm|eacces/.test(text)) return 'Recovery: the file may be locked or require different permissions; close the owning app or choose a writable path.'
  if (/tests? failed|failed tests?|assertionerror|expected .* received/.test(text)) return 'Recovery: fix the first failing assertion, then rerun the narrowest failing test before the full suite.'
  if (/typescript|tsc|type error|does not exist on type|is not assignable/.test(text)) return 'Recovery: treat this as a type contract failure; inspect the referenced file and update types with the implementation.'
  if (/timed out|timeout/.test(text)) return 'Recovery: narrow the command, run a targeted test, or use the interactive terminal for long-running servers.'
  return 'Recovery: read the stderr/stdout above, adjust the command or code, and retry with a narrower verification command.'
}

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
    return { error: [`Command timed out after ${Math.round(timeoutMs / 1000)} s and was stopped: ${command}`, output, commandRecoveryHint(command, stdout, stderr)].filter(Boolean).join('\n') }
  }
  if (typeof error.code === 'number') {
    return { error: [`Command failed with exit code ${error.code}: ${command}`, output, commandRecoveryHint(command, stdout, stderr)].filter(Boolean).join('\n') }
  }
  return { error: [`Command could not run: ${command}\n${error.message || String(error.code || 'unknown error')}`, output, commandRecoveryHint(command, stdout, stderr)].filter(Boolean).join('\n') }
}

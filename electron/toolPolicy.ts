/**
 * Technical policy for agent tools. The model prompt is advisory; this module is enforced
 * in the Electron main process before a tool can touch the user's machine.
 */
import path from 'path'
import fs from 'fs'
import { normalizeBrowserOperation, safeBrowserUrlLabel } from './browserToolValidation'

export type PermissionMode = 'always' | 'ask-risky' | 'auto' | 'ask-all-writes' | 'trusted'
export type ToolRisk = 'read' | 'write' | 'dangerous'
export type WorkingMode = 'plan' | 'build' | 'multitask' | 'ask' | 'review' | 'debug'

export type ToolPolicyDecision = {
  risk: ToolRisk
  needsApproval: boolean
  reason: string
  targets: string[]
  outsideWorkspace: string[]
  restrictedCommandBlocked?: boolean
  restrictedCommandReason?: string
  browserToolBlocked?: boolean
  previewRequired?: boolean
}

const RESTRICTED_COMMAND_PATTERNS: Array<[RegExp, string]> = [
  [/(?:^|\s)(?:curl|wget|fetch|ftp|nc|netcat|ssh|scp|git\s+(?:clone|fetch|pull|push)|docker\s+pull)\b|\b(?:invoke-webrequest|invoke-restmethod|iwr|irm)\b/i, 'network access is blocked'],
  [/(?:npm|pnpm|yarn|bun)\s+(?:install|i|ci|add|update|upgrade|uninstall|remove)\b|\bpip(?:3)?\s+install\b|\bcargo\s+add\b|\bgo\s+get\b/i, 'package installation or dependency changes are blocked'],
  [/(?:^|[;&|\n])\s*(?:cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh|bash|sh|zsh|fish)\s+(?:\/c|-c|\/k|-Command)\b|\bsudo\b|\b(?:start|explorer)\s+/i, 'nested shells and privilege/process escape are blocked'],
  [/[;&|<>`\n]|\$\(|\$\{|\*\*\//, 'shell chaining, expansion, or redirection is blocked'],
]

export function assessRestrictedCommand(command: unknown, workspace: string | undefined, cwd: unknown): { blocked: boolean; reason?: string } {
  if (typeof command !== 'string' || !command.trim()) return { blocked: true, reason: 'a non-empty command is required' }
  if (!workspace) return { blocked: true, reason: 'an open workspace is required' }
  if (typeof cwd !== 'string' || !isPathInsideWorkspace(workspace, cwd)) return { blocked: true, reason: 'the command cwd must stay inside the open workspace' }
  const match = RESTRICTED_COMMAND_PATTERNS.find(([pattern]) => pattern.test(command))
  return match ? { blocked: true, reason: match[1] } : { blocked: false }
}

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'create_file', 'multi_file_edit', 'archive_extract', 'vscode_apply_edit', 'spreadsheet_write'])
const DANGEROUS_TOOLS = new Set([
  'delete_file', 'run_command', 'git_commit', 'git_branch', 'git_stash',
  'git_undo_last', 'git_discard_changes', 'vscode_command', 'api_request', 'browser',
  // Data reads can expose sensitive local or remote records, so they retain
  // the dangerous-tool approval path even though they do not mutate files.
  'sqlite_query', 'postgres_query', 'spreadsheet_read', 'spreadsheet_write', 'pdf_extract_text', 'ocr_image',
])

export function isPathInsideWorkspace(workspace: string, target: string): boolean {
  if (!workspace || !target) return false
  const root = path.resolve(workspace)
  const resolved = path.resolve(target)
  const relative = path.relative(root, resolved)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** Resolve symlinks/junctions through the nearest existing parent before allowing a mutation. */
export async function resolvesInsideWorkspace(workspace: string, target: string): Promise<boolean> {
  if (!isPathInsideWorkspace(workspace, target)) return false
  let root: string
  try { root = await fs.promises.realpath(path.resolve(workspace)) } catch { return false }

  let cursor = path.resolve(target)
  const missing: string[] = []
  while (true) {
    try {
      const existing = await fs.promises.realpath(cursor)
      return isPathInsideWorkspace(root, path.resolve(existing, ...missing))
    } catch (err: any) {
      if (err?.code !== 'ENOENT') return false
      const parent = path.dirname(cursor)
      if (parent === cursor) return false
      missing.unshift(path.basename(cursor))
      cursor = parent
    }
  }
}

export function toolTargets(name: string, args: Record<string, any>): string[] {
  const targets: string[] = []
  if (typeof args.path === 'string') targets.push(args.path)
  if (typeof args.cwd === 'string') targets.push(args.cwd)
  if (typeof args.audio_path === 'string') targets.push(args.audio_path)
  if (typeof args.archive_path === 'string') targets.push(args.archive_path)
  if (typeof args.output_path === 'string') targets.push(args.output_path)
  if (typeof args.database_path === 'string') targets.push(args.database_path)
  if (typeof args.image_url === 'string' && !/^https?:/i.test(args.image_url)) targets.push(args.image_url)
  if (Array.isArray(args.edits)) {
    for (const edit of args.edits) if (typeof edit?.path === 'string') targets.push(edit.path)
  }
  if (name.startsWith('git_') && typeof args.path === 'string') targets.push(args.path)
  return [...new Set(targets)]
}

export function checkpointTargets(name: string, args: Record<string, any>): string[] {
  if (WRITE_TOOLS.has(name) || name === 'delete_file') return toolTargets(name, args)
  return []
}

export function assessToolPolicy(
  name: string,
  args: Record<string, any>,
  workspace: string | undefined,
  mode: PermissionMode = 'ask-risky',
  restrictedCommandMode = false,
  browserToolEnabled: unknown = false,
  workingMode: WorkingMode = 'build'
): ToolPolicyDecision {
  const targets = toolTargets(name, args)
  const outsideWorkspace = workspace ? targets.filter((target) => !isPathInsideWorkspace(workspace, target)) : []
  let risk: ToolRisk = 'read'
  if (WRITE_TOOLS.has(name)) risk = 'write'
  if (DANGEROUS_TOOLS.has(name)) risk = 'dangerous'

  const alwaysAsk = mode === 'always' || mode === 'ask-all-writes'
  const legacyTrusted = mode === 'trusted'
  const previewRequired = name === 'run_command' || WRITE_TOOLS.has(name) || name === 'delete_file'
  const needsApproval = !legacyTrusted && (
    outsideWorkspace.length > 0 ||
    risk === 'dangerous' ||
    (alwaysAsk && risk !== 'read')
  )
  const restricted = name === 'run_command' && restrictedCommandMode
    ? assessRestrictedCommand(args.command, workspace, args.cwd)
    : { blocked: false }

  if ((workingMode === 'plan' || workingMode === 'ask' || workingMode === 'review') && risk !== 'read') {
    return { risk, needsApproval: false, reason: workingMode[0].toUpperCase() + workingMode.slice(1) + ' mode is read-only and cannot run ' + risk + '-risk tools.', targets, outsideWorkspace, previewRequired }
  }

  const reason = outsideWorkspace.length > 0
    ? `Accesses ${outsideWorkspace.length} path${outsideWorkspace.length === 1 ? '' : 's'} outside the open workspace.`
    : name === 'browser'
      ? 'This action opens remote web content and may return page text or a screenshot.'
    : risk === 'dangerous'
      ? ['sqlite_query', 'postgres_query', 'spreadsheet_read', 'spreadsheet_write', 'pdf_extract_text', 'ocr_image'].includes(name)
        ? 'This action can expose local or remote data and requires explicit approval.'
        : 'This action can run commands, delete data, or change Git history.'
      : risk === 'write'
        ? 'This action changes workspace files.'
        : 'Read-only workspace access.'

  return {
    risk, needsApproval, reason, targets, outsideWorkspace,
    restrictedCommandBlocked: restricted.blocked,
    restrictedCommandReason: restricted.reason,
    browserToolBlocked: name === 'browser' && browserToolEnabled !== true,
    previewRequired,
  }
}

export function toolApprovalDetail(name: string, args: Record<string, any>, decision: ToolPolicyDecision): string {
  // Approval text must never echo a password-bearing Postgres URL or a token.
  const redact = (value: unknown) => String(value || '')
    .replace(/(postgres(?:ql)?:\/\/[^/:@]+):[^@/]*@/ig, '$1:[redacted]@')
    .replace(/((?:password|pass|pwd|token|secret)\s*=\s*)[^\s&;]+/ig, '$1[redacted]')
  const detail = name === 'run_command'
    ? String(args.command || '')
    : name === 'api_request'
      ? `${String(args.method || 'GET').toUpperCase()} ${String(args.url || '')}`
      : name === 'browser'
        ? `${normalizeBrowserOperation(args.operation) || 'unsupported operation'} ${typeof args.url === 'string' ? safeBrowserUrlLabel(args.url) : '(current session page)'}`
        : name === 'postgres_query'
          ? `${redact(args.connection_string || `${args.user || ''}@${args.host || ''}/${args.database || ''}`)}\n${String(args.query || '').slice(0, 1200)}`
          : name === 'sqlite_query'
            ? `${String(args.path || '')}\n${String(args.query || '').slice(0, 1200)}`
            : decision.targets.join('\n').slice(0, 1200)
  return [`Tool: ${name}`, decision.reason, detail].filter(Boolean).join('\n\n')
}

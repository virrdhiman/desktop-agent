/**
 * Technical policy for agent tools. The model prompt is advisory; this module is enforced
 * in the Electron main process before a tool can touch the user's machine.
 */
import path from 'path'
import fs from 'fs'

export type PermissionMode = 'ask-risky' | 'ask-all-writes' | 'trusted'
export type ToolRisk = 'read' | 'write' | 'dangerous'

export type ToolPolicyDecision = {
  risk: ToolRisk
  needsApproval: boolean
  reason: string
  targets: string[]
  outsideWorkspace: string[]
}

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'create_file', 'multi_file_edit', 'archive_extract'])
const DANGEROUS_TOOLS = new Set([
  'delete_file', 'run_command', 'git_commit', 'git_branch', 'git_stash',
  'git_undo_last', 'git_discard_changes',
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
  mode: PermissionMode = 'ask-risky'
): ToolPolicyDecision {
  const targets = toolTargets(name, args)
  const outsideWorkspace = workspace ? targets.filter((target) => !isPathInsideWorkspace(workspace, target)) : []
  let risk: ToolRisk = 'read'
  if (WRITE_TOOLS.has(name)) risk = 'write'
  if (DANGEROUS_TOOLS.has(name)) risk = 'dangerous'

  const needsApproval = mode !== 'trusted' && (
    outsideWorkspace.length > 0 ||
    risk === 'dangerous' ||
    (mode === 'ask-all-writes' && risk === 'write')
  )

  const reason = outsideWorkspace.length > 0
    ? `Accesses ${outsideWorkspace.length} path${outsideWorkspace.length === 1 ? '' : 's'} outside the open workspace.`
    : risk === 'dangerous'
      ? 'This action can run commands, delete data, or change Git history.'
      : risk === 'write'
        ? 'This action changes workspace files.'
        : 'Read-only workspace access.'

  return { risk, needsApproval, reason, targets, outsideWorkspace }
}

export function toolApprovalDetail(name: string, args: Record<string, any>, decision: ToolPolicyDecision): string {
  const detail = name === 'run_command'
    ? String(args.command || '').slice(0, 800)
    : decision.targets.join('\n').slice(0, 1200)
  return [`Tool: ${name}`, decision.reason, detail].filter(Boolean).join('\n\n')
}

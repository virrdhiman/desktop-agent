import fs from 'fs'
import path from 'path'

export type VsCodeBridgeState = {
  version: 1
  workspacePath: string
  updatedAt: number
  activeFile?: string
  activeLanguage?: string
  selection?: {
    text: string
    startLine: number
    startColumn: number
    endLine: number
    endColumn: number
  }
  visibleFiles: string[]
  openFiles: string[]
}

const BRIDGE_FILE = path.join('.vd-agent', 'vscode-bridge.json')

function inside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

function relativeOrNull(root: string, file: unknown): string | undefined {
  if (typeof file !== 'string' || !file) return undefined
  if (!inside(root, file)) return undefined
  return path.relative(root, file).replace(/\\/g, '/')
}

export async function loadVsCodeBridgeState(workspace: string): Promise<VsCodeBridgeState | null> {
  const root = path.resolve(workspace)
  const file = path.join(root, BRIDGE_FILE)
  const raw = await fs.promises.readFile(file, 'utf8').catch(() => '')
  if (!raw) return null
  const parsed = JSON.parse(raw) as VsCodeBridgeState
  if (parsed.version !== 1) return null
  if (!inside(root, parsed.workspacePath)) return null
  return {
    version: 1,
    workspacePath: root,
    updatedAt: Number(parsed.updatedAt || 0),
    activeFile: relativeOrNull(root, parsed.activeFile),
    activeLanguage: typeof parsed.activeLanguage === 'string' ? parsed.activeLanguage : undefined,
    selection: sanitizeSelection(parsed.selection),
    visibleFiles: Array.isArray(parsed.visibleFiles) ? parsed.visibleFiles.flatMap((item) => relativeOrNull(root, item) || []) : [],
    openFiles: Array.isArray(parsed.openFiles) ? parsed.openFiles.flatMap((item) => relativeOrNull(root, item) || []) : [],
  }
}

export async function formatVsCodeContext(workspace: string): Promise<string> {
  const state = await loadVsCodeBridgeState(workspace)
  if (!state) {
    return [
      'No VS Code bridge state found.',
      'Install the VD Agent Bridge VS Code extension from vscode-extension/ and run "VD Agent: Export Workspace Context".',
    ].join('\n')
  }
  const ageSeconds = state.updatedAt ? Math.max(0, Math.round((Date.now() - state.updatedAt) / 1000)) : null
  const lines = [
    'VS Code bridge context',
    `Updated: ${state.updatedAt ? new Date(state.updatedAt).toISOString() : 'unknown'}${ageSeconds == null ? '' : ` (${ageSeconds}s ago)`}`,
    `Active file: ${state.activeFile || 'none'}`,
    `Active language: ${state.activeLanguage || 'unknown'}`,
    `Visible files: ${state.visibleFiles.length ? state.visibleFiles.join(', ') : 'none'}`,
    `Open files: ${state.openFiles.length ? state.openFiles.slice(0, 40).join(', ') : 'none'}`,
  ]
  if (state.selection?.text) {
    lines.push([
      `Selection ${state.selection.startLine}:${state.selection.startColumn}-${state.selection.endLine}:${state.selection.endColumn}:`,
      state.selection.text.slice(0, 8_000),
    ].join('\n'))
  }
  return lines.join('\n')
}

function sanitizeSelection(selection: unknown): VsCodeBridgeState['selection'] | undefined {
  if (!selection || typeof selection !== 'object') return undefined
  const value = selection as Record<string, unknown>
  const text = typeof value.text === 'string' ? value.text.slice(0, 20_000) : ''
  return {
    text,
    startLine: Number(value.startLine || 1),
    startColumn: Number(value.startColumn || 1),
    endLine: Number(value.endLine || 1),
    endColumn: Number(value.endColumn || 1),
  }
}

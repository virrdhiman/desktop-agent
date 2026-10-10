import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'

export type VsCodeBridgeState = {
  version: 1
  mode?: 'trusted' | 'limited'
  workspaceTrusted?: boolean
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
  index?: {
    updatedAt: number
    files: number
    symbols: number
    imports?: number
    dependencies?: number
    snippets?: number
    semanticFiles?: number
    bytes?: number
  }
  ai?: {
    provider: string
    baseUrl: string
    model: string
    ok: boolean
    checkedAt: number
    latencyMs: number
    models: string[]
    message: string
    inline?: { ai: number; local: number; failed: number; lastLatencyMs: number; lastAt: number }
  }
  preview?: {
    file: string
    preview: string
    createdAt: number
    updatedAt: number
    hunks: number
    additions: number
    deletions: number
  }
}

const BRIDGE_FILE = path.join('.vd-agent', 'vscode-bridge.json')
const COMMAND_DIR = path.join('.vd-agent', 'commands')
const RESULT_DIR = path.join('.vd-agent', 'command-results')
const LAST_COMMAND_FILE = path.join('.vd-agent', 'vscode-last-command.json')
const DEFAULT_COMMAND_TIMEOUT_MS = 8_000
const VSCODE_DOWNLOAD_URL = 'https://code.visualstudio.com/Download'
const VSIX_NAME = 'vd-agent-vscode-bridge-0.4.5.vsix'
const execFileAsync = promisify(execFile)

type VsCodeBridgeCommand = {
  action: 'open_file' | 'apply_edit' | 'show_diff' | 'run_command'
  args: Record<string, unknown>
}

export type VsCodeBridgeCommandResult = {
  id: string
  updatedAt: number
  ok: boolean
  message: string
  action?: string
}

export type VsCodeBridgeStatus = {
  connected: boolean
  bridgeFile: string
  commandsPending: number
  state: VsCodeBridgeState | null
  lastResult?: VsCodeBridgeCommandResult
  ageSeconds?: number
  setup: VsCodeBridgeSetup
  message: string
}

export type VsCodeBridgeSetup = {
  vscodeAvailable: boolean
  vscodeCommand?: string
  vscodeVersion?: string
  vsixPath: string
  installReady: boolean
  installCommand?: string
  downloadUrl: string
  message: string
}

let setupCache: { at: number; value: Promise<VsCodeBridgeSetup> } | null = null

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
    mode: parsed.mode === 'limited' ? 'limited' : 'trusted',
    workspaceTrusted: parsed.workspaceTrusted !== false,
    workspacePath: root,
    updatedAt: Number(parsed.updatedAt || 0),
    activeFile: relativeOrNull(root, parsed.activeFile),
    activeLanguage: typeof parsed.activeLanguage === 'string' ? parsed.activeLanguage : undefined,
    selection: sanitizeSelection(parsed.selection),
    visibleFiles: Array.isArray(parsed.visibleFiles) ? parsed.visibleFiles.flatMap((item) => relativeOrNull(root, item) || []) : [],
    openFiles: Array.isArray(parsed.openFiles) ? parsed.openFiles.flatMap((item) => relativeOrNull(root, item) || []) : [],
    index: sanitizeIndex(parsed.index),
    ai: sanitizeAi(parsed.ai),
    preview: sanitizePreview(root, parsed.preview),
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
    `Mode: ${state.workspaceTrusted === false || state.mode === 'limited' ? 'limited restricted-workspace mode' : 'trusted workspace'}`,
    `Active file: ${state.activeFile || 'none'}`,
    `Active language: ${state.activeLanguage || 'unknown'}`,
    `Visible files: ${state.visibleFiles.length ? state.visibleFiles.join(', ') : 'none'}`,
    `Open files: ${state.openFiles.length ? state.openFiles.slice(0, 40).join(', ') : 'none'}`,
    `VS Code local index: ${state.index ? `${state.index.files} files, ${state.index.symbols} symbols, ${state.index.imports || 0} imports, ${state.index.dependencies || 0} dependency links, ${state.index.snippets || 0} snippets, ${state.index.semanticFiles || 0} semantic files, updated ${new Date(state.index.updatedAt).toISOString()}` : 'not available'}`,
    `VS Code AI: ${state.ai ? `${state.ai.ok ? 'ready' : 'not ready'}, ${state.ai.provider}, ${state.ai.model}, ${state.ai.message}` : 'not exported yet'}`,
    `VS Code preview: ${state.preview ? `${state.preview.file}, ${state.preview.hunks} hunks, +${state.preview.additions}/-${state.preview.deletions}` : 'none'}`,
  ]
  if (state.selection?.text) {
    lines.push([
      `Selection ${state.selection.startLine}:${state.selection.startColumn}-${state.selection.endLine}:${state.selection.endColumn}:`,
      state.selection.text.slice(0, 8_000),
    ].join('\n'))
  }
  return lines.join('\n')
}

export async function readVsCodeBridgeStatus(workspace: string): Promise<VsCodeBridgeStatus> {
  const root = path.resolve(workspace)
  const setup = await resolveVsCodeBridgeSetup()
  const state = await loadVsCodeBridgeState(root)
  const commandDir = path.join(root, COMMAND_DIR)
  const commandsPending = (await fs.promises.readdir(commandDir).catch(() => []))
    .filter((entry) => entry.endsWith('.json')).length
  const lastResult = await readJson<VsCodeBridgeCommandResult>(path.join(root, LAST_COMMAND_FILE))
  const ageSeconds = state?.updatedAt ? Math.max(0, Math.round((Date.now() - state.updatedAt) / 1000)) : undefined
  return {
    connected: !!state,
    bridgeFile: path.join(root, BRIDGE_FILE),
    commandsPending,
    state,
    lastResult: sanitizeCommandResult(lastResult),
    ageSeconds,
    setup,
    message: state
      ? `Connected${ageSeconds == null ? '' : `, exported ${ageSeconds}s ago`}.`
      : setup.vscodeAvailable
        ? 'Not connected. Install the VD Agent Bridge, open this workspace in VS Code, then run "VD Agent: Export Workspace Context". Restricted Mode supports active-editor export/autocomplete; trust the workspace for indexing and edit/apply commands.'
        : 'Not connected. Install VS Code first, then install the free local VD Agent Bridge.',
  }
}

export async function installVsCodeBridge(): Promise<string> {
  const setup = await resolveVsCodeBridgeSetup(true)
  if (!setup.vscodeCommand) {
    throw new Error('VS Code CLI was not found. Install VS Code, then make sure the "code" command is available.')
  }
  if (!setup.installReady) {
    throw new Error(`VS Code bridge package was not found at ${setup.vsixPath}. Run npm run vscode:package first.`)
  }
  const output = await runCodeCli(setup.vscodeCommand, ['--install-extension', setup.vsixPath, '--force'], 30_000)
  setupCache = null
  return [
    'VD Agent Bridge install command finished.',
    output || 'VS Code did not print extra output.',
    'Open this repository in VS Code, then run "VD Agent: Export Workspace Context" from the Command Palette. Restricted Mode supports active-editor export/autocomplete; trust the workspace for indexing and edit/apply commands.',
  ].join('\n')
}

export async function openWorkspaceInVsCode(workspace: string): Promise<string> {
  const setup = await resolveVsCodeBridgeSetup()
  if (!setup.vscodeCommand) {
    throw new Error('VS Code CLI was not found. Install VS Code first.')
  }
  const root = path.resolve(workspace)
  await runCodeCli(setup.vscodeCommand, [root], 15_000)
  return `Opened workspace in VS Code: ${root}`
}

export async function sendVsCodeBridgeCommand(
  workspace: string,
  command: VsCodeBridgeCommand,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS
): Promise<string> {
  const root = path.resolve(workspace)
  const id = crypto.randomUUID()
  const commandDir = path.join(root, COMMAND_DIR)
  const resultDir = path.join(root, RESULT_DIR)
  const commandPath = path.join(commandDir, `${id}.json`)
  const resultPath = path.join(resultDir, `${id}.json`)
  await fs.promises.mkdir(commandDir, { recursive: true })
  await fs.promises.mkdir(resultDir, { recursive: true })
  await fs.promises.writeFile(commandPath, `${JSON.stringify({ id, ...command, createdAt: Date.now() }, null, 2)}\n`, 'utf8')

  const result = await waitForCommandResult(resultPath, timeoutMs)
  await fs.promises.rm(resultPath, { force: true }).catch(() => {})
  if (!result) {
    return [
      `VS Code bridge command queued but no result arrived within ${Math.round(timeoutMs / 1000)}s.`,
      'Make sure the VD Agent Bridge extension is installed in the matching VS Code workspace.',
      'You can also run "VD Agent: Process Pending Bridge Commands" from the VS Code Command Palette.',
    ].join('\n')
  }
  if (!result.ok) throw new Error(result.message || 'VS Code bridge command failed.')
  return result.message || 'VS Code bridge command completed.'
}

async function waitForCommandResult(file: string, timeoutMs: number): Promise<VsCodeBridgeCommandResult | null> {
  const deadline = Date.now() + Math.max(500, timeoutMs)
  while (Date.now() < deadline) {
    const raw = await fs.promises.readFile(file, 'utf8').catch(() => '')
    if (raw) {
      const parsed = JSON.parse(raw) as VsCodeBridgeCommandResult
      if (parsed && typeof parsed.ok === 'boolean') return parsed
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return null
}

async function resolveVsCodeBridgeSetup(force = false): Promise<VsCodeBridgeSetup> {
  if (!force && setupCache && Date.now() - setupCache.at < 10_000) return setupCache.value
  setupCache = { at: Date.now(), value: detectVsCodeBridgeSetup() }
  return setupCache.value
}

async function detectVsCodeBridgeSetup(): Promise<VsCodeBridgeSetup> {
  const vsixPath = resolveVsixPath()
  const installReady = fs.existsSync(vsixPath)
  const cli = await findCodeCli()
  if (!cli) {
    return {
      vscodeAvailable: false,
      vsixPath,
      installReady,
      downloadUrl: VSCODE_DOWNLOAD_URL,
      message: 'VD Agent is installed, but VS Code CLI was not found. The VD installer does not install VS Code automatically; install VS Code for free, then reopen VD Agent or refresh this panel.',
    }
  }
  return {
    vscodeAvailable: true,
    vscodeCommand: cli.command,
    vscodeVersion: cli.version,
    vsixPath,
    installReady,
    installCommand: `code --install-extension "${vsixPath}" --force`,
    downloadUrl: VSCODE_DOWNLOAD_URL,
    message: installReady
      ? 'VS Code is available. The VD installer bundled the bridge package, but does not install it into VS Code automatically. Click Install Bridge, then open this workspace in VS Code. Restricted Mode supports active-editor export/autocomplete; trust the workspace for indexing and edit/apply commands.'
      : 'VS Code is available, but the bridge package is missing. Run npm run vscode:package.',
  }
}

async function findCodeCli(): Promise<{ command: string; version: string } | null> {
  for (const command of codeCliCandidates()) {
    const resolvedCommand = await resolveCodeCommand(command)
    if (path.isAbsolute(resolvedCommand) && !fs.existsSync(resolvedCommand)) continue
    try {
      const version = (await runCodeCli(resolvedCommand, ['--version'], 5_000)).split(/\r?\n/)[0]?.trim()
      if (version) return { command: resolvedCommand, version }
    } catch {
      // Try the next known command/location.
    }
  }
  return null
}

function codeCliCandidates(): string[] {
  const candidates = ['code', 'code-insiders']
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || ''
    const programFiles = process.env.ProgramFiles || ''
    const programFilesX86 = process.env['ProgramFiles(x86)'] || ''
    candidates.push(
      path.join(local, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
      path.join(local, 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'),
      path.join(programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'),
      path.join(programFilesX86, 'Microsoft VS Code', 'bin', 'code.cmd'),
    )
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders',
    )
  } else {
    candidates.push('/usr/local/bin/code', '/usr/bin/code', '/snap/bin/code')
  }
  return [...new Set(candidates.filter(Boolean))]
}

function resolveVsixPath(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const candidates = [
    path.join(process.cwd(), 'vscode-extension', VSIX_NAME),
    path.join(process.cwd(), 'release', VSIX_NAME),
    resourcesPath ? path.join(resourcesPath, VSIX_NAME) : '',
    resourcesPath ? path.join(resourcesPath, 'vscode-extension', VSIX_NAME) : '',
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
}

async function runCodeCli(command: string, args: string[], timeoutMs: number): Promise<string> {
  const isWindowsCommandScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
  const result = isWindowsCommandScript
    ? await execFileAsync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', [command, ...args].map(quoteCmdArg).join(' ')], {
      timeout: timeoutMs,
      windowsHide: true,
      shell: false,
      maxBuffer: 1_000_000,
    })
    : await execFileAsync(command, args, {
    timeout: timeoutMs,
    windowsHide: true,
    shell: false,
    maxBuffer: 1_000_000,
  })
  return `${result.stdout || ''}${result.stderr ? `\n${result.stderr}` : ''}`.trim()
}

async function resolveCodeCommand(command: string): Promise<string> {
  if (process.platform !== 'win32' || path.isAbsolute(command)) return command
  try {
    const result = await execFileAsync('where.exe', [command], {
      timeout: 3_000,
      windowsHide: true,
      shell: false,
      maxBuffer: 100_000,
    })
    return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || command
  } catch {
    return command
  }
}

function quoteCmdArg(value: string): string {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

async function readJson<T>(file: string): Promise<T | null> {
  const raw = await fs.promises.readFile(file, 'utf8').catch(() => '')
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function sanitizeCommandResult(result: VsCodeBridgeCommandResult | null): VsCodeBridgeCommandResult | undefined {
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') return undefined
  return {
    id: typeof result.id === 'string' ? result.id : '',
    updatedAt: Number(result.updatedAt || 0),
    ok: result.ok,
    message: typeof result.message === 'string' ? result.message.slice(0, 2_000) : '',
    action: typeof result.action === 'string' ? result.action : undefined,
  }
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

function sanitizeIndex(index: unknown): VsCodeBridgeState['index'] | undefined {
  if (!index || typeof index !== 'object') return undefined
  const value = index as Record<string, unknown>
  const updatedAt = Number(value.updatedAt || 0)
  const files = Number(value.files || 0)
  const symbols = Number(value.symbols || 0)
  if (!updatedAt && !files && !symbols) return undefined
  return {
    updatedAt,
    files,
    symbols,
    imports: Number(value.imports || 0),
    dependencies: Number(value.dependencies || 0),
    snippets: Number(value.snippets || 0),
    semanticFiles: Number(value.semanticFiles || 0),
    bytes: Number(value.bytes || 0),
  }
}

function sanitizeAi(ai: unknown): VsCodeBridgeState['ai'] | undefined {
  if (!ai || typeof ai !== 'object') return undefined
  const value = ai as Record<string, unknown>
  const inline = value.inline && typeof value.inline === 'object' ? value.inline as Record<string, unknown> : undefined
  return {
    provider: typeof value.provider === 'string' ? value.provider : '',
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
    model: typeof value.model === 'string' ? value.model : '',
    ok: Boolean(value.ok),
    checkedAt: Number(value.checkedAt || 0),
    latencyMs: Number(value.latencyMs || 0),
    models: Array.isArray(value.models) ? value.models.filter((item): item is string => typeof item === 'string').slice(0, 80) : [],
    message: typeof value.message === 'string' ? value.message.slice(0, 500) : '',
    inline: inline ? {
      ai: Number(inline.ai || 0),
      local: Number(inline.local || 0),
      failed: Number(inline.failed || 0),
      lastLatencyMs: Number(inline.lastLatencyMs || 0),
      lastAt: Number(inline.lastAt || 0),
    } : undefined,
  }
}

function sanitizePreview(root: string, preview: unknown): VsCodeBridgeState['preview'] | undefined {
  if (!preview || typeof preview !== 'object') return undefined
  const value = preview as Record<string, unknown>
  const file = typeof value.file === 'string' ? (relativeOrNull(root, value.file) || value.file) : ''
  const previewFile = typeof value.preview === 'string' ? (relativeOrNull(root, value.preview) || value.preview) : ''
  if (!file && !previewFile) return undefined
  return {
    file,
    preview: previewFile,
    createdAt: Number(value.createdAt || 0),
    updatedAt: Number(value.updatedAt || 0),
    hunks: Number(value.hunks || 0),
    additions: Number(value.additions || 0),
    deletions: Number(value.deletions || 0),
  }
}

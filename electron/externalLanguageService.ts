import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { pathToFileURL, fileURLToPath } from 'url'
import { safeWorkspaceFile, type LspDiagnostic, type LspLocation, type LspRenameResult } from './tsLanguageService'

type Json = Record<string, any>
type ServerCommand = { command: string; args: string[] }
type ServerConfig = {
  id: string
  name: string
  extensions: string[]
  envVar: string
  languageId: string
  candidates: ServerCommand[]
}

type PendingRequest = {
  resolve: (value: any) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const SERVER_CONFIGS: ServerConfig[] = [
  {
    id: 'python',
    name: 'Python',
    extensions: ['.py', '.pyw'],
    envVar: 'VD_AGENT_LSP_PYTHON',
    languageId: 'python',
    candidates: [
      { command: 'pyright-langserver', args: ['--stdio'] },
      { command: 'pylsp', args: [] },
    ],
  },
  {
    id: 'go',
    name: 'Go',
    extensions: ['.go'],
    envVar: 'VD_AGENT_LSP_GO',
    languageId: 'go',
    candidates: [{ command: 'gopls', args: ['serve'] }],
  },
  {
    id: 'rust',
    name: 'Rust',
    extensions: ['.rs'],
    envVar: 'VD_AGENT_LSP_RUST',
    languageId: 'rust',
    candidates: [{ command: 'rust-analyzer', args: [] }],
  },
  {
    id: 'clangd',
    name: 'C/C++',
    extensions: ['.c', '.cc', '.cpp', '.cxx', '.h', '.hpp', '.hxx'],
    envVar: 'VD_AGENT_LSP_CLANGD',
    languageId: 'cpp',
    candidates: [{ command: 'clangd', args: ['--background-index'] }],
  },
  {
    id: 'csharp',
    name: 'C#',
    extensions: ['.cs'],
    envVar: 'VD_AGENT_LSP_CSHARP',
    languageId: 'csharp',
    candidates: [
      { command: 'csharp-ls', args: [] },
      { command: 'omnisharp', args: ['--languageserver'] },
    ],
  },
]

const missingServerCache = new Map<string, boolean>()

export function externalConfigForFile(file: string): ServerConfig | null {
  const ext = path.extname(file).toLowerCase()
  return SERVER_CONFIGS.find((config) => config.extensions.includes(ext)) || null
}

export function supportsExternalLsp(file: string): boolean {
  return !!externalConfigForFile(file)
}

export async function externalDiagnostics(root: string, file: string): Promise<LspDiagnostic[] | { error: string }> {
  const session = await openSession(root, file)
  if (!session) return []
  try {
    const diagnostics = await session.waitForDiagnostics(900)
    return diagnostics.slice(0, 80)
  } finally {
    session.close()
  }
}

export async function externalDefinition(root: string, file: string, line: number, column: number): Promise<LspLocation | null | { error: string }> {
  const session = await openSession(root, file)
  if (!session) return null
  try {
    const result = await session.request('textDocument/definition', {
      textDocument: { uri: pathToFileURL(path.resolve(file)).href },
      position: toPosition(line, column),
    }, 8_000)
    return session.firstLocation(result)
  } finally {
    session.close()
  }
}

export async function externalReferences(root: string, file: string, line: number, column: number): Promise<LspLocation[] | { error: string }> {
  const session = await openSession(root, file)
  if (!session) return []
  try {
    const result = await session.request('textDocument/references', {
      textDocument: { uri: pathToFileURL(path.resolve(file)).href },
      position: toPosition(line, column),
      context: { includeDeclaration: true },
    }, 8_000)
    return session.locations(result).slice(0, 250)
  } finally {
    session.close()
  }
}

export async function externalRename(root: string, file: string, line: number, column: number, newName: string): Promise<LspRenameResult | { error: string }> {
  if (!/^[A-Za-z_$][\w$]*$/.test(newName)) return { error: 'Invalid identifier' }
  const session = await openSession(root, file)
  if (!session) {
    const config = externalConfigForFile(file)
    return { error: config ? `${config.name} language server is not installed or not on PATH.` : 'No language server is configured for this file type.' }
  }
  try {
    const edit = await session.request('textDocument/rename', {
      textDocument: { uri: pathToFileURL(path.resolve(file)).href },
      position: toPosition(line, column),
      newName,
    }, 8_000)
    return await applyWorkspaceEdit(root, edit)
  } finally {
    session.close()
  }
}

async function openSession(root: string, file: string): Promise<LspSession | null> {
  if (!safeWorkspaceFile(root, file)) return null
  const config = externalConfigForFile(file)
  if (!config) return null
  const command = resolveConfiguredCommand(config) || resolveCandidate(config)
  if (!command) return null
  const session = new LspSession(config, command, root, file)
  try {
    await session.start()
    return session
  } catch {
    session.close()
    return null
  }
}

function resolveConfiguredCommand(config: ServerConfig): ServerCommand | null {
  const raw = process.env[config.envVar]?.trim()
  if (!raw) return null
  const parts = splitCommand(raw)
  return parts.length ? { command: parts[0], args: parts.slice(1) } : null
}

function resolveCandidate(config: ServerConfig): ServerCommand | null {
  if (missingServerCache.get(config.id)) return null
  const found = config.candidates.find((candidate) => commandExists(candidate.command))
  if (!found) missingServerCache.set(config.id, true)
  return found || null
}

function commandExists(command: string): boolean {
  if (command.includes(path.sep) || (path.sep === '\\' && command.includes('/'))) return fs.existsSync(command)
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : ['']
  return pathDirs.some((dir) => exts.some((ext) => fs.existsSync(path.join(dir, `${command}${ext}`))))
}

function splitCommand(raw: string): string[] {
  const parts: string[] = []
  raw.replace(/"([^"]+)"|'([^']+)'|(\S+)/g, (_match, doubleQuoted, singleQuoted, bare) => {
    parts.push(doubleQuoted || singleQuoted || bare)
    return ''
  })
  return parts
}

function toPosition(line: number, column: number) {
  return { line: Math.max(0, line - 1), character: Math.max(0, column - 1) }
}

class LspSession {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private buffer = Buffer.alloc(0)
  private pending = new Map<number, PendingRequest>()
  private diagnostics = new Map<string, LspDiagnostic[]>()
  private fileText = ''
  private fileUri = ''

  constructor(
    private readonly config: ServerConfig,
    private readonly command: ServerCommand,
    private readonly root: string,
    private readonly file: string,
  ) {}

  async start() {
    this.fileText = await fs.promises.readFile(this.file, 'utf8')
    this.fileUri = pathToFileURL(path.resolve(this.file)).href
    this.child = spawn(this.command.command, this.command.args, {
      cwd: this.root,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    })
    this.child.stdout.on('data', (chunk) => this.onData(chunk))
    this.child.stdin.on('error', () => {})
    this.child.on('exit', () => this.rejectAll(new Error(`${this.config.name} language server exited`)))
    this.child.on('error', (error) => this.rejectAll(error))

    await this.request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(path.resolve(this.root)).href,
      workspaceFolders: [{ uri: pathToFileURL(path.resolve(this.root)).href, name: path.basename(this.root) }],
      capabilities: {
        textDocument: {
          synchronization: { didOpen: true },
          definition: { linkSupport: true },
          references: {},
          rename: { prepareSupport: false },
          publishDiagnostics: { relatedInformation: true },
        },
        workspace: { applyEdit: false, workspaceEdit: { documentChanges: true } },
      },
      initializationOptions: {},
    }, 8_000)
    this.notify('initialized', {})
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri: this.fileUri,
        languageId: this.config.languageId,
        version: 1,
        text: this.fileText,
      },
    })
  }

  request(method: string, params: Json, timeoutMs: number): Promise<any> {
    if (!this.child) return Promise.reject(new Error('Language server is not running'))
    const id = this.nextId++
    const message = { jsonrpc: '2.0', id, method, params }
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
    })
    this.write(message)
    return promise
  }

  notify(method: string, params: Json) {
    this.write({ jsonrpc: '2.0', method, params })
  }

  waitForDiagnostics(ms: number): Promise<LspDiagnostic[]> {
    return new Promise((resolve) => setTimeout(() => resolve(this.diagnostics.get(this.fileUri) || []), ms))
  }

  firstLocation(value: any): LspLocation | null {
    return this.locations(value)[0] || null
  }

  locations(value: any): LspLocation[] {
    const items = Array.isArray(value) ? value : value ? [value] : []
    return items.flatMap((item) => {
      const uri = item.uri || item.targetUri
      const range = item.range || item.targetSelectionRange || item.targetRange
      if (!uri || !range) return []
      const file = uriToPath(uri)
      if (!file || !safeWorkspaceFile(this.root, file)) return []
      return [locationFromRange(file, range)]
    })
  }

  close() {
    for (const pending of this.pending.values()) clearTimeout(pending.timer)
    this.pending.clear()
    try { this.notify('textDocument/didClose', { textDocument: { uri: this.fileUri } }) } catch {}
    try { this.child?.kill() } catch {}
    this.child = null
  }

  private write(message: Json) {
    const body = Buffer.from(JSON.stringify(message), 'utf8')
    this.child?.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.child?.stdin.write(body)
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const header = this.buffer.slice(0, headerEnd).toString('utf8')
      const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1] || 0)
      if (!length || this.buffer.length < headerEnd + 4 + length) return
      const body = this.buffer.slice(headerEnd + 4, headerEnd + 4 + length).toString('utf8')
      this.buffer = this.buffer.slice(headerEnd + 4 + length)
      this.handleMessage(JSON.parse(body))
    }
  }

  private handleMessage(message: Json) {
    if (message.method === 'textDocument/publishDiagnostics') {
      const uri = message.params?.uri
      if (uri) this.diagnostics.set(uri, diagnosticsFromPublish(uri, message.params?.diagnostics || []))
      return
    }
    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)!
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(message.error.message || 'Language server request failed'))
      else pending.resolve(message.result)
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function diagnosticsFromPublish(uri: string, diagnostics: Json[]): LspDiagnostic[] {
  const file = uriToPath(uri)
  if (!file) return []
  return diagnostics.map((diag) => {
    const range = diag.range || { start: { line: 0, character: 0 } }
    return {
      ...locationFromRange(file, range),
      message: String(diag.message || ''),
      severity: diag.severity === 1 ? 'error' : diag.severity === 2 ? 'warning' : 'info',
    }
  })
}

function locationFromRange(file: string, range: Json): LspLocation {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const line = Number(range.start?.line || 0)
  const character = Number(range.start?.character || 0)
  return {
    path: path.resolve(file),
    line: line + 1,
    column: character + 1,
    preview: text.split(/\r?\n/)[line]?.trim() || '',
  }
}

async function applyWorkspaceEdit(root: string, edit: Json | null): Promise<LspRenameResult> {
  const changes = collectTextEdits(edit)
  const updatedFiles: string[] = []
  const errors: LspRenameResult['errors'] = []
  let replacements = 0
  for (const [target, edits] of changes) {
    if (!safeWorkspaceFile(root, target)) continue
    try {
      let text = await fs.promises.readFile(target, 'utf8')
      for (const item of edits.sort((a, b) => rangeOffset(text, b.range.start) - rangeOffset(text, a.range.start))) {
        const start = rangeOffset(text, item.range.start)
        const end = rangeOffset(text, item.range.end)
        text = `${text.slice(0, start)}${item.newText || ''}${text.slice(end)}`
        replacements++
      }
      await fs.promises.writeFile(target, text, 'utf8')
      updatedFiles.push(path.resolve(target))
    } catch (err: any) {
      errors.push({ path: target, error: err?.message || String(err) })
    }
  }
  return { replacements, updatedFiles, errors }
}

function collectTextEdits(edit: Json | null): Map<string, Json[]> {
  const byFile = new Map<string, Json[]>()
  const add = (uri: string, textEdits: Json[]) => {
    const file = uriToPath(uri)
    if (!file) return
    byFile.set(file, [...(byFile.get(file) || []), ...textEdits])
  }
  for (const [uri, textEdits] of Object.entries(edit?.changes || {})) add(uri, textEdits as Json[])
  for (const change of edit?.documentChanges || []) {
    if (change.kind === 'rename' || change.kind === 'create' || change.kind === 'delete') continue
    const uri = change.textDocument?.uri || change.uri
    if (uri && Array.isArray(change.edits)) add(uri, change.edits)
  }
  return byFile
}

function rangeOffset(text: string, position: Json): number {
  const targetLine = Number(position?.line || 0)
  const targetChar = Number(position?.character || 0)
  let offset = 0
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < targetLine && i < lines.length; i++) offset += lines[i].length + 1
  return Math.min(text.length, offset + targetChar)
}

function uriToPath(uri: string): string | null {
  try { return fileURLToPath(uri) } catch { return null }
}

export const externalLanguageServerHelp = SERVER_CONFIGS.map((config) => ({
  language: config.name,
  envVar: config.envVar,
  commands: config.candidates.map((candidate) => [candidate.command, ...candidate.args].join(' ')),
}))

if (os.platform() === 'win32') {
  // Keep the import live for Windows builds where path casing can differ in file URLs.
  void os.EOL
}

const fs = require('fs')
const path = require('path')
const vscode = require('vscode')

const BRIDGE_DIR = '.vd-agent'
const BRIDGE_FILE = 'vscode-bridge.json'
const COMMAND_DIR = path.join(BRIDGE_DIR, 'commands')
const RESULT_DIR = path.join(BRIDGE_DIR, 'command-results')
const LAST_COMMAND_FILE = 'vscode-last-command.json'
const INDEX_FILE = 'vscode-index.json'
const LAST_PREVIEW_FILE = 'vscode-last-preview.json'
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.scss', '.html',
  '.py', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.rb', '.php', '.sh', '.ps1', '.sql', '.yaml', '.yml', '.toml', '.ini',
])
const MAX_FILE_BYTES = 300000

let exportTimer
let indexTimer
let latestIndex = null
let statusBar
const processing = new Set()

function activate(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80)
  statusBar.command = 'vdAgent.showStatus'
  context.subscriptions.push(statusBar)

  context.subscriptions.push(
    vscode.commands.registerCommand('vdAgent.exportContext', async () => {
      const target = await exportContext()
      if (target) vscode.window.showInformationMessage(`VD Agent context exported: ${vscode.workspace.asRelativePath(target)}`)
    }),
    vscode.commands.registerCommand('vdAgent.openBridgeFile', async () => {
      const target = await exportContext()
      if (target) vscode.window.showTextDocument(vscode.Uri.file(target))
    }),
    vscode.commands.registerCommand('vdAgent.processCommands', async () => {
      await processAllCommands()
      vscode.window.showInformationMessage('VD Agent bridge commands processed.')
    }),
    vscode.commands.registerCommand('vdAgent.rebuildIndex', async () => {
      const target = await rebuildIndex()
      if (target) vscode.window.showInformationMessage(`VD Agent local index rebuilt: ${vscode.workspace.asRelativePath(target)}`)
    }),
    vscode.commands.registerCommand('vdAgent.openIndexFile', async () => {
      const target = await rebuildIndex()
      if (target) vscode.window.showTextDocument(vscode.Uri.file(target))
    }),
    vscode.commands.registerCommand('vdAgent.acceptLastPreview', acceptLastPreview),
    vscode.commands.registerCommand('vdAgent.rejectLastPreview', rejectLastPreview),
    vscode.commands.registerCommand('vdAgent.showStatus', showBridgeStatus),
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**/*' }, {
      provideInlineCompletionItems(document, position) {
        return provideLocalInlineCompletions(document, position)
      },
    }),
    vscode.window.onDidChangeActiveTextEditor(scheduleExport),
    vscode.window.onDidChangeTextEditorSelection(scheduleExport),
    vscode.workspace.onDidOpenTextDocument(scheduleExport),
    vscode.workspace.onDidCloseTextDocument(scheduleExport),
    vscode.workspace.onDidSaveTextDocument(scheduleIndex),
    vscode.workspace.onDidRenameFiles(scheduleIndex),
    vscode.workspace.onDidDeleteFiles(scheduleIndex),
    vscode.workspace.onDidCreateFiles(scheduleIndex),
  )
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, `${BRIDGE_DIR}/commands/*.json`))
    context.subscriptions.push(
      watcher,
      watcher.onDidCreate((uri) => { void processCommandFile(uri.fsPath, folder.uri.fsPath) }),
      watcher.onDidChange((uri) => { void processCommandFile(uri.fsPath, folder.uri.fsPath) }),
    )
  }
  scheduleExport()
  scheduleIndex()
  void processAllCommands()
  updateStatusBar()
}

function deactivate() {}

function scheduleExport() {
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  if (!config.get('autoExport', true)) return
  clearTimeout(exportTimer)
  exportTimer = setTimeout(() => { void exportContext() }, 250)
}

function scheduleIndex() {
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  if (!config.get('autoIndex', true)) return
  clearTimeout(indexTimer)
  indexTimer = setTimeout(() => { void rebuildIndex().catch(() => updateStatusBar()) }, 900)
  updateStatusBar('$(sync~spin) VD Agent indexing')
}

async function exportContext() {
  const folder = activeWorkspaceFolder()
  if (!folder) return null
  const targetDir = path.join(folder.uri.fsPath, BRIDGE_DIR)
  const target = path.join(targetDir, BRIDGE_FILE)
  const active = vscode.window.activeTextEditor
  const maxSelectionChars = vscode.workspace.getConfiguration('vdAgentBridge').get('maxSelectionChars', 20000)
  const index = await readIndexSummary(folder.uri.fsPath)
  const state = {
    version: 1,
    workspacePath: folder.uri.fsPath,
    updatedAt: Date.now(),
    activeFile: active && isFileInside(folder.uri.fsPath, active.document.uri.fsPath) ? active.document.uri.fsPath : undefined,
    activeLanguage: active?.document.languageId,
    selection: active ? selectionState(active, maxSelectionChars) : undefined,
    visibleFiles: vscode.window.visibleTextEditors
      .map((editor) => editor.document.uri.fsPath)
      .filter((file) => isFileInside(folder.uri.fsPath, file)),
    openFiles: vscode.workspace.textDocuments
      .filter((document) => document.uri.scheme === 'file' && !document.isUntitled)
      .map((document) => document.uri.fsPath)
      .filter((file) => isFileInside(folder.uri.fsPath, file)),
    index,
  }
  await fs.promises.mkdir(targetDir, { recursive: true })
  await fs.promises.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  return target
}

async function rebuildIndex() {
  const folder = activeWorkspaceFolder()
  if (!folder) return null
  const root = folder.uri.fsPath
  const targetDir = path.join(root, BRIDGE_DIR)
  const target = path.join(targetDir, INDEX_FILE)
  const maxIndexedFiles = vscode.workspace.getConfiguration('vdAgentBridge').get('maxIndexedFiles', 2000)
  const uris = await vscode.workspace.findFiles(
    '**/*',
    '{**/.git/**,**/node_modules/**,**/dist/**,**/dist-electron/**,**/release/**,**/coverage/**,**/.vite/**,**/.next/**,**/out/**,**/build/**,**/target/**,**/.vd-agent/**}',
    maxIndexedFiles,
  )
  const files = []
  let totalBytes = 0
  for (const uri of uris) {
    if (uri.scheme !== 'file' || !isTextFile(uri.fsPath) || !isFileInside(root, uri.fsPath)) continue
    const stat = await fs.promises.stat(uri.fsPath).catch(() => null)
    if (!stat || stat.size > MAX_FILE_BYTES) continue
    const text = await fs.promises.readFile(uri.fsPath, 'utf8').catch(() => '')
    const symbols = extractSymbols(text, 16)
    const tokens = tokenize(`${vscode.workspace.asRelativePath(uri)} ${symbols.join(' ')} ${text.slice(0, 40000)}`).slice(0, 80)
    totalBytes += Buffer.byteLength(text)
    files.push({
      path: vscode.workspace.asRelativePath(uri),
      language: languageFor(uri.fsPath),
      bytes: Buffer.byteLength(text),
      symbols,
      tokens,
    })
  }
  latestIndex = {
    version: 1,
    workspacePath: root,
    updatedAt: Date.now(),
    files,
    fileCount: files.length,
    symbolCount: files.reduce((sum, file) => sum + file.symbols.length, 0),
    totalBytes,
  }
  await fs.promises.mkdir(targetDir, { recursive: true })
  await fs.promises.writeFile(target, `${JSON.stringify(latestIndex, null, 2)}\n`, 'utf8')
  await exportContext()
  updateStatusBar()
  return target
}

async function readIndexSummary(root) {
  const index = latestIndex || await readJson(path.join(root, BRIDGE_DIR, INDEX_FILE))
  if (!index || index.version !== 1) return undefined
  return {
    updatedAt: Number(index.updatedAt || 0),
    files: Number(index.fileCount || index.files?.length || 0),
    symbols: Number(index.symbolCount || 0),
    bytes: Number(index.totalBytes || 0),
  }
}

function provideLocalInlineCompletions(document, position) {
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  if (!config.get('inlineCompletion', true)) return []
  if (document.uri.scheme !== 'file' || document.lineAt(position.line).text.trimStart().startsWith('//')) return []
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character)
  const match = linePrefix.match(/[A-Za-z_$][\w$]{2,}$/)
  if (!match || !latestIndex) return []
  const prefix = match[0]
  const prefixLower = prefix.toLowerCase()
  const localWords = tokenize(document.getText().slice(Math.max(0, document.offsetAt(position) - 10000), document.offsetAt(position) + 10000))
  const candidates = new Set()
  for (const token of localWords) candidates.add(token)
  for (const file of latestIndex.files || []) {
    for (const symbol of file.symbols || []) candidates.add(symbol)
    for (const token of file.tokens || []) candidates.add(token)
  }
  const items = [...candidates]
    .filter((item) => typeof item === 'string' && item.length > prefix.length && item.toLowerCase().startsWith(prefixLower))
    .filter((item) => item !== prefix && /^[A-Za-z_$][\w$.-]*$/.test(item))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 5)
    .map((item) => new vscode.InlineCompletionItem(item.slice(prefix.length), new vscode.Range(position, position)))
  return new vscode.InlineCompletionList(items)
}

async function processAllCommands() {
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const dir = path.join(folder.uri.fsPath, COMMAND_DIR)
    const entries = await fs.promises.readdir(dir).catch(() => [])
    for (const entry of entries) {
      if (entry.endsWith('.json')) await processCommandFile(path.join(dir, entry), folder.uri.fsPath)
    }
  }
}

async function processCommandFile(commandFile, root) {
  const resolved = path.resolve(commandFile)
  if (processing.has(resolved)) return
  processing.add(resolved)
  let command
  try {
    command = JSON.parse(await fs.promises.readFile(resolved, 'utf8'))
    if (!command || typeof command.id !== 'string' || typeof command.action !== 'string') {
      throw new Error('Command must include id and action.')
    }
    const result = await executeBridgeCommand(root, command)
    await writeCommandResult(root, command.id, { ok: true, message: result || 'Command completed.', action: command.action })
    await exportContext()
  } catch (err) {
    const id = typeof command?.id === 'string' ? command.id : path.basename(commandFile, '.json')
    await writeCommandResult(root, id, { ok: false, message: String(err && err.message ? err.message : err), action: command?.action })
  } finally {
    await fs.promises.unlink(resolved).catch(() => {})
    processing.delete(resolved)
  }
}

async function executeBridgeCommand(root, command) {
  const args = command.args && typeof command.args === 'object' ? command.args : {}
  if (command.action === 'open_file') {
    const file = resolveInside(root, args.path)
    const editor = await openFileAt(file, args.line, args.column)
    return `Opened ${vscode.workspace.asRelativePath(editor.document.uri)}`
  }
  if (command.action === 'apply_edit') {
    const file = resolveInside(root, args.path)
    const changed = await applyTextReplacement(file, String(args.old_string || ''), String(args.new_string || ''))
    return `Applied edit to ${vscode.workspace.asRelativePath(file)} (${changed} replacement).`
  }
  if (command.action === 'show_diff') {
    const file = resolveInside(root, args.path)
    const preview = await writeDiffPreview(root, file, String(args.old_string || ''), String(args.new_string || ''), args.content)
    const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : `VD Agent Preview: ${path.basename(file)}`
    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(file), vscode.Uri.file(preview), title)
    return `Opened VS Code diff for ${vscode.workspace.asRelativePath(file)}`
  }
  if (command.action === 'run_command') {
    const name = String(args.command || '')
    if (!name) throw new Error('run_command requires args.command.')
    const result = await vscode.commands.executeCommand(name, ...(Array.isArray(args.args) ? args.args : []))
    return `VS Code command executed: ${name}${result === undefined ? '' : ` (${safeSummary(result)})`}`
  }
  throw new Error(`Unknown VD Agent bridge action: ${command.action}`)
}

async function openFileAt(file, line, column) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  const editor = await vscode.window.showTextDocument(document, { preview: false })
  if (Number.isFinite(Number(line))) {
    const position = new vscode.Position(Math.max(0, Number(line) - 1), Math.max(0, Number(column || 1) - 1))
    editor.selection = new vscode.Selection(position, position)
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
  }
  return editor
}

async function applyTextReplacement(file, oldString, newString) {
  if (!oldString) throw new Error('apply_edit requires old_string.')
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  const text = document.getText()
  const index = text.indexOf(oldString)
  if (index < 0) throw new Error(`old_string not found in ${vscode.workspace.asRelativePath(file)}.`)
  const edit = new vscode.WorkspaceEdit()
  edit.replace(document.uri, new vscode.Range(document.positionAt(index), document.positionAt(index + oldString.length)), newString)
  const applied = await vscode.workspace.applyEdit(edit)
  if (!applied) throw new Error('VS Code rejected the workspace edit.')
  await document.save()
  await openFileAt(file, document.positionAt(index).line + 1, document.positionAt(index).character + 1)
  return 1
}

async function writeDiffPreview(root, file, oldString, newString, content) {
  const before = await fs.promises.readFile(file, 'utf8')
  let after
  if (typeof content === 'string') {
    after = content
  } else {
    if (!oldString) throw new Error('show_diff requires old_string/new_string or content.')
    if (!before.includes(oldString)) throw new Error(`old_string not found in ${vscode.workspace.asRelativePath(file)}.`)
    after = before.replace(oldString, newString)
  }
  const dir = path.join(root, BRIDGE_DIR, 'diff-previews')
  await fs.promises.mkdir(dir, { recursive: true })
  const preview = path.join(dir, `${Date.now()}-${path.basename(file)}`)
  await fs.promises.writeFile(preview, after, 'utf8')
  await fs.promises.writeFile(path.join(root, BRIDGE_DIR, LAST_PREVIEW_FILE), `${JSON.stringify({
    version: 1,
    createdAt: Date.now(),
    file,
    preview,
    title: vscode.workspace.asRelativePath(file),
  }, null, 2)}\n`, 'utf8')
  updateStatusBar()
  return preview
}

async function acceptLastPreview() {
  const folder = activeWorkspaceFolder()
  if (!folder) return vscode.window.showWarningMessage('Open a workspace before accepting a VD Agent preview.')
  const metaPath = path.join(folder.uri.fsPath, BRIDGE_DIR, LAST_PREVIEW_FILE)
  const meta = await readJson(metaPath)
  if (!meta?.file || !meta?.preview) return vscode.window.showWarningMessage('No VD Agent preview is waiting to accept.')
  const file = resolveInside(folder.uri.fsPath, meta.file)
  const preview = resolveInside(folder.uri.fsPath, meta.preview)
  const after = await fs.promises.readFile(preview, 'utf8')
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  const edit = new vscode.WorkspaceEdit()
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), after)
  const applied = await vscode.workspace.applyEdit(edit)
  if (!applied) throw new Error('VS Code rejected the preview edit.')
  await document.save()
  await fs.promises.unlink(metaPath).catch(() => {})
  await fs.promises.unlink(preview).catch(() => {})
  await exportContext()
  scheduleIndex()
  vscode.window.showInformationMessage(`VD Agent preview accepted: ${vscode.workspace.asRelativePath(file)}`)
}

async function rejectLastPreview() {
  const folder = activeWorkspaceFolder()
  if (!folder) return vscode.window.showWarningMessage('Open a workspace before rejecting a VD Agent preview.')
  const metaPath = path.join(folder.uri.fsPath, BRIDGE_DIR, LAST_PREVIEW_FILE)
  const meta = await readJson(metaPath)
  if (!meta?.preview) return vscode.window.showWarningMessage('No VD Agent preview is waiting to reject.')
  const preview = resolveInside(folder.uri.fsPath, meta.preview)
  await fs.promises.unlink(metaPath).catch(() => {})
  await fs.promises.unlink(preview).catch(() => {})
  updateStatusBar()
  vscode.window.showInformationMessage('VD Agent preview rejected.')
}

async function showBridgeStatus() {
  const folder = activeWorkspaceFolder()
  if (!folder) return vscode.window.showWarningMessage('No workspace is open for VD Agent Bridge.')
  const root = folder.uri.fsPath
  const pending = (await fs.promises.readdir(path.join(root, COMMAND_DIR)).catch(() => []))
    .filter((entry) => entry.endsWith('.json')).length
  const index = await readIndexSummary(root)
  const preview = await readJson(path.join(root, BRIDGE_DIR, LAST_PREVIEW_FILE))
  const detail = [
    `Workspace: ${root}`,
    `Pending commands: ${pending}`,
    `Index: ${index ? `${index.files} files, ${index.symbols} symbols` : 'not built yet'}`,
    `Preview: ${preview?.file ? vscode.workspace.asRelativePath(preview.file) : 'none'}`,
  ].join('\n')
  vscode.window.showInformationMessage('VD Agent Bridge status', { modal: true, detail })
}

async function writeCommandResult(root, id, patch) {
  const dir = path.join(root, RESULT_DIR)
  await fs.promises.mkdir(dir, { recursive: true })
  const target = path.join(dir, `${id}.json`)
  const result = { id, updatedAt: Date.now(), ...patch }
  await fs.promises.writeFile(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  await fs.promises.writeFile(path.join(root, BRIDGE_DIR, LAST_COMMAND_FILE), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
}

function activeWorkspaceFolder() {
  const active = vscode.window.activeTextEditor
  if (active) {
    const folder = vscode.workspace.getWorkspaceFolder(active.document.uri)
    if (folder) return folder
  }
  return vscode.workspace.workspaceFolders?.[0] || null
}

function selectionState(editor, maxSelectionChars) {
  const selection = editor.selection
  const text = editor.document.getText(selection).slice(0, maxSelectionChars)
  return {
    text,
    startLine: selection.start.line + 1,
    startColumn: selection.start.character + 1,
    endLine: selection.end.line + 1,
    endColumn: selection.end.character + 1,
  }
}

function updateStatusBar(text) {
  if (!statusBar) return
  const folder = activeWorkspaceFolder()
  if (!folder) {
    statusBar.hide()
    return
  }
  const indexText = latestIndex ? `${latestIndex.fileCount} files` : 'ready'
  statusBar.text = text || `$(sparkle) VD Agent ${indexText}`
  statusBar.tooltip = 'VD Agent Bridge: export context, process commands, accept previews, and maintain local index.'
  statusBar.show()
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

function isTextFile(file) {
  return TEXT_EXTS.has(path.extname(file).toLowerCase())
}

function languageFor(file) {
  return path.extname(file).replace(/^\./, '') || 'text'
}

function extractSymbols(text, max = 20) {
  const symbols = new Set()
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g,
    /^\s*def\s+([A-Za-z_][\w]*)/gm,
    /^\s*([A-Za-z_$][\w$-]+)\s*:/gm,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) && symbols.size < max) symbols.add(match[1])
  }
  return [...symbols]
}

function tokenize(text) {
  return [...new Set(String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.$/-]+/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && token.length <= 40))]
}

function isFileInside(root, file) {
  const relative = path.relative(path.resolve(root), path.resolve(file))
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveInside(root, target) {
  if (typeof target !== 'string' || !target) throw new Error('A file path is required.')
  const resolved = path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target)
  if (!isFileInside(root, resolved)) throw new Error(`Path escapes workspace: ${target}`)
  return resolved
}

function safeSummary(value) {
  try {
    return JSON.stringify(value).slice(0, 300)
  } catch {
    return String(value).slice(0, 300)
  }
}

module.exports = { activate, deactivate }

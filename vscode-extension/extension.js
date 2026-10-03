const fs = require('fs')
const path = require('path')
const vscode = require('vscode')

const BRIDGE_DIR = '.vd-agent'
const BRIDGE_FILE = 'vscode-bridge.json'
const COMMAND_DIR = path.join(BRIDGE_DIR, 'commands')
const RESULT_DIR = path.join(BRIDGE_DIR, 'command-results')

let exportTimer
const processing = new Set()

function activate(context) {
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
    vscode.window.onDidChangeActiveTextEditor(scheduleExport),
    vscode.window.onDidChangeTextEditorSelection(scheduleExport),
    vscode.workspace.onDidOpenTextDocument(scheduleExport),
    vscode.workspace.onDidCloseTextDocument(scheduleExport),
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
  void processAllCommands()
}

function deactivate() {}

function scheduleExport() {
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  if (!config.get('autoExport', true)) return
  clearTimeout(exportTimer)
  exportTimer = setTimeout(() => { void exportContext() }, 250)
}

async function exportContext() {
  const folder = activeWorkspaceFolder()
  if (!folder) return null
  const targetDir = path.join(folder.uri.fsPath, BRIDGE_DIR)
  const target = path.join(targetDir, BRIDGE_FILE)
  const active = vscode.window.activeTextEditor
  const maxSelectionChars = vscode.workspace.getConfiguration('vdAgentBridge').get('maxSelectionChars', 20000)
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
  }
  await fs.promises.mkdir(targetDir, { recursive: true })
  await fs.promises.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  return target
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
    await writeCommandResult(root, command.id, { ok: true, message: result || 'Command completed.' })
    await exportContext()
  } catch (err) {
    const id = typeof command?.id === 'string' ? command.id : path.basename(commandFile, '.json')
    await writeCommandResult(root, id, { ok: false, message: String(err && err.message ? err.message : err) })
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
  return preview
}

async function writeCommandResult(root, id, patch) {
  const dir = path.join(root, RESULT_DIR)
  await fs.promises.mkdir(dir, { recursive: true })
  const target = path.join(dir, `${id}.json`)
  await fs.promises.writeFile(target, `${JSON.stringify({ id, updatedAt: Date.now(), ...patch }, null, 2)}\n`, 'utf8')
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

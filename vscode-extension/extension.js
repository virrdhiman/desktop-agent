const fs = require('fs')
const path = require('path')
const vscode = require('vscode')

const BRIDGE_DIR = '.vd-agent'
const BRIDGE_FILE = 'vscode-bridge.json'

let exportTimer

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
    vscode.window.onDidChangeActiveTextEditor(scheduleExport),
    vscode.window.onDidChangeTextEditorSelection(scheduleExport),
    vscode.workspace.onDidOpenTextDocument(scheduleExport),
    vscode.workspace.onDidCloseTextDocument(scheduleExport),
  )
  scheduleExport()
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

module.exports = { activate, deactivate }

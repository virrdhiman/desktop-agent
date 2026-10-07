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
const TASKS_FILE = 'vscode-agent-tasks.json'
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
let dashboardPanel = null
let assistantProvider = null
let activeCompletionController = null
const completionCache = new Map()
const processing = new Set()

function activate(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80)
  statusBar.command = 'vdAgent.showStatus'
  assistantProvider = new VdAgentAssistantViewProvider(context.extensionUri)
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
    vscode.commands.registerCommand('vdAgent.openDashboard', openDashboard),
    vscode.commands.registerCommand('vdAgent.fixWithVD', () => runNativeEditorAction('fix')),
    vscode.commands.registerCommand('vdAgent.explainWithVD', () => runNativeEditorAction('explain')),
    vscode.commands.registerCommand('vdAgent.refactorWithVD', () => runNativeEditorAction('refactor')),
    vscode.commands.registerCommand('vdAgent.generateTestsWithVD', () => runNativeEditorAction('tests')),
    vscode.commands.registerCommand('vdAgent.openWorkspaceTerminal', openWorkspaceTerminal),
    vscode.window.registerWebviewViewProvider('vdAgent.assistantView', assistantProvider),
    vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, {
      provideCodeActions(document, range, context) {
        return provideVdCodeActions(document, range, context)
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.RefactorRewrite] }),
    vscode.languages.registerCodeLensProvider({ scheme: 'file', pattern: `**/${BRIDGE_DIR}/diff-previews/*` }, {
      provideCodeLenses(document) {
        return previewCodeLenses(document)
      },
    }),
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**/*' }, {
      provideInlineCompletionItems(document, position, context, token) {
        return provideInlineCompletions(document, position, context, token)
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
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  const maxIndexedFiles = config.get('maxIndexedFiles', 2000)
  const maxSemanticSymbolFiles = config.get('maxSemanticSymbolFiles', 350)
  const uris = await vscode.workspace.findFiles(
    '**/*',
    '{**/.git/**,**/node_modules/**,**/dist/**,**/dist-electron/**,**/release/**,**/coverage/**,**/.vite/**,**/.next/**,**/out/**,**/build/**,**/target/**,**/.vd-agent/**}',
    maxIndexedFiles,
  )
  const files = []
  let totalBytes = 0
  let semanticFiles = 0
  for (const uri of uris) {
    if (uri.scheme !== 'file' || !isTextFile(uri.fsPath) || !isFileInside(root, uri.fsPath)) continue
    const stat = await fs.promises.stat(uri.fsPath).catch(() => null)
    if (!stat || stat.size > MAX_FILE_BYTES) continue
    const text = await fs.promises.readFile(uri.fsPath, 'utf8').catch(() => '')
    const semanticSymbols = semanticFiles < maxSemanticSymbolFiles ? await extractVsCodeSymbols(uri) : []
    if (semanticSymbols.length) semanticFiles += 1
    const regexSymbols = extractSymbols(text, 16)
    const symbols = unique([...semanticSymbols, ...regexSymbols]).slice(0, 32)
    const imports = extractImports(text, 24)
    const tokens = tokenize(`${vscode.workspace.asRelativePath(uri)} ${symbols.join(' ')} ${imports.join(' ')} ${text.slice(0, 40000)}`).slice(0, 120)
    totalBytes += Buffer.byteLength(text)
    files.push({
      path: vscode.workspace.asRelativePath(uri),
      language: languageFor(uri.fsPath),
      bytes: Buffer.byteLength(text),
      symbols,
      imports,
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
    importCount: files.reduce((sum, file) => sum + file.imports.length, 0),
    semanticFiles,
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
    imports: Number(index.importCount || 0),
    semanticFiles: Number(index.semanticFiles || 0),
    bytes: Number(index.totalBytes || 0),
  }
}

async function provideInlineCompletions(document, position, _context, token) {
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  if (!config.get('inlineCompletion', true)) return []
  if (document.uri.scheme !== 'file' || document.lineAt(position.line).text.trimStart().startsWith('//')) return []
  const local = provideLocalInlineCompletions(document, position)
  if (!config.get('aiInlineCompletion', true) || config.get('aiProvider', 'ollama') === 'disabled') return local
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character)
  if (!/[A-Za-z_$\])}.'"`][\w$.'"`)\]} ]{0,80}$/.test(linePrefix) && linePrefix.trim().length > 0) return local
  const delayMs = config.get('aiAutocompleteDelayMs', 220)
  await delay(delayMs, token)
  if (token?.isCancellationRequested) return []
  const cacheKey = completionCacheKey(document, position)
  const cached = completionCache.get(cacheKey)
  if (cached && Date.now() - cached.at < 30_000) return inlineList(cached.text, position, local)
  try {
    const text = await requestAiInlineCompletion(document, position, token)
    if (!text) return local
    completionCache.set(cacheKey, { at: Date.now(), text })
    trimCompletionCache()
    return inlineList(text, position, local)
  } catch {
    return local
  }
}

function provideLocalInlineCompletions(document, position) {
  if (!latestIndex) return []
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

async function requestAiInlineCompletion(document, position, token) {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri)
  if (!folder) return ''
  const offset = document.offsetAt(position)
  const text = document.getText()
  const before = text.slice(Math.max(0, offset - 4500), offset)
  const after = text.slice(offset, Math.min(text.length, offset + 2200))
  const related = relatedIndexContext(document.uri.fsPath, 6)
  const prompt = [
    'You are VD Agent inline autocomplete. Return only the code/text that should be inserted at the cursor.',
    'Do not use markdown fences. Do not repeat code already before the cursor. Keep the completion short.',
    `Language: ${document.languageId}`,
    `File: ${vscode.workspace.asRelativePath(document.uri)}`,
    related ? `Related workspace context:\n${related}` : '',
    '<BEFORE_CURSOR>',
    before,
    '<AFTER_CURSOR>',
    after,
    '<INSERT_COMPLETION>',
  ].filter(Boolean).join('\n')
  const raw = await requestAiText(prompt, {
    timeoutMs: vscode.workspace.getConfiguration('vdAgentBridge').get('aiAutocompleteTimeoutMs', 2500),
    token,
    maxTokens: 96,
    temperature: 0.12,
    abortPrevious: true,
  })
  return cleanInlineCompletion(raw, before)
}

function inlineList(text, position, fallback) {
  const cleaned = String(text || '').replace(/\r/g, '')
  if (!cleaned.trim()) return fallback
  return new vscode.InlineCompletionList([
    new vscode.InlineCompletionItem(cleaned, new vscode.Range(position, position)),
  ])
}

function completionCacheKey(document, position) {
  const offset = document.offsetAt(position)
  const text = document.getText()
  const before = text.slice(Math.max(0, offset - 600), offset)
  const after = text.slice(offset, Math.min(text.length, offset + 240))
  return `${document.uri.fsPath}:${document.version}:${position.line}:${position.character}:${hashText(before)}:${hashText(after)}`
}

function trimCompletionCache() {
  while (completionCache.size > 80) {
    const first = completionCache.keys().next().value
    completionCache.delete(first)
  }
}

function cleanInlineCompletion(raw, before) {
  let text = String(raw || '')
    .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
    .replace(/```/g, '')
    .replace(/^<INSERT_COMPLETION>/i, '')
    .trimEnd()
  const beforeTail = before.slice(-120)
  for (let i = Math.min(text.length, beforeTail.length); i > 8; i--) {
    if (beforeTail.endsWith(text.slice(0, i))) {
      text = text.slice(i)
      break
    }
  }
  const lines = text.split('\n')
  if (lines.length > 8) text = lines.slice(0, 8).join('\n')
  if (text.length > 600) text = text.slice(0, 600)
  return text
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

async function requestAiText(prompt, options = {}) {
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  const provider = config.get('aiProvider', 'ollama')
  if (provider === 'disabled') return ''
  const baseUrl = String(config.get('aiBaseUrl', 'http://localhost:11434')).replace(/\/+$/, '')
  const model = String(config.get('aiModel', 'qwen2.5-coder:1.5b')).trim()
  const apiKey = String(config.get('aiApiKey', '') || '')
  const timeoutMs = Number(options.timeoutMs || 12_000)
  if (!model) return ''
  if (options.abortPrevious && activeCompletionController) activeCompletionController.abort()
  const controller = new AbortController()
  if (options.abortPrevious) activeCompletionController = controller
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const cancel = options.token?.onCancellationRequested?.(() => controller.abort())
  try {
    if (provider === 'openai-compatible') {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are VD Agent inside VS Code. Be concise and return only the requested output.' },
            { role: 'user', content: prompt },
          ],
          temperature: options.temperature ?? 0.15,
          max_tokens: options.maxTokens || 512,
          stream: false,
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`AI provider HTTP ${response.status}`)
      const data = await response.json()
      return data?.choices?.[0]?.message?.content || ''
    }
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.15,
          num_predict: options.maxTokens || 512,
        },
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`)
    const data = await response.json()
    return data?.response || ''
  } finally {
    clearTimeout(timeout)
    cancel?.dispose?.()
    if (activeCompletionController === controller) activeCompletionController = null
  }
}

function relatedIndexContext(file, limit = 6) {
  if (!latestIndex?.files?.length) return ''
  const activeRel = vscode.workspace.asRelativePath(file).replace(/\\/g, '/')
  const active = latestIndex.files.find((entry) => entry.path === activeRel)
  const query = new Set([
    ...tokenize(activeRel),
    ...(active?.symbols || []).flatMap(tokenize),
    ...(active?.imports || []).flatMap(tokenize),
  ])
  return latestIndex.files
    .filter((entry) => entry.path !== activeRel)
    .map((entry) => {
      const haystack = new Set([...(entry.tokens || []), ...(entry.symbols || []).flatMap(tokenize), ...(entry.imports || []).flatMap(tokenize)])
      let score = 0
      for (const token of query) if (haystack.has(token)) score += 1
      if (sameDirectory(activeRel, entry.path)) score += 2
      return { entry, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
    .slice(0, limit)
    .map(({ entry }) => `${entry.path}: symbols=${(entry.symbols || []).slice(0, 8).join(', ')} imports=${(entry.imports || []).slice(0, 6).join(', ')}`)
    .join('\n')
}

function sameDirectory(a, b) {
  return path.dirname(a.replace(/\\/g, '/')) === path.dirname(b.replace(/\\/g, '/'))
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

function provideVdCodeActions(document, range, context) {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri)
  if (document.uri.scheme !== 'file' || !folder || !isFileInside(folder.uri.fsPath, document.uri.fsPath)) return []
  const actions = []
  if (context.diagnostics?.length) {
    const fix = new vscode.CodeAction('Fix with VD Agent', vscode.CodeActionKind.QuickFix)
    fix.command = { command: 'vdAgent.fixWithVD', title: 'Fix with VD Agent' }
    fix.diagnostics = context.diagnostics
    actions.push(fix)
  }
  if (!range.isEmpty) {
    const explain = new vscode.CodeAction('Explain with VD Agent', vscode.CodeActionKind.RefactorRewrite)
    explain.command = { command: 'vdAgent.explainWithVD', title: 'Explain with VD Agent' }
    const refactor = new vscode.CodeAction('Refactor with VD Agent', vscode.CodeActionKind.RefactorRewrite)
    refactor.command = { command: 'vdAgent.refactorWithVD', title: 'Refactor with VD Agent' }
    actions.push(explain, refactor)
  }
  const tests = new vscode.CodeAction('Generate tests with VD Agent', vscode.CodeActionKind.RefactorRewrite)
  tests.command = { command: 'vdAgent.generateTestsWithVD', title: 'Generate tests with VD Agent' }
  actions.push(tests)
  return actions
}

async function runNativeEditorAction(kind, promptOverride) {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.uri.scheme !== 'file') return vscode.window.showWarningMessage('Open a file before using VD Agent editor actions.')
  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
  if (!folder) return vscode.window.showWarningMessage('Open a workspace before using VD Agent editor actions.')
  const document = editor.document
  const selection = editor.selection
  const selectedText = selection.isEmpty ? '' : document.getText(selection)
  const diagnostics = vscode.languages.getDiagnostics(document.uri)
    .filter((diag) => selection.isEmpty || diag.range.intersection(selection))
    .slice(0, 12)
    .map((diag) => `${diag.range.start.line + 1}:${diag.range.start.character + 1} ${diag.message}`)
    .join('\n')
  const prompt = promptOverride
    ? buildNativeActionPrompt('ask', document, selectedText, diagnostics, promptOverride)
    : buildNativeActionPrompt(kind, document, selectedText, diagnostics)
  const task = await recordTask(kind, document.uri.fsPath, prompt)
  assistantProvider?.refresh?.()
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `VD Agent ${kind}`, cancellable: true }, async (_progress, token) => {
    const result = await requestAiText(prompt, { timeoutMs: 25_000, token, maxTokens: kind === 'explain' ? 800 : 1200, temperature: 0.18 })
    if (!result.trim()) throw new Error('No AI response. Check VD Agent Bridge AI settings or local Ollama.')
    await finishNativeAction(kind, editor, selectedText, result)
    await updateTask(task.id, { status: 'done', result: result.slice(0, 2000), updatedAt: Date.now() })
  }).catch(async (err) => {
    await updateTask(task.id, { status: 'failed', error: String(err?.message || err), updatedAt: Date.now() })
    vscode.window.showWarningMessage(`VD Agent ${kind} failed: ${err?.message || err}`)
  })
  assistantProvider?.refresh?.()
}

function buildNativeActionPrompt(kind, document, selectedText, diagnostics, customRequest) {
  const fullText = document.getText()
  const scope = selectedText || fullText.slice(0, 14000)
  const related = relatedIndexContext(document.uri.fsPath, 8)
  const common = [
    `File: ${vscode.workspace.asRelativePath(document.uri)}`,
    `Language: ${document.languageId}`,
    diagnostics ? `Diagnostics:\n${diagnostics}` : '',
    related ? `Related context:\n${related}` : '',
    'Code:',
    scope,
  ].filter(Boolean).join('\n\n')
  if (kind === 'ask') return `${customRequest}\n\nUse this active editor context. Be direct and practical.\n\n${common}`
  if (kind === 'fix') return `Fix the diagnostics or obvious issue in this code. Return only the replacement code for the selected code, or for the full shown code if no selection.\n\n${common}`
  if (kind === 'refactor') return `Refactor this code for clarity, maintainability, and minimal behavioral change. Return only replacement code.\n\n${common}`
  if (kind === 'tests') return `Generate practical tests for this code. Return a complete test file or test cases only, no markdown.\n\n${common}`
  return `Explain this code clearly and professionally. Mention risks or bugs if any.\n\n${common}`
}

async function finishNativeAction(kind, editor, selectedText, result) {
  const document = editor.document
  if (kind === 'explain') {
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: `# VD Agent Explanation\n\n${result.trim()}\n` })
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside })
    return
  }
  if (kind === 'tests') {
    const doc = await vscode.workspace.openTextDocument({ language: document.languageId === 'typescriptreact' ? 'typescript' : document.languageId, content: result.trimEnd() + '\n' })
    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside })
    return
  }
  const current = document.getText()
  let content
  if (selectedText) {
    content = current.slice(0, document.offsetAt(editor.selection.start)) + cleanReplacement(result) + current.slice(document.offsetAt(editor.selection.end))
  } else {
    content = cleanReplacement(result)
  }
  const root = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
  if (!root) throw new Error('Workspace folder not found.')
  const preview = await writeDiffPreview(root, document.uri.fsPath, '', '', content)
  await vscode.commands.executeCommand('vscode.diff', document.uri, vscode.Uri.file(preview), `VD Agent ${kind}: ${path.basename(document.uri.fsPath)}`)
}

function cleanReplacement(value) {
  return String(value || '').replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '').trimEnd()
}

async function openWorkspaceTerminal() {
  const folder = activeWorkspaceFolder()
  const terminal = vscode.window.createTerminal({ name: 'VD Agent', cwd: folder?.uri.fsPath })
  terminal.show()
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

function previewCodeLenses(document) {
  if (!document.uri.fsPath.includes(`${path.sep}${BRIDGE_DIR}${path.sep}diff-previews${path.sep}`)) return []
  const top = new vscode.Range(0, 0, 0, 0)
  return [
    new vscode.CodeLens(top, { title: '$(check) Accept VD Agent Preview', command: 'vdAgent.acceptLastPreview' }),
    new vscode.CodeLens(top, { title: '$(close) Reject VD Agent Preview', command: 'vdAgent.rejectLastPreview' }),
    new vscode.CodeLens(top, { title: '$(info) Bridge Status', command: 'vdAgent.showStatus' }),
  ]
}

async function openDashboard() {
  const folder = activeWorkspaceFolder()
  if (!folder) return vscode.window.showWarningMessage('Open a workspace before opening the VD Agent dashboard.')
  if (dashboardPanel) {
    dashboardPanel.reveal(vscode.ViewColumn.Beside)
    dashboardPanel.webview.html = await dashboardHtml(folder.uri.fsPath)
    return
  }
  dashboardPanel = vscode.window.createWebviewPanel(
    'vdAgentBridge',
    'VD Agent Bridge',
    vscode.ViewColumn.Beside,
    { enableScripts: true },
  )
  dashboardPanel.onDidDispose(() => { dashboardPanel = null })
  dashboardPanel.webview.onDidReceiveMessage(async (message) => {
    if (message?.command === 'export') await exportContext()
    if (message?.command === 'index') await rebuildIndex()
    if (message?.command === 'process') await processAllCommands()
    if (message?.command === 'accept') await acceptLastPreview()
    if (message?.command === 'reject') await rejectLastPreview()
    if (dashboardPanel) dashboardPanel.webview.html = await dashboardHtml(folder.uri.fsPath)
  })
  dashboardPanel.webview.html = await dashboardHtml(folder.uri.fsPath)
}

async function dashboardHtml(root) {
  const index = await readIndexSummary(root)
  const pending = (await fs.promises.readdir(path.join(root, COMMAND_DIR)).catch(() => []))
    .filter((entry) => entry.endsWith('.json')).length
  const preview = await readJson(path.join(root, BRIDGE_DIR, LAST_PREVIEW_FILE))
  const bridge = await readJson(path.join(root, BRIDGE_DIR, BRIDGE_FILE))
  const nonce = String(Date.now())
  const activeFile = bridge?.activeFile ? vscode.workspace.asRelativePath(bridge.activeFile) : 'None'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 18px; }
  h1 { font-size: 18px; margin: 0 0 14px; }
  .grid { display: grid; gap: 10px; }
  .row { display: grid; grid-template-columns: 140px 1fr; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  .label { color: var(--vscode-descriptionForeground); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 7px 10px; cursor: pointer; }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  code { word-break: break-all; }
</style>
</head>
<body>
  <h1>VD Agent Bridge</h1>
  <div class="grid">
    <div class="row"><div class="label">Workspace</div><code>${escapeHtml(root)}</code></div>
    <div class="row"><div class="label">Active file</div><div>${escapeHtml(activeFile)}</div></div>
    <div class="row"><div class="label">Pending commands</div><div>${pending}</div></div>
    <div class="row"><div class="label">Index</div><div>${index ? `${index.files} files, ${index.symbols} symbols, ${index.imports || 0} imports, ${index.semanticFiles || 0} semantic files` : 'Not built yet'}</div></div>
    <div class="row"><div class="label">Preview</div><div>${preview?.file ? escapeHtml(vscode.workspace.asRelativePath(preview.file)) : 'None'}</div></div>
  </div>
  <div class="actions">
    <button data-command="export">Export Context</button>
    <button data-command="index">Rebuild Index</button>
    <button data-command="process">Process Commands</button>
    <button data-command="accept">Accept Preview</button>
    <button class="secondary" data-command="reject">Reject Preview</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button[data-command]').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }));
    });
  </script>
</body>
</html>`
}

async function writeCommandResult(root, id, patch) {
  const dir = path.join(root, RESULT_DIR)
  await fs.promises.mkdir(dir, { recursive: true })
  const target = path.join(dir, `${id}.json`)
  const result = { id, updatedAt: Date.now(), ...patch }
  await fs.promises.writeFile(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  await fs.promises.writeFile(path.join(root, BRIDGE_DIR, LAST_COMMAND_FILE), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
}

async function recordTask(kind, file, prompt) {
  const folder = activeWorkspaceFolder()
  const root = folder?.uri.fsPath || path.dirname(file)
  const task = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    file,
    prompt: prompt.slice(0, 4000),
    status: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const tasks = await readTasks(root)
  tasks.unshift(task)
  await writeTasks(root, tasks.slice(0, 50))
  return task
}

async function updateTask(id, patch) {
  const folder = activeWorkspaceFolder()
  if (!folder) return
  const tasks = await readTasks(folder.uri.fsPath)
  const next = tasks.map((task) => task.id === id ? { ...task, ...patch } : task)
  await writeTasks(folder.uri.fsPath, next)
}

async function readTasks(root) {
  const parsed = await readJson(path.join(root, BRIDGE_DIR, TASKS_FILE))
  return Array.isArray(parsed?.tasks) ? parsed.tasks : []
}

async function writeTasks(root, tasks) {
  const dir = path.join(root, BRIDGE_DIR)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.writeFile(path.join(dir, TASKS_FILE), `${JSON.stringify({ version: 1, updatedAt: Date.now(), tasks }, null, 2)}\n`, 'utf8')
}

class VdAgentAssistantViewProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri
    this.view = null
  }

  resolveWebviewView(view) {
    this.view = view
    view.webview.options = { enableScripts: true }
    view.webview.onDidReceiveMessage(async (message) => {
      if (message?.command === 'refresh') await this.refresh()
      if (message?.command === 'dashboard') await openDashboard()
      if (message?.command === 'index') await rebuildIndex()
      if (message?.command === 'terminal') await openWorkspaceTerminal()
      if (message?.command === 'ask') await runNativeEditorAction('explain', String(message.prompt || 'Review the active file and provide concise guidance.'))
      await this.refresh()
    })
    void this.refresh()
  }

  async refresh() {
    if (!this.view) return
    this.view.webview.html = await assistantHtml()
  }
}

async function assistantHtml() {
  const folder = activeWorkspaceFolder()
  const root = folder?.uri.fsPath || ''
  const tasks = root ? await readTasks(root) : []
  const index = root ? await readIndexSummary(root) : null
  const nonce = String(Date.now())
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
  textarea { width: 100%; min-height: 80px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
  button { margin: 6px 6px 0 0; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 6px 8px; cursor: pointer; }
  .muted { color: var(--vscode-descriptionForeground); }
  .task { border-top: 1px solid var(--vscode-panel-border); padding: 8px 0; }
  .status { font-size: 11px; text-transform: uppercase; }
</style>
</head>
<body>
  <h3>VD Agent</h3>
  <div class="muted">${root ? escapeHtml(root) : 'Open a workspace to use VD Agent.'}</div>
  <div class="muted">Index: ${index ? `${index.files} files, ${index.symbols} symbols` : 'not built'}</div>
  <textarea id="prompt" placeholder="Ask VD about the active file or selection"></textarea>
  <div>
    <button data-command="ask">Ask</button>
    <button data-command="index">Rebuild Index</button>
    <button data-command="dashboard">Dashboard</button>
    <button data-command="terminal">Terminal</button>
    <button data-command="refresh">Refresh</button>
  </div>
  <h4>Tasks</h4>
  ${tasks.slice(0, 8).map((task) => `
    <div class="task">
      <div><strong>${escapeHtml(task.kind)}</strong> <span class="status muted">${escapeHtml(task.status)}</span></div>
      <div class="muted">${escapeHtml(task.file ? vscode.workspace.asRelativePath(task.file) : '')}</div>
      ${task.error ? `<div>${escapeHtml(task.error)}</div>` : ''}
      ${task.result ? `<div class="muted">${escapeHtml(task.result.slice(0, 260))}</div>` : ''}
    </div>
  `).join('') || '<div class="muted">No tasks yet.</div>'}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button[data-command]').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command, prompt: document.getElementById('prompt').value }));
    });
  </script>
</body>
</html>`
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

async function extractVsCodeSymbols(uri) {
  try {
    const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri)
    const out = []
    collectDocumentSymbols(symbols || [], out)
    return unique(out).slice(0, 32)
  } catch {
    return []
  }
}

function collectDocumentSymbols(symbols, out) {
  for (const symbol of symbols || []) {
    if (symbol?.name) out.push(symbol.name)
    if (Array.isArray(symbol?.children)) collectDocumentSymbols(symbol.children, out)
  }
}

function extractImports(text, max = 24) {
  const imports = new Set()
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\(['"]([^'"]+)['"]\)/g,
    /^\s*from\s+([A-Za-z0-9_./-]+)\s+import\b/gm,
    /^\s*import\s+([A-Za-z0-9_./-]+)/gm,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) && imports.size < max) imports.add(match[1])
  }
  return [...imports]
}

function tokenize(text) {
  return [...new Set(String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.$/-]+/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && token.length <= 40))]
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))]
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function delay(ms, token) {
  return new Promise((resolve) => {
    if (token?.isCancellationRequested) return resolve()
    const timer = setTimeout(resolve, ms)
    const disposable = token?.onCancellationRequested?.(() => {
      clearTimeout(timer)
      resolve()
    })
    setTimeout(() => disposable?.dispose?.(), ms + 10)
  })
}

function hashText(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
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

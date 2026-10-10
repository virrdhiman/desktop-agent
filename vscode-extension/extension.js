const fs = require('fs')
const path = require('path')
const vscode = require('vscode')
const { lineDiffHunks, discardHunk, diffStats, compatibleUrl, contentHash } = require('./previewDiff')

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
let lastAiStatus = null
let previewReviewPanel = null
let statusBar
let dashboardPanel = null
let assistantProvider = null
let activeCompletionController = null
const inlineStats = { ai: 0, local: 0, failed: 0, lastLatencyMs: 0, lastAt: 0 }
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
    vscode.commands.registerCommand('vdAgent.reviewLastPreview', openPreviewReview),
    vscode.commands.registerCommand('vdAgent.checkAiStatus', showAiStatus),
    vscode.commands.registerCommand('vdAgent.selectAiModel', selectAiModel),
    vscode.commands.registerCommand('vdAgent.runAutocompleteSmoke', runAutocompleteSmoke),
    vscode.commands.registerCommand('vdAgent.showStatus', showBridgeStatus),
    vscode.commands.registerCommand('vdAgent.openDashboard', openDashboard),
    vscode.commands.registerCommand('vdAgent.fixWithVD', () => runNativeEditorAction('fix')),
    vscode.commands.registerCommand('vdAgent.explainWithVD', () => runNativeEditorAction('explain')),
    vscode.commands.registerCommand('vdAgent.refactorWithVD', () => runNativeEditorAction('refactor')),
    vscode.commands.registerCommand('vdAgent.generateTestsWithVD', () => runNativeEditorAction('tests')),
    vscode.commands.registerCommand('vdAgent.openWorkspaceTerminal', openWorkspaceTerminal),
    vscode.commands.registerCommand('vdAgent.goToDefinition', () => runBuiltInEditorCommand('editor.action.revealDefinition', 'go to definition')),
    vscode.commands.registerCommand('vdAgent.findReferences', () => runBuiltInEditorCommand('editor.action.referenceSearch.trigger', 'find references')),
    vscode.commands.registerCommand('vdAgent.renameSymbol', () => runBuiltInEditorCommand('editor.action.rename', 'rename symbol')),
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
  if (typeof vscode.workspace.onDidGrantWorkspaceTrust === 'function') {
    context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => {
      scheduleIndex()
      void processAllCommands()
      void exportContext()
      updateStatusBar()
      assistantProvider?.refresh?.()
    }))
  }
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
  void checkAiStatus()
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
  if (!isWorkspaceTrusted()) {
    updateStatusBar('$(shield) VD Agent limited mode')
    return
  }
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
  const trusted = isWorkspaceTrusted()
  const index = trusted ? await readIndexSummary(folder.uri.fsPath) : undefined
  const ai = await checkAiStatus({ quiet: true, maxAgeMs: 60_000 })
  const preview = trusted ? await readPreviewSummary(folder.uri.fsPath) : undefined
  const state = {
    version: 1,
    mode: trusted ? 'trusted' : 'limited',
    workspaceTrusted: trusted,
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
    ai,
    preview,
  }
  await fs.promises.mkdir(targetDir, { recursive: true })
  await fs.promises.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  return target
}

async function rebuildIndex() {
  if (!requireWorkspaceTrust('rebuild the VD Agent workspace index')) return null
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
  const previousIndex = latestIndex?.workspacePath === root ? latestIndex : await readJson(target)
  const previousFiles = new Map(
    previousIndex?.version === 1 && previousIndex.workspacePath === root && previousIndex.maxSemanticSymbolFiles === maxSemanticSymbolFiles
      ? (previousIndex.files || []).map((file) => [file.path, file])
      : [],
  )
  let totalBytes = 0
  let semanticFiles = 0
  for (const uri of uris) {
    if (uri.scheme !== 'file' || !isTextFile(uri.fsPath) || !isFileInside(root, uri.fsPath)) continue
    if (path.relative(root, uri.fsPath).split(path.sep).some((part) => part.startsWith('.'))) continue
    const stat = await fs.promises.stat(uri.fsPath).catch(() => null)
    if (!stat || stat.size > MAX_FILE_BYTES) continue
    const relativePath = vscode.workspace.asRelativePath(uri)
    const previous = previousFiles.get(relativePath)
    if (previous && previous.sourceBytes === stat.size && previous.mtimeMs === Number(stat.mtimeMs || 0)) {
      files.push(previous)
      totalBytes += previous.bytes
      if (previous.semanticIndexed) semanticFiles += 1
      continue
    }
    const text = await fs.promises.readFile(uri.fsPath, 'utf8').catch(() => '')
    const semanticIndexed = semanticFiles < maxSemanticSymbolFiles
    const semanticSymbols = semanticIndexed ? await extractVsCodeSymbols(uri) : []
    if (semanticIndexed) semanticFiles += 1
    const regexSymbols = extractSymbols(text, 16)
    const symbols = unique([...semanticSymbols, ...regexSymbols]).slice(0, 32)
    const imports = extractImports(text, 24)
    const dependencies = extractImportSpecifiers(text, 30)
    const snippets = extractContextSnippets(text, symbols, imports, 6)
    const tokens = tokenize(`${relativePath} ${symbols.join(' ')} ${imports.join(' ')} ${dependencies.join(' ')} ${snippets.join(' ')} ${text.slice(0, 40000)}`).slice(0, 140)
    totalBytes += Buffer.byteLength(text)
    files.push({
      path: relativePath,
      language: languageFor(uri.fsPath),
      bytes: Buffer.byteLength(text),
      mtimeMs: Number(stat.mtimeMs || 0),
      sourceBytes: stat.size,
      semanticIndexed,
      symbols,
      imports,
      dependencies,
      snippets,
      tokens,
    })
  }
  latestIndex = {
    version: 1,
    workspacePath: root,
    maxSemanticSymbolFiles,
    updatedAt: Date.now(),
    files,
    fileCount: files.length,
    symbolCount: files.reduce((sum, file) => sum + file.symbols.length, 0),
    importCount: files.reduce((sum, file) => sum + file.imports.length, 0),
    dependencyCount: files.reduce((sum, file) => sum + file.dependencies.length, 0),
    snippetCount: files.reduce((sum, file) => sum + file.snippets.length, 0),
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
    dependencies: Number(index.dependencyCount || 0),
    snippets: Number(index.snippetCount || 0),
    semanticFiles: Number(index.semanticFiles || 0),
    bytes: Number(index.totalBytes || 0),
  }
}

async function provideInlineCompletions(document, position, _context, token) {
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  if (!config.get('inlineCompletion', true)) return []
  if (document.uri.scheme !== 'file' || document.lineAt(position.line).text.trimStart().startsWith('//')) return []
  const local = await provideLocalInlineCompletions(document, position, token)
  if (!isWorkspaceTrusted()) {
    noteInlineFallback(local)
    return local
  }
  if (!config.get('aiInlineCompletion', true) || config.get('aiProvider', 'ollama') === 'disabled') {
    noteInlineFallback(local)
    return local
  }
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character)
  if (!/[A-Za-z_$\])}.'"`][\w$.'"`)\]} ]{0,80}$/.test(linePrefix) && linePrefix.trim().length > 0) {
    noteInlineFallback(local)
    return local
  }
  const delayMs = config.get('aiAutocompleteDelayMs', 220)
  await delay(delayMs, token)
  if (token?.isCancellationRequested) return []
  const cacheKey = completionCacheKey(document, position)
  const cached = completionCache.get(cacheKey)
  if (cached && Date.now() - cached.at < 30_000) {
    inlineStats.ai += 1
    inlineStats.lastAt = Date.now()
    return inlineList(cached.text, position, local)
  }
  try {
    const started = Date.now()
    const text = await requestAiInlineCompletion(document, position, token)
    inlineStats.lastLatencyMs = Date.now() - started
    if (!text) {
      noteInlineFallback(local)
      return local
    }
    completionCache.set(cacheKey, { at: Date.now(), text })
    trimCompletionCache()
    inlineStats.ai += 1
    inlineStats.lastAt = Date.now()
    return inlineList(text, position, local)
  } catch {
    inlineStats.failed += 1
    noteInlineFallback(local)
    return local
  }
}

function noteInlineFallback(local) {
  const count = Array.isArray(local?.items) ? local.items.length : 0
  if (count > 0) {
    inlineStats.local += 1
    inlineStats.lastAt = Date.now()
    updateStatusBar()
  }
}

async function provideLocalInlineCompletions(document, position, token) {
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character)
  const match = linePrefix.match(/[A-Za-z_$][\w$]{2,}$/)
  if (!match) return []
  const prefix = match[0]
  const prefixLower = prefix.toLowerCase()
  const localText = document.getText().slice(Math.max(0, document.offsetAt(position) - 10000), document.offsetAt(position) + 10000)
  const localWords = completionWords(localText)
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  const vsCodeItems = config.get('vsCodeCompletionFallback', true)
    ? await provideVsCodeCompletionFallback(document, position, prefix, token)
    : []
  const candidates = new Map()
  const addCandidate = (value, score) => {
    if (typeof value !== 'string' || !value) return
    candidates.set(value, Math.max(score, candidates.get(value) || 0))
  }
  for (const item of vsCodeItems) addCandidate(item, 8)
  for (const word of localWords) addCandidate(word, 3)
  for (const word of tokenize(localText)) addCandidate(word, 2)
  for (const file of latestIndex?.files || []) {
    for (const symbol of file.symbols || []) addCandidate(symbol, 6)
    for (const imported of file.imports || []) addCandidate(imported, 5)
    for (const dependency of file.dependencies || []) addCandidate(path.basename(dependency).replace(/\.[^.]+$/, ''), 4)
    for (const word of file.tokens || []) addCandidate(word, 1)
  }
  const items = [...candidates.entries()]
    .filter(([item]) => typeof item === 'string' && item.length > prefix.length && item.toLowerCase().startsWith(prefixLower))
    .map(([item, score]) => ({ item, score }))
    .filter(({ item }) => item !== prefix && /^[A-Za-z_$][\w$.-]*$/.test(item))
    .sort((a, b) => b.score - a.score || a.item.length - b.item.length || a.item.localeCompare(b.item))
    .slice(0, 5)
    .map(({ item }) => new vscode.InlineCompletionItem(item.slice(prefix.length), new vscode.Range(position, position)))
  return new vscode.InlineCompletionList(items)
}

async function provideVsCodeCompletionFallback(document, position, prefix, token) {
  if (token?.isCancellationRequested) return []
  try {
    const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, position)
    if (token?.isCancellationRequested) return []
    const items = Array.isArray(list?.items) ? list.items : []
    return unique(items
      .map((item) => completionLabelToString(item.label) || completionLabelToString(item.insertText))
      .filter((item) => item && item.toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, 20))
  } catch {
    return []
  }
}

function completionLabelToString(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    if (typeof value.label === 'string') return value.label
    if (typeof value.value === 'string') return value.value
  }
  return ''
}

function completionWords(text) {
  const words = []
  const seen = new Set()
  const pattern = /[A-Za-z_$][\w$]{2,}/g
  let match
  while ((match = pattern.exec(String(text || ''))) && words.length < 500) {
    const word = match[0]
    const key = word.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      words.push(word)
    }
  }
  return words
}

async function runAutocompleteSmoke() {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.uri.scheme !== 'file') {
    return vscode.window.showWarningMessage('Open a code file and place the cursor after a prefix before running the VD autocomplete smoke test.')
  }
  const list = await provideLocalInlineCompletions(editor.document, editor.selection.active)
  const items = Array.isArray(list?.items) ? list.items : []
  const suggestions = items
    .map((item) => typeof item.insertText === 'string' ? item.insertText : item.insertText?.value)
    .filter(Boolean)
    .slice(0, 5)
  if (!suggestions.length) {
    return vscode.window.showWarningMessage('VD autocomplete smoke found no local suggestion at this cursor. Type a prefix such as "customer" after related words in the file, then retry.')
  }
  inlineStats.local += 1
  inlineStats.lastAt = Date.now()
  updateStatusBar()
  vscode.window.showInformationMessage(`VD autocomplete smoke passed: ${suggestions.join(', ')}`)
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
  if (!isWorkspaceTrusted()) {
    updateStatusBar('$(shield) VD Agent limited mode')
    return
  }
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
      const response = await fetch(compatibleUrl(baseUrl, 'chat/completions'), {
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

async function checkAiStatus(options = {}) {
  const maxAgeMs = Number(options.maxAgeMs || 0)
  if (lastAiStatus && maxAgeMs > 0 && Date.now() - lastAiStatus.checkedAt < maxAgeMs) return lastAiStatus
  const config = vscode.workspace.getConfiguration('vdAgentBridge')
  const provider = config.get('aiProvider', 'ollama')
  const baseUrl = String(config.get('aiBaseUrl', 'http://localhost:11434')).replace(/\/+$/, '')
  const model = String(config.get('aiModel', 'qwen2.5-coder:1.5b')).trim()
  const started = Date.now()
  const status = {
    provider,
    baseUrl,
    model,
    ok: false,
    checkedAt: Date.now(),
    latencyMs: 0,
    models: [],
    message: '',
    inline: { ...inlineStats },
  }
  if (provider === 'disabled') {
    status.message = 'AI is disabled; local symbol completion is still available.'
    lastAiStatus = status
    return status
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2500)
  try {
    if (provider === 'ollama') {
      const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal })
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`)
      const data = await response.json()
      status.models = Array.isArray(data?.models) ? data.models.map((item) => item.name || item.model).filter(Boolean) : []
      status.ok = !model || status.models.includes(model)
      status.message = status.ok
        ? `Ollama ready with ${model || 'configured model'}.`
        : status.models.length
          ? `Ollama is running, but ${model} is not installed.`
          : 'Ollama is running, but no local models are installed.'
    } else {
      const response = await fetch(compatibleUrl(baseUrl, 'models'), {
        headers: config.get('aiApiKey', '') ? { Authorization: `Bearer ${config.get('aiApiKey')}` } : {},
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`)
      const data = await response.json()
      status.models = Array.isArray(data?.data) ? data.data.map((item) => item.id).filter(Boolean) : []
      status.ok = !model || status.models.length === 0 || status.models.includes(model)
      status.message = status.ok ? `Provider reachable with ${model || 'configured model'}.` : `${model} was not returned by the provider.`
    }
  } catch (err) {
    status.message = `${provider} is not reachable: ${err?.message || err}`
  } finally {
    clearTimeout(timeout)
    status.latencyMs = Date.now() - started
    status.inline = { ...inlineStats }
    lastAiStatus = status
    updateStatusBar()
  }
  return status
}

async function showAiStatus() {
  const status = await checkAiStatus({ maxAgeMs: 0 })
  const detail = [
    `Provider: ${status.provider}`,
    `Model: ${status.model || 'not set'}`,
    `Base URL: ${status.baseUrl}`,
    `Reachable: ${status.ok ? 'yes' : 'no'}`,
    `Latency: ${status.latencyMs}ms`,
    `Inline completions: ${status.inline.ai} AI, ${status.inline.local} local fallback, ${status.inline.failed} failed`,
    status.models.length ? `Installed/available models: ${status.models.slice(0, 20).join(', ')}` : 'Installed/available models: none detected',
  ].join('\n')
  vscode.window.showInformationMessage(status.message || 'VD Agent AI status checked.', { modal: true, detail })
  assistantProvider?.refresh?.()
}

async function selectAiModel() {
  const status = await checkAiStatus({ maxAgeMs: 0 })
  if (!status.models.length) {
    return vscode.window.showWarningMessage('No local/provider models were found. For Ollama, run: ollama pull qwen2.5-coder:1.5b')
  }
  const selected = await vscode.window.showQuickPick(status.models, {
    title: 'VD Agent AI model',
    placeHolder: 'Choose the model used for inline autocomplete and editor actions',
  })
  if (!selected) return
  await vscode.workspace.getConfiguration('vdAgentBridge').update('aiModel', selected, vscode.ConfigurationTarget.Workspace)
  lastAiStatus = null
  await checkAiStatus({ maxAgeMs: 0 })
  vscode.window.showInformationMessage(`VD Agent model set to ${selected}`)
  assistantProvider?.refresh?.()
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
      const haystack = new Set([...(entry.tokens || []), ...(entry.symbols || []).flatMap(tokenize), ...(entry.imports || []).flatMap(tokenize), ...(entry.dependencies || []).flatMap(tokenize)])
      let score = 0
      for (const token of query) if (haystack.has(token)) score += 1
      if (sameDirectory(activeRel, entry.path)) score += 2
      if ((active?.dependencies || []).some((dependency) => entry.path.endsWith(normalizeDependencyPath(dependency)))) score += 4
      return { entry, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
    .slice(0, limit)
    .map(({ entry }) => `${entry.path}: symbols=${(entry.symbols || []).slice(0, 8).join(', ')} imports=${(entry.imports || []).slice(0, 6).join(', ')} snippets=${(entry.snippets || []).slice(0, 2).join(' | ')}`)
    .join('\n')
}

function sameDirectory(a, b) {
  return path.dirname(a.replace(/\\/g, '/')) === path.dirname(b.replace(/\\/g, '/'))
}

function normalizeDependencyPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss)$/i, '')
}

async function processCommandFile(commandFile, root) {
  if (!isWorkspaceTrusted()) {
    const id = path.basename(commandFile, '.json')
    await writeCommandResult(root, id, {
      ok: false,
      message: 'VS Code is in Restricted Mode. Trust this workspace before VD Agent processes bridge commands.',
      action: 'restricted',
    })
    return
  }
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
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  const before = document.getText()
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
    baseHash: contentHash(before),
    title: vscode.workspace.asRelativePath(file),
    stats: diffStats(before, after),
  }, null, 2)}\n`, 'utf8')
  updateStatusBar()
  return preview
}

async function acceptLastPreview() {
  if (!requireWorkspaceTrust('accept VD Agent preview edits')) return
  const folder = activeWorkspaceFolder()
  if (!folder) return vscode.window.showWarningMessage('Open a workspace before accepting a VD Agent preview.')
  const metaPath = path.join(folder.uri.fsPath, BRIDGE_DIR, LAST_PREVIEW_FILE)
  const meta = await readJson(metaPath)
  if (!meta?.file || !meta?.preview) return vscode.window.showWarningMessage('No VD Agent preview is waiting to accept.')
  const file = resolveInside(folder.uri.fsPath, meta.file)
  const preview = resolveInside(folder.uri.fsPath, meta.preview)
  const after = await fs.promises.readFile(preview, 'utf8')
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  if (!previewMatches(meta, document.getText())) return
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
  if (!requireWorkspaceTrust('reject VD Agent preview edits')) return
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

async function openPreviewReview() {
  if (!requireWorkspaceTrust('review VD Agent patch previews')) return
  const folder = activeWorkspaceFolder()
  if (!folder) return vscode.window.showWarningMessage('Open a workspace before reviewing a VD Agent preview.')
  if (previewReviewPanel) {
    previewReviewPanel.reveal(vscode.ViewColumn.Beside)
    previewReviewPanel.webview.html = await previewReviewHtml(folder.uri.fsPath)
    return
  }
  previewReviewPanel = vscode.window.createWebviewPanel(
    'vdAgentPreviewReview',
    'VD Agent Patch Review',
    vscode.ViewColumn.Beside,
    { enableScripts: true },
  )
  previewReviewPanel.onDidDispose(() => { previewReviewPanel = null })
  previewReviewPanel.webview.onDidReceiveMessage(async (message) => {
    if (message?.command === 'accept') await acceptLastPreview()
    if (message?.command === 'reject') await rejectLastPreview()
    if (message?.command === 'openDiff') await openLastPreviewDiff()
    if (message?.command === 'discardHunk') await discardPreviewHunk(Number(message.index))
    if (previewReviewPanel) previewReviewPanel.webview.html = await previewReviewHtml(folder.uri.fsPath)
  })
  previewReviewPanel.webview.html = await previewReviewHtml(folder.uri.fsPath)
}

async function openLastPreviewDiff() {
  const folder = activeWorkspaceFolder()
  if (!folder) return
  const meta = await readJson(path.join(folder.uri.fsPath, BRIDGE_DIR, LAST_PREVIEW_FILE))
  if (!meta?.file || !meta?.preview) return vscode.window.showWarningMessage('No VD Agent preview is waiting to review.')
  const file = resolveInside(folder.uri.fsPath, meta.file)
  const preview = resolveInside(folder.uri.fsPath, meta.preview)
  await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(file), vscode.Uri.file(preview), `VD Agent Preview: ${path.basename(file)}`)
}

async function discardPreviewHunk(index) {
  const folder = activeWorkspaceFolder()
  if (!folder) return
  const meta = await readJson(path.join(folder.uri.fsPath, BRIDGE_DIR, LAST_PREVIEW_FILE))
  if (!meta?.file || !meta?.preview) return vscode.window.showWarningMessage('No VD Agent preview is waiting to review.')
  const file = resolveInside(folder.uri.fsPath, meta.file)
  const preview = resolveInside(folder.uri.fsPath, meta.preview)
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  const before = document.getText()
  if (!previewMatches(meta, before)) return
  const after = await fs.promises.readFile(preview, 'utf8')
  const nextAfter = discardHunk(before, after, index)
  if (nextAfter === null) return vscode.window.showWarningMessage('That VD Agent preview hunk no longer exists.')
  await fs.promises.writeFile(preview, nextAfter, 'utf8')
  await fs.promises.writeFile(path.join(folder.uri.fsPath, BRIDGE_DIR, LAST_PREVIEW_FILE), `${JSON.stringify({
    ...meta,
    updatedAt: Date.now(),
    stats: diffStats(before, nextAfter),
  }, null, 2)}\n`, 'utf8')
  vscode.window.showInformationMessage(`Discarded VD Agent preview hunk ${index + 1}.`)
}

async function readPreviewSummary(root) {
  const meta = await readJson(path.join(root, BRIDGE_DIR, LAST_PREVIEW_FILE))
  if (!meta?.file || !meta?.preview) return undefined
  const file = resolveInside(root, meta.file)
  const preview = resolveInside(root, meta.preview)
  const before = await fs.promises.readFile(file, 'utf8').catch(() => '')
  const after = await fs.promises.readFile(preview, 'utf8').catch(() => '')
  const stats = diffStats(before, after)
  return {
    file: vscode.workspace.asRelativePath(file),
    preview: vscode.workspace.asRelativePath(preview),
    createdAt: Number(meta.createdAt || 0),
    updatedAt: Number(meta.updatedAt || meta.createdAt || 0),
    hunks: stats.hunks,
    additions: stats.additions,
    deletions: stats.deletions,
  }
}

function previewMatches(meta, text) {
  if (meta.baseHash === contentHash(text)) return true
  vscode.window.showWarningMessage('The file changed after this VD Agent preview was created. Review or reject it and request a fresh preview; your newer edits were not overwritten.')
  return false
}

async function previewReviewHtml(root) {
  const meta = await readJson(path.join(root, BRIDGE_DIR, LAST_PREVIEW_FILE))
  const nonce = String(Date.now())
  if (!meta?.file || !meta?.preview) {
    return htmlPage(nonce, `
      <main class="empty">
        <h1>VD Agent Patch Review</h1>
        <p>No preview is waiting. Ask VD to show a diff preview first.</p>
      </main>
    `)
  }
  const file = resolveInside(root, meta.file)
  const preview = resolveInside(root, meta.preview)
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  const before = document.getText()
  const after = await fs.promises.readFile(preview, 'utf8').catch(() => '')
  const stale = meta.baseHash !== contentHash(before)
  const hunks = lineDiffHunks(before, after)
  const stats = diffStats(before, after)
  return htmlPage(nonce, `
    <header class="hero">
      <div>
        <h1>Patch Review</h1>
        <p>${escapeHtml(vscode.workspace.asRelativePath(file))}</p>
      </div>
      <div class="pills">
        <span class="pill">${stats.hunks} hunks</span>
        <span class="pill add">+${stats.additions}</span>
        <span class="pill del">-${stats.deletions}</span>
      </div>
    </header>
    ${stale ? '<p class="conflict">This file changed since the preview was created. Reject this preview and request a new one; newer edits will not be overwritten.</p>' : ''}
    <section class="actions">
      <button data-command="openDiff">Open Diff</button>
      <button data-command="accept" ${stale ? 'disabled' : ''}>Accept Remaining</button>
      <button class="secondary" data-command="reject">Reject All</button>
    </section>
    <section class="hunks">
      ${hunks.map((hunk, index) => `
        <article class="hunk">
          <div class="hunk-head">
            <strong>Hunk ${index + 1}</strong>
            <span class="muted">old ${hunk.oldStart + 1}-${hunk.oldEnd}, new ${hunk.newStart + 1}-${hunk.newEnd}</span>
            <button class="secondary" data-command="discardHunk" data-index="${index}" ${stale ? 'disabled' : ''}>Discard Hunk</button>
          </div>
          <pre>${escapeHtml(renderHunk(hunk))}</pre>
        </article>
      `).join('') || '<p class="muted">No remaining changes. Accepting will leave the file unchanged.</p>'}
    </section>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('button[data-command]').forEach((button) => {
        button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command, index: button.dataset.index }));
      });
    </script>
  `)
}

function provideVdCodeActions(document, range, context) {
  if (!isWorkspaceTrusted()) return []
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
  if (!requireWorkspaceTrust('use VD Agent native editor actions')) return
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
  if (!requireWorkspaceTrust('open a VD Agent workspace terminal')) return
  const folder = activeWorkspaceFolder()
  const terminal = vscode.window.createTerminal({ name: 'VD Agent', cwd: folder?.uri.fsPath })
  terminal.show()
}

async function runBuiltInEditorCommand(command, label) {
  if (!requireWorkspaceTrust(label)) return
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.uri.scheme !== 'file') {
    return vscode.window.showWarningMessage(`Open a code file before using VD Agent ${label}.`)
  }
  await vscode.commands.executeCommand(command)
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
    `Mode: ${isWorkspaceTrusted() ? 'trusted' : 'limited restricted-workspace mode'}`,
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
    new vscode.CodeLens(top, { title: '$(diff) Review VD Agent Hunks', command: 'vdAgent.reviewLastPreview' }),
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
    if (message?.command === 'review') await openPreviewReview()
    if (message?.command === 'ai') await showAiStatus()
    if (message?.command === 'model') await selectAiModel()
    if (dashboardPanel) dashboardPanel.webview.html = await dashboardHtml(folder.uri.fsPath)
  })
  dashboardPanel.webview.html = await dashboardHtml(folder.uri.fsPath)
}

async function dashboardHtml(root) {
  const trusted = isWorkspaceTrusted()
  const index = trusted ? await readIndexSummary(root) : null
  const pending = (await fs.promises.readdir(path.join(root, COMMAND_DIR)).catch(() => []))
    .filter((entry) => entry.endsWith('.json')).length
  const preview = trusted ? await readJson(path.join(root, BRIDGE_DIR, LAST_PREVIEW_FILE)) : null
  const bridge = await readJson(path.join(root, BRIDGE_DIR, BRIDGE_FILE))
  const ai = await checkAiStatus({ quiet: true, maxAgeMs: 60_000 })
  const nonce = String(Date.now())
  const activeFile = bridge?.activeFile ? vscode.workspace.asRelativePath(bridge.activeFile) : 'None'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 18px; }
  h1 { font-size: 20px; margin: 0; }
  .hero { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
  .hero p { color: var(--vscode-descriptionForeground); margin: 4px 0 0; }
  .grid { display: grid; gap: 10px; }
  .row { display: grid; grid-template-columns: 150px 1fr; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  .label { color: var(--vscode-descriptionForeground); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 7px 10px; cursor: pointer; }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  .pill { display: inline-flex; align-items: center; border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 4px 9px; color: var(--vscode-descriptionForeground); }
  .ok { color: var(--vscode-testing-iconPassed); }
  .bad { color: var(--vscode-testing-iconFailed); }
  code { word-break: break-all; }
</style>
</head>
<body>
  <div class="hero">
    <div>
      <h1>VD Agent Bridge</h1>
      <p>${trusted ? 'Native VS Code context, edits, autocomplete, and review controls.' : 'Restricted Mode: active-editor export and autocomplete are available. Trust the workspace for indexing, terminals, commands, and edit workflows.'}</p>
    </div>
    <span class="pill ${ai.ok ? 'ok' : 'bad'}">${ai.ok ? 'AI ready' : 'AI needs attention'}</span>
  </div>
  <div class="grid">
    <div class="row"><div class="label">Workspace</div><code>${escapeHtml(root)}</code></div>
    <div class="row"><div class="label">Mode</div><div>${trusted ? 'Trusted workspace' : 'Limited Restricted Mode'}</div></div>
    <div class="row"><div class="label">Active file</div><div>${escapeHtml(activeFile)}</div></div>
    <div class="row"><div class="label">Pending commands</div><div>${pending}</div></div>
    <div class="row"><div class="label">Index</div><div>${index ? `${index.files} files, ${index.symbols} symbols, ${index.imports || 0} imports, ${index.semanticFiles || 0} semantic files` : 'Not built yet'}</div></div>
    <div class="row"><div class="label">AI model</div><div>${escapeHtml(ai.model || 'not set')} · ${escapeHtml(ai.message || '')}</div></div>
    <div class="row"><div class="label">Preview</div><div>${preview?.file ? `${escapeHtml(vscode.workspace.asRelativePath(preview.file))}${preview.stats ? ` · ${preview.stats.hunks} hunks, +${preview.stats.additions}/-${preview.stats.deletions}` : ''}` : 'None'}</div></div>
  </div>
  <div class="actions">
    <button data-command="export">Export Context</button>
    <button data-command="index">Rebuild Index</button>
    <button data-command="process">Process Commands</button>
    <button data-command="ai">AI Status</button>
    <button data-command="model">Select Model</button>
    <button data-command="review">Review Preview</button>
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
      if (message?.command === 'definition') await runBuiltInEditorCommand('editor.action.revealDefinition', 'go to definition')
      if (message?.command === 'references') await runBuiltInEditorCommand('editor.action.referenceSearch.trigger', 'find references')
      if (message?.command === 'rename') await runBuiltInEditorCommand('editor.action.rename', 'rename symbol')
      if (message?.command === 'ai') await showAiStatus()
      if (message?.command === 'model') await selectAiModel()
      if (message?.command === 'review') await openPreviewReview()
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
  const trusted = isWorkspaceTrusted()
  const index = root && trusted ? await readIndexSummary(root) : null
  const ai = await checkAiStatus({ quiet: true, maxAgeMs: 60_000 })
  const preview = root && trusted ? await readPreviewSummary(root) : null
  const nonce = String(Date.now())
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
  h3 { margin: 0 0 6px; font-size: 16px; }
  textarea { width: 100%; min-height: 86px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 6px; padding: 8px; resize: vertical; }
  button { margin: 6px 6px 0 0; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 4px; padding: 6px 8px; cursor: pointer; }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  .muted { color: var(--vscode-descriptionForeground); }
  .panel { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; margin: 10px 0; }
  .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
  .metric { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; }
  .metric strong { display: block; font-size: 15px; }
  .task { border-top: 1px solid var(--vscode-panel-border); padding: 8px 0; }
  .status { font-size: 11px; text-transform: uppercase; }
  .ok { color: var(--vscode-testing-iconPassed); }
  .bad { color: var(--vscode-testing-iconFailed); }
</style>
</head>
<body>
  <h3>VD Agent</h3>
  <div class="muted">${root ? escapeHtml(root) : 'Open a workspace to use VD Agent.'}</div>
  ${trusted ? '' : '<div class="panel"><strong>Limited mode</strong><div class="muted">Active-editor export and inline autocomplete are available. Trust this workspace to enable indexing, terminals, command execution, and edit/apply workflows.</div></div>'}
  <div class="metrics">
    <div class="metric"><span class="muted">AI</span><strong class="${ai.ok ? 'ok' : 'bad'}">${ai.ok ? 'Ready' : 'Check'}</strong><div class="muted">${escapeHtml(ai.model || 'no model')}</div></div>
    <div class="metric"><span class="muted">Index</span><strong>${index ? index.files : 0}</strong><div class="muted">${index ? `${index.symbols} symbols` : 'not built'}</div></div>
    <div class="metric"><span class="muted">Preview</span><strong>${preview ? preview.hunks : 0}</strong><div class="muted">${preview ? `+${preview.additions}/-${preview.deletions}` : 'none'}</div></div>
    <div class="metric"><span class="muted">Inline</span><strong>${ai.inline?.ai || 0}</strong><div class="muted">${ai.inline?.local || 0} local fallbacks</div></div>
  </div>
  <textarea id="prompt" placeholder="Ask VD about the active file or selection"></textarea>
  <div>
    <button data-command="ask">Ask</button>
    <button data-command="index">Rebuild Index</button>
    <button data-command="definition">Definition</button>
    <button data-command="references">References</button>
    <button data-command="rename">Rename</button>
    <button data-command="ai">AI Status</button>
    <button data-command="model">Model</button>
    <button data-command="review">Review Patch</button>
    <button data-command="dashboard">Dashboard</button>
    <button class="secondary" data-command="terminal">Terminal</button>
    <button class="secondary" data-command="refresh">Refresh</button>
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
  const aiText = lastAiStatus ? (lastAiStatus.ok ? lastAiStatus.model : 'AI check') : 'AI'
  const modeText = isWorkspaceTrusted() ? indexText : 'limited'
  statusBar.text = text || `$(sparkle) VD Agent ${modeText} · ${aiText}`
  statusBar.tooltip = lastAiStatus
    ? `VD Agent Bridge\nMode: ${isWorkspaceTrusted() ? 'trusted' : 'limited restricted workspace'}\n${lastAiStatus.message}\nAI completions: ${inlineStats.ai}; local fallbacks: ${inlineStats.local}; failed: ${inlineStats.failed}`
    : 'VD Agent Bridge: export context, process commands, accept previews, and maintain local index.'
  statusBar.show()
}

function isWorkspaceTrusted() {
  return vscode.workspace.isTrusted !== false
}

function requireWorkspaceTrust(action) {
  if (isWorkspaceTrusted()) return true
  vscode.window.showWarningMessage(`VD Agent limited mode: trust this workspace before VD Agent can ${action}.`)
  updateStatusBar('$(shield) VD Agent limited mode')
  return false
}

function renderHunk(hunk) {
  const oldSlice = hunk.oldLines.slice(hunk.oldStart, hunk.oldEnd)
  const newSlice = hunk.newLines.slice(hunk.newStart, hunk.newEnd)
  return [...oldSlice.map((line) => `- ${line}`), ...newSlice.map((line) => `+ ${line}`)].join('\n')
}

function htmlPage(nonce, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 18px; }
  h1 { font-size: 20px; margin: 0; }
  p { color: var(--vscode-descriptionForeground); }
  .hero { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
  .pills { display: flex; gap: 6px; flex-wrap: wrap; }
  .pill { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 4px 9px; color: var(--vscode-descriptionForeground); }
  .add { color: var(--vscode-gitDecoration-addedResourceForeground); }
  .del { color: var(--vscode-gitDecoration-deletedResourceForeground); }
  .conflict { padding: 10px; border-left: 3px solid var(--vscode-inputValidation-warningBorder); color: var(--vscode-foreground); background: var(--vscode-inputValidation-warningBackground); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0; }
  button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 4px; padding: 7px 10px; cursor: pointer; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  .hunks { display: grid; gap: 12px; }
  .hunk { border: 1px solid var(--vscode-panel-border); border-radius: 8px; overflow: hidden; }
  .hunk-head { display: flex; align-items: center; gap: 10px; justify-content: space-between; padding: 8px 10px; background: var(--vscode-editorWidget-background); }
  .muted { color: var(--vscode-descriptionForeground); }
  pre { margin: 0; padding: 10px; overflow: auto; background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
  .empty { max-width: 620px; }
</style>
</head>
<body>${body}</body>
</html>`
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

function extractImportSpecifiers(text, max = 30) {
  return extractImports(text, max)
    .map((item) => String(item).replace(/\\/g, '/'))
    .filter((item) => item.startsWith('.') || item.includes('/'))
    .slice(0, max)
}

function extractContextSnippets(text, symbols, imports, max = 6) {
  const lines = String(text || '').split(/\r?\n/)
  const needles = unique([...symbols, ...imports])
    .filter((item) => item.length >= 3)
    .slice(0, 24)
  const snippets = []
  const seen = new Set()
  for (let i = 0; i < lines.length && snippets.length < max; i += 1) {
    const line = lines[i]
    if (!needles.some((needle) => line.includes(needle))) continue
    const start = Math.max(0, i - 1)
    const end = Math.min(lines.length, i + 2)
    const snippet = lines.slice(start, end).map((value) => value.trim()).filter(Boolean).join(' ').slice(0, 240)
    const key = snippet.toLowerCase()
    if (snippet && !seen.has(key)) {
      seen.add(key)
      snippets.push(`${i + 1}: ${snippet}`)
    }
  }
  return snippets
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

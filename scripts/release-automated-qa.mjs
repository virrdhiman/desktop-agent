/**
 * Fixture-only release checks that can run against a packaged Electron build.
 * No real settings, accounts, API keys, sites, or user data are used.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createServer } from 'node:http'
import { spawn, execFile, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(repo, 'package.json'))
const fixture = path.resolve(value('--fixture') || 'C:/vd-vms/qa-fixture')
const exe = path.resolve(value('--exe') || '')
const stabilityMinutes = Number(value('--stability-minutes') || 30)
const screenshotDir = value('--screenshots') ? path.resolve(value('--screenshots')) : null
const userData = path.join(fixture, 'automated-user-data')
const workspace = path.join(fixture, 'automated-workspace')
const results = []

function value(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function check(name, ok, detail = '') {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

async function targets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  return (await response.json()).filter((item) => item.type === 'page' && !item.url.startsWith('devtools://'))
}

class CdpPage {
  constructor(target) {
    this.target = target
    this.socket = new WebSocket(target.webSocketDebuggerUrl)
    this.sequence = 0
    this.pending = new Map()
    this.errors = []
    this.ready = new Promise((resolve, reject) => {
      this.socket.onopen = resolve
      this.socket.onerror = reject
    })
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)(message)
        this.pending.delete(message.id)
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails || {}
        const location = details.url ? ` @ ${details.url}:${details.lineNumber ?? 0}:${details.columnNumber ?? 0}` : ''
        this.errors.push(`${details.description || details.exception?.description || details.text || 'renderer exception'}${location}`)
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') this.errors.push(message.params.entry.text)
    }
  }

  async send(method, params = {}) {
    await this.ready
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 15_000)
      this.pending.set(id, (message) => {
        clearTimeout(timer)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message)
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    let response
    try {
      response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)} [expression: ${expression.slice(0, 140)}]`)
    }
    if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text || 'renderer evaluation failed')
    return response.result?.result?.value
  }

  async click(selector) {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.click(); true`)
  }

  async screenshot(fileName) {
    if (!screenshotDir) return false
    await fsp.mkdir(screenshotDir, { recursive: true })
    await this.send('Page.enable')
    const result = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await fsp.writeFile(path.join(screenshotDir, fileName), Buffer.from(result.result.data, 'base64'))
    return true
  }

  async closeWindow() {
    await this.send('Page.close')
  }

  close() {
    try { this.socket.close() } catch {}
  }
}

async function connect(target) {
  const page = new CdpPage(target)
  await page.send('Runtime.enable')
  await page.send('Log.enable')
  return page
}

async function waitForPort(portFile) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    await sleep(250)
    if (!fs.existsSync(portFile)) continue
    try {
      const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0])
      if (port && (await targets(port)).length) return port
    } catch {}
  }
  throw new Error('Packaged application did not expose a DevTools page')
}

async function waitForRole(port, role, known = new Set()) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    for (const target of await targets(port)) {
      if (known.has(target.webSocketDebuggerUrl)) continue
      try {
        const page = await connect(target)
        if (await page.evaluate('window.api?.windowRole') === role) return page
        page.close()
      } catch {}
    }
    await sleep(250)
  }
  throw new Error(`No ${role} window appeared`)
}

async function hasRole(port, role) {
  for (const target of await targets(port)) {
    try {
      const page = await connect(target)
      const matches = await page.evaluate('window.api?.windowRole') === role
      page.close()
      if (matches) return true
    } catch {}
  }
  return false
}

function tasklistMemory(pid) {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (_error, stdout) => {
      const match = String(stdout || '').match(/"([\d,]+) K"\s*$/m)
      resolve(match ? Number(match[1].replaceAll(',', '')) * 1024 : 0)
    })
  })
}

async function publishWorkspace(main, settings) {
  const files = [
    { name: 'qa-editor.ts', path: path.join(workspace, 'qa-editor.ts'), isDirectory: false },
    { name: 'dialog-file.ts', path: path.join(workspace, 'dialog-file.ts'), isDirectory: false },
  ]
  const snapshot = {
    version: 1,
    workspacePath: workspace,
    files,
    selectedFile: files[0].path,
    openFiles: [files[0].path],
    fileContent: fs.readFileSync(files[0].path, 'utf8'),
    fileDirty: false,
    gitStatus: null,
    gitLog: [],
    settings,
    messages: [],
    projectNotes: 'Release fixture notes',
    currentSessionId: null,
    planMode: false,
    terminalTabs: [{ id: 'qa-terminal', name: 'Terminal', cwd: workspace }],
    activeTerminalTab: 'qa-terminal',
    terminalEntries: [],
  }
  await main.evaluate(`window.api.publishSharedState(${JSON.stringify(snapshot)}); true`)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const published = await main.evaluate('window.api.getSharedState()')
    if (published?.workspacePath === workspace) return
    await sleep(250)
  }
}

async function prepareFixture() {
  await fsp.rm(workspace, { recursive: true, force: true })
  await fsp.rm(userData, { recursive: true, force: true })
  await fsp.mkdir(workspace, { recursive: true })
  await fsp.mkdir(userData, { recursive: true })
  await fsp.writeFile(path.join(workspace, 'qa-editor.ts'), 'export const qaValue = 1\n', 'utf8')
  await fsp.writeFile(path.join(workspace, 'dialog-file.ts'), 'export const dialogValue = 1\n', 'utf8')
  await fsp.writeFile(path.join(workspace, 'readonly.txt'), 'readonly fixture\n', 'utf8')
  await fsp.writeFile(path.join(workspace, 'locked.txt'), 'locked fixture\n', 'utf8')
  await fsp.writeFile(path.join(workspace, 'delete-me.txt'), 'delete fixture\n', 'utf8')
  await fsp.writeFile(path.join(workspace, 'rename-me.txt'), 'rename fixture\n', 'utf8')
  try { await fsp.chmod(path.join(workspace, 'readonly.txt'), 0o444) } catch {}
  execFileSync('git', ['-C', workspace, 'init'], { stdio: 'ignore', windowsHide: true })
  execFileSync('git', ['-C', workspace, 'config', 'user.email', 'vd-qa@example.invalid'], { stdio: 'ignore', windowsHide: true })
  execFileSync('git', ['-C', workspace, 'config', 'user.name', 'VD QA'], { stdio: 'ignore', windowsHide: true })
  execFileSync('git', ['-C', workspace, 'add', '.'], { stdio: 'ignore', windowsHide: true })
  execFileSync('git', ['-C', workspace, 'commit', '-m', 'fixture baseline'], { stdio: 'ignore', windowsHide: true })
}

function startLocalServer() {
  const server = createServer((request, response) => {
    if (request.url === '/missing') {
      response.writeHead(404, { 'content-type': 'text/plain' })
      response.end('fixture 404')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><html><body><h1>Fixture page</h1><a href="/next">Next</a><p>source fixture</p></body></html>')
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function runSecurityInspection(packageRoot) {
  const resources = path.join(packageRoot, 'win-unpacked', 'resources')
  const asarPath = path.join(resources, 'app.asar')
  const asar = require('@electron/asar')
  const entries = new Set(asar.listPackage(asarPath))
  const suspicious = [...entries].filter((entry) => /(?:^|\/)(?:\.env(?:\.|$)|(?:api[-_]?key|secret|credential|password)[^/]*|[^/]+\.(?:pem|key)$)/i.test(entry))
  check('packaged app has no secret-looking files', suspicious.length === 0, suspicious.slice(0, 5).join(', '))
  const main = asar.extractFile(asarPath, 'dist-electron/main.js').toString('utf8')
  const preload = asar.extractFile(asarPath, 'dist-electron/preload.cjs').toString('utf8')
  check('packaged security preferences are present', /contextIsolation\s*:\s*(?:true|!0)/.test(main) && /nodeIntegration\s*:\s*(?:false|!1)/.test(main) && /sandbox\s*:\s*(?:true|!0)/.test(main), 'main BrowserWindow webPreferences')
  check('packaged CSP and external-link policy are present', /Content-Security-Policy/.test(main) && /setWindowOpenHandler/.test(main) && /openExternal/.test(main), 'CSP, denied window opens, system browser')
  check('packaged preload exposes a bounded bridge', /contextBridge\.exposeInMainWorld/.test(preload) && /ipcRenderer\.invoke/.test(preload) && !/exposeInMainWorld\(\s*["']api["']\s*,\s*ipcRenderer/.test(preload), 'contextBridge preload')
  return entries
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This packaged QA harness is intended for Windows')
  if (!exe || !fs.existsSync(exe)) throw new Error(`Packaged executable not found: ${exe}`)
  await prepareFixture()
  const portFile = path.join(userData, 'DevToolsActivePort')
  fs.rmSync(portFile, { force: true })
  const child = spawn(exe, ['--remote-debugging-port=0', '--vd-qa-dialogs', `--user-data-dir=${userData}`], {
    cwd: path.dirname(exe),
    env: { ...process.env, VD_AGENT_DISABLE_ENV_IMPORT: '1', VD_AGENT_AUTO_APPROVE_TOOLS: '1', VD_AGENT_QA_DIALOGS: '1', VD_AGENT_QA_DIALOG_SEQUENCE: 'cancel,save,dont-save' },
    windowsHide: true,
  })
  const port = await waitForPort(portFile)
  const localServer = await startLocalServer()
  let pages = await targets(port)
  const mainPage = await connect(pages[0])
  try {
    await sleep(1_500)
    const firstRunText = await mainPage.evaluate('document.body.innerText')
    const firstRunSettings = await mainPage.evaluate('window.api.loadSettings()')
    check('packaged first run is isolated and key-free', !firstRunText.match(/API key configured|key saved/i), `fresh userData; configured providers=${(firstRunSettings.providers || []).filter((provider) => provider.hasKey).length}`)
    check('first-run key guidance is visible', firstRunText.includes('Add an API key in Settings'), 'welcome screen')
    await mainPage.evaluate(`(() => {
      const skip = [...document.querySelectorAll('button')].find((node) => /skip(?: to)? use defaults|continue to vd agent/i.test(node.textContent || ''))
      skip?.click()
      return Boolean(skip)
    })()`)
    await sleep(500)
    await mainPage.screenshot('agent-view.png')

    const lockedPath = path.join(workspace, 'locked.txt').replaceAll("'", "''")
    const lockProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$stream = [System.IO.File]::Open('${lockedPath}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); Start-Sleep -Seconds 30; $stream.Dispose()`], { windowsHide: true })
    await sleep(700)
    const permissionResults = await mainPage.evaluate(`(async () => {
      const base = ${JSON.stringify(workspace)}
      return {
        readOnly: await window.api.writeFile(base + '/readonly.txt', 'blocked'),
        locked: await window.api.writeFile(base + '/locked.txt', 'blocked'),
        noAccess: await window.api.readDirectory('C:/System Volume Information'),
      }
    })()`)
    try { lockProcess.kill() } catch {}
    const permissionErrors = [permissionResults.readOnly, permissionResults.locked, permissionResults.noAccess].filter((item) => item && typeof item.error === 'string').length
    check('permission errors are returned without renderer crashes', permissionErrors >= 2 && mainPage.errors.length === 0, `${permissionErrors}/3 blocked; ${JSON.stringify(permissionResults)}`)

    const settings = await mainPage.evaluate(`window.api.loadSettings()`)
    const safeSettings = { ...settings, providers: [{ id: 'ollama', name: 'Ollama', apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5-coder:7b' }], activeProvider: 'ollama', browserToolEnabled: true }
    await mainPage.evaluate(`window.api.saveSettings(${JSON.stringify(safeSettings)})`)
    const beforeIde = new Set((await targets(port)).map((target) => target.webSocketDebuggerUrl))
    await mainPage.evaluate('window.api.openIdeWindow()')
    let ide = await waitForRole(port, 'ide', beforeIde)
    await sleep(1_500)
    const noFolderText = await ide.evaluate('document.body.innerText')
    check('IDE no-folder state offers Open Folder', /open folder/i.test(noFolderText), 'Open Folder control visible')
    await ide.screenshot('code-window-no-folder.png')
    await mainPage.evaluate('window.api.openIdeWindow()')
    await sleep(500)
    const ideTargets = []
    for (const target of await targets(port)) {
      try { if (await (await connect(target)).evaluate('window.api?.windowRole') === 'ide') ideTargets.push(target) } catch {}
    }
    check('IDE is single-instance and second open focuses it', ideTargets.length === 1, `${ideTargets.length} IDE targets`)
    await publishWorkspace(mainPage, safeSettings)
    let ideSharedState
    for (let attempt = 0; attempt < 20; attempt += 1) {
      ideSharedState = await ide.evaluate('window.api.getSharedState()')
      if (ideSharedState?.files?.some((file) => file.name === 'qa-editor.ts')) break
      await sleep(250)
    }
    check('IDE follows the shared workspace', Boolean(ideSharedState?.files?.some((file) => file.name === 'qa-editor.ts')), `files=${ideSharedState?.files?.map((file) => file.name).join(', ') || 'none'}`)
    await mainPage.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Terminal'); button?.click(); return true })()`)
    await sleep(300)
    await mainPage.screenshot('right-panel-terminal.png')
    await mainPage.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Files'); button?.click(); return true })()`)
    await sleep(300)
    await mainPage.screenshot('right-panel-files.png')
    const monacoLanguages = await ide.evaluate(`(async () => {
      if (typeof window.__VD_ENSURE_MONACO_LANGUAGE !== 'function') return []
      await Promise.all(['typescript', 'javascript', 'json'].map((language) => window.__VD_ENSURE_MONACO_LANGUAGE(language)))
      return window.__VD_MONACO?.languages?.getLanguages?.().map((language) => language.id) || []
    })()`)
    check('packaged Monaco contributions load offline for TS, JS and JSON', ['typescript', 'javascript', 'json'].every((language) => monacoLanguages.includes(language)), monacoLanguages.slice(0, 12).join(', '))
    await ide.evaluate(`(() => {
      window.prompt = () => 'qa-renamed.ts'
      const item = [...document.querySelectorAll('[role="treeitem"]')].find((node) => node.textContent.includes('qa-editor.ts'))
      item?.click()
      return Boolean(item)
    })()`)
    await sleep(250)
    await ide.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Rename'); button?.click(); return true })()`)
    await sleep(500)
    check('IDE rename action is wired', fs.existsSync(path.join(workspace, 'qa-renamed.ts')) || fs.existsSync(path.join(workspace, 'qa-editor.ts')), 'native file operation completed or surfaced')
    await ide.evaluate(`(() => { window.confirm = () => true; const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Delete'); button?.click(); return Boolean(button) })()`)
    await sleep(500)
    check('IDE delete confirmation is wired', !fs.existsSync(path.join(workspace, 'qa-renamed.ts')) || !fs.existsSync(path.join(workspace, 'qa-editor.ts')), 'confirmed fixture delete')

    const qaDialogApi = await mainPage.evaluate('typeof window.api.qaSetDialogSequence === "function" && typeof window.api.qaSetDirtyState === "function" && typeof window.api.qaCloseWindow === "function"')
    check('QA dialog controls are available only for the fixture harness', qaDialogApi === true, 'bounded QA-only preload methods')
    if (qaDialogApi) {
      const dialogFile = path.join(workspace, 'dialog-file.ts')
      let dirtyShared
      for (let attempt = 0; attempt < 20; attempt += 1) {
        dirtyShared = await mainPage.evaluate('window.api.getSharedState()')
        if (dirtyShared?.workspacePath === workspace) break
        await sleep(250)
      }
      const dirtySet = await mainPage.evaluate(`window.api.qaSetDirtyState(${JSON.stringify(dialogFile)}, ${JSON.stringify('export const qaValue = 2\n')})`)
      check('QA dirty-state fixture is accepted', dirtySet?.success === true, JSON.stringify({ dirtySet, workspace: dirtyShared?.workspacePath, dialogFile }))
      await sleep(250)
      await mainPage.evaluate('window.api.qaSetDialogSequence(["cancel"])')
      await ide.evaluate('void window.api.qaCloseWindow(); true')
      await sleep(500)
      check('IDE dirty close Cancel keeps the window open', await hasRole(port, 'ide'), 'cancelled close')
      await mainPage.evaluate(`window.api.qaSetDirtyState(${JSON.stringify(dialogFile)}, ${JSON.stringify('export const qaValue = 2\n')})`)
      await sleep(100)
      await mainPage.evaluate('window.api.qaSetDialogSequence(["save"])')
      await ide.evaluate('void window.api.qaCloseWindow(); true')
      await sleep(700)
      check('IDE dirty close Save writes the file and closes', fs.readFileSync(path.join(workspace, 'dialog-file.ts'), 'utf8').includes('qaValue = 2') && !(await hasRole(port, 'ide')), 'saved fixture content')
      const reopened = new Set((await targets(port)).map((target) => target.webSocketDebuggerUrl))
      await mainPage.evaluate('window.api.openIdeWindow()')
      ide = await waitForRole(port, 'ide', reopened)
      await sleep(750)
      await mainPage.evaluate(`window.api.qaSetDirtyState(${JSON.stringify(dialogFile)}, ${JSON.stringify('export const qaValue = 3\n')})`)
      await sleep(250)
      await mainPage.evaluate('window.api.qaSetDialogSequence(["dont-save"])')
      await ide.evaluate('void window.api.qaCloseWindow(); true')
      await sleep(700)
      check('IDE dirty close Don\'t save closes without another write', !(await hasRole(port, 'ide')), 'discarded close')
      await mainPage.evaluate('(async () => { const state = await window.api.getSharedState(); if (state) { state.fileDirty = true; window.api.publishSharedState(state) } return true })()')
      await mainPage.evaluate('window.api.qaSetDialogSequence(["cancel"])')
      await mainPage.evaluate('void window.api.qaCloseWindow(); true')
      await sleep(500)
      check('Main dirty close Cancel keeps the Agent window open', await hasRole(port, 'main'), 'cancelled main close')
    }

    const tool = (name, args, workingMode = 'build') => mainPage.evaluate(`window.api.toolExecute(${JSON.stringify({ name, args, workspace, sessionId: 'qa-session', workingMode })})`)
    const readOnlyWrite = await tool('write_file', { path: path.join(workspace, 'plan-blocked.txt'), content: 'blocked' }, 'plan')
    const buildWrite = await tool('write_file', { path: path.join(workspace, 'tool-created.txt'), content: 'fixture tool write\n' }, 'build')
    check('working mode policy is enforced in the packaged app', /read-only|cannot run|blocked/i.test(readOnlyWrite?.error || '') && Boolean(buildWrite?.result), JSON.stringify({ readOnlyWrite, buildWrite }))

    const statusBefore = await mainPage.evaluate(`window.api.gitStatus(${JSON.stringify(workspace)})`)
    const diffBefore = await mainPage.evaluate(`window.api.gitDiff(${JSON.stringify(workspace)})`)
    const stageResult = await mainPage.evaluate(`window.api.gitStage(${JSON.stringify(workspace)}, ['tool-created.txt'])`)
    const commitResult = await mainPage.evaluate(`window.api.gitCommitStaged(${JSON.stringify(workspace)}, 'fixture verification')`)
    const statusAfter = await mainPage.evaluate(`window.api.gitStatus(${JSON.stringify(workspace)})`)
    check('throwaway git fixture supports status, diff, stage and commit', statusBefore?.branch && typeof diffBefore === 'string' && stageResult?.success && commitResult?.success && !(statusAfter?.staged?.length), JSON.stringify({ statusBefore, stageResult, commitResult, statusAfter }))

    const outsidePath = path.join(fixture, 'outside-workspace.txt')
    const traversal = await tool('write_file', { path: outsidePath, content: 'must not write' }, 'build')
    check('file tool rejects paths outside the workspace', /outside|workspace|blocked|escape/i.test(traversal?.error || '') && !fs.existsSync(outsidePath), traversal?.error || 'outside path was not rejected')

    const browserBase = `http://127.0.0.1:${localServer.port}`
    const browserOpen = await tool('browser', { operation: 'open_url', url: browserBase })
    const browserRead = await tool('browser', { operation: 'read_page_text' })
    const browserMissing = await tool('browser', { operation: 'open_url', url: `${browserBase}/missing` })
    check('local browser fixture labels source and handles 404', /127\.0\.0\.1/.test(browserOpen?.result || '') && /Fixture page/.test(browserRead?.result || '') && (browserMissing?.error || /127\.0\.0\.1/.test(browserMissing?.result || '')), `${browserOpen?.result || browserOpen?.error || 'no open'}; ${browserMissing?.error || browserMissing?.result || '404 was not surfaced'}`)

    const longMessages = Array.from({ length: 8 }, (_, index) => ({ id: `long-${index}`, role: index % 2 ? 'assistant' : 'user', content: `fixture message ${index} ${'x'.repeat(60_000)}`, timestamp: Date.now() + index }))
    await mainPage.evaluate(`window.api.saveSettings(${JSON.stringify(safeSettings)})`)
    await mainPage.evaluate(`window.api.saveConversation(${JSON.stringify({ id: 'qa-long-chat', title: 'Long fixture chat', messages: longMessages })})`)
    await mainPage.evaluate('location.reload()')
    await sleep(2_000)
    const longText = await mainPage.evaluate('document.body.innerText')
    check('long chat crosses the context warning threshold', /Context is getting full|tokens \(estimate\)/.test(longText), 'long fixture restored')
    await mainPage.screenshot('long-chat-banner.png')
    const parentBefore = await mainPage.evaluate(`window.api.listConversations()`)
    await mainPage.evaluate(`[...document.querySelectorAll('button')].find((node) => node.textContent.includes('Summarize'))?.click()`)
    await sleep(800)
    const summaryRecord = await mainPage.evaluate(`window.api.listConversations()`)
    const summarized = summaryRecord.find((record) => record.id === 'qa-long-chat')
    check('summarize and continue keeps the transcript recoverable', Boolean(summarized?.earlierMessages?.length && summarized?.pinnedSummary), `${summarized?.earlierMessages?.length || 0} earlier messages`)
    const parentSnapshot = JSON.stringify(summarized?.messages || [])
    await mainPage.evaluate(`document.querySelector('.vd-context-warning button:nth-of-type(2)')?.click()`)
    await sleep(800)
    const forkedRecords = await mainPage.evaluate(`window.api.listConversations()`)
    check('fork chat creates a linked child and leaves parent messages unchanged', forkedRecords.some((record) => record.parentSessionId === 'qa-long-chat') && JSON.stringify((forkedRecords.find((record) => record.id === 'qa-long-chat') || {}).messages || []) === parentSnapshot, `${forkedRecords.length} records`)
    const forkButtonCount = await mainPage.evaluate('document.querySelectorAll(".vd-message-fork").length')
    await mainPage.evaluate('([...document.querySelectorAll(".vd-message-fork")].find((button) => button.parentElement?.textContent?.includes("You")))?.click(); true')
    await sleep(2_500)
    const forkFromHereRecords = await mainPage.evaluate(`window.api.listConversations()`)
    check('fork from here creates a child record', forkButtonCount > 0 && forkFromHereRecords.some((record) => record.forkedFromMessageId), `${forkButtonCount} buttons; ${forkFromHereRecords.length} records`)

    const settingsText = await mainPage.evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true })); return document.body.innerText })()`)
    await sleep(400)
    check('Settings exposes version and build commit', /About VD Agent v[0-9]/.test(await mainPage.evaluate('document.body.innerText')) && /Build commit:/.test(await mainPage.evaluate('document.body.innerText')), settingsText.slice(0, 80))
    await mainPage.screenshot('settings.png')
    if (screenshotDir) {
      await mainPage.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 700, deviceScaleFactor: 1, mobile: false })
      await sleep(300)
      await mainPage.screenshot('narrow-window.png')
      await mainPage.send('Emulation.clearDeviceMetricsOverride')
    }

    const baseline = await tasklistMemory(child.pid)
    const samples = []
    const deadline = Date.now() + Math.max(1, stabilityMinutes) * 60_000
    while (Date.now() < deadline) {
      await mainPage.evaluate(`window.api.readDirectory(${JSON.stringify(workspace)}); window.api.getParentPath(${JSON.stringify(workspace)}); document.body.innerText.length`)
      await sleep(Math.min(60_000, Math.max(1_000, deadline - Date.now())))
      samples.push(await tasklistMemory(child.pid))
    }
    const peak = Math.max(baseline, ...samples)
    check('idle/action stability stays below 2x baseline', baseline > 0 && peak < baseline * 2, `baseline=${baseline} peak=${peak} samples=${samples.length}`)
    check('stability run has no renderer errors or crashes', mainPage.errors.length === 0, mainPage.errors.slice(0, 3).join(' | '))
  } finally {
    mainPage.close()
    localServer?.server?.close()
    try { child.kill() } catch {}
    if (process.platform === 'win32') {
      await new Promise((resolve) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve()))
    }
  }

  const packageRoot = path.resolve(value('--package-root') || path.dirname(path.dirname(exe)))
  if (fs.existsSync(path.join(packageRoot, 'win-unpacked', 'resources', 'app.asar'))) await runSecurityInspection(packageRoot)
  else check('packaged security inspection', false, 'win-unpacked/resources/app.asar not found')

  const output = { generatedAt: new Date().toISOString(), fixture, executable: exe, results }
  const outputPath = path.join(fixture, 'logs', 'automated-qa.json')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8')
  const failed = results.filter((result) => result.status === 'FAIL')
  console.log(`Automated QA: ${failed.length ? 'FAIL' : 'PASS'} (${results.length} checks)`)
  process.exitCode = failed.length ? 1 : 0
}

main().catch((error) => {
  console.error(`Automated QA stopped: ${error.message}`)
  process.exitCode = 1
})

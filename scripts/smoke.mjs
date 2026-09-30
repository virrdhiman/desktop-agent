/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * End-to-end smoke test: launches the real app three times against a throwaway
 * user data folder and drives it over the Chrome DevTools Protocol. The third
 * launch talks to a local mock AI provider to check the agent's answer handling
 * (filler stripping, tool-failure reporting, fallback, retries, error messages).
 *
 *   npm run smoke                                  # dev build (runs `npm run build` first)
 *   npm run smoke -- --exe "release/win-unpacked/VD Agent.exe"   # packaged app
 *   npm run smoke -- --screenshots --out ./smoke-shots  # capture screenshots
 *
 * Needs a desktop session (a window opens briefly). On headless Linux use xvfb-run.
 * Screenshots are opt-in because CDP capture can perturb some Electron renderers.
 * Never touches the real VD Agent settings or chat history.
 */
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(repo, 'package.json'))
const yazl = require('yazl')
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
const REPO_URL = 'https://github.com/virrdhiman/desktop-agent'
const AUTHOR_URL = 'https://virender.in/'

const argValue = (name) => {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : undefined
}
const exe = argValue('--exe') || process.env.SMOKE_EXE
const outDir = path.resolve(argValue('--out') || path.join(os.tmpdir(), 'vd-agent-smoke'))
const captureScreenshots = process.env.SMOKE_SCREENSHOTS === '1' || process.argv.includes('--screenshots')
fs.mkdirSync(outDir, { recursive: true })

if (!exe && !fs.existsSync(path.join(repo, pkg.main))) {
  console.error(`Missing ${pkg.main}. Run "npm run build" first (npm run smoke does this for you).`)
  process.exit(1)
}
if (exe && !fs.existsSync(exe)) {
  console.error(`Executable not found: ${exe}`)
  process.exit(1)
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-agent-smoke-data-'))
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-agent-smoke-ws-'))
fs.writeFileSync(path.join(workspace, 'smoke-editor.ts'), 'export const SMOKE_EDITOR_MARKER = 42\n')
fs.writeFileSync(path.join(workspace, 'checkpoint-smoke.txt'), 'before checkpoint\n')
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function writeSmokeZip(target) {
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from('{"id":"A-1","status":"paid","total":12.5}'), 'orders/order-a.json')
  zip.addBuffer(Buffer.from('{"id":"A-2","status":"pending","total":8}'), 'orders/order-b.json')
  zip.addBuffer(Buffer.from('generated fixture'), 'metadata/source.txt')
  zip.end()
  await new Promise((resolve, reject) => {
    zip.outputStream.pipe(fs.createWriteStream(target)).on('close', resolve).on('error', reject)
    zip.outputStream.on('error', reject)
  })
}

const smokeArchive = path.join(workspace, 'order-api-raw.zip')
await writeSmokeZip(smokeArchive)

function realUserDataDir() {
  const name = pkg.productName || pkg.name
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), name)
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', name)
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), name)
}

function stamp(dir) {
  if (!fs.existsSync(dir)) return 'absent'
  let latest = 0
  let count = 0
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    try {
      latest = Math.max(latest, fs.statSync(path.join(dir, String(entry))).mtimeMs)
      count++
    } catch {}
  }
  return `${count}:${latest}`
}

async function launch(label) {
  const env = { ...process.env }
  env.VD_AGENT_AUTO_APPROVE_TOOLS = '1'
  delete env.VITE_DEV_SERVER_URL
  delete env.ELECTRON_RUN_AS_NODE
  const portFile = path.join(userData, 'DevToolsActivePort')
  fs.rmSync(portFile, { force: true })

  const flags = ['--remote-debugging-port=0', `--user-data-dir=${userData}`]
  const proc = exe
    ? spawn(exe, flags, { env })
    : spawn(require('electron'), ['.', ...flags], { cwd: repo, env })
  const logs = []
  proc.stdout.on('data', (d) => logs.push(String(d)))
  proc.stderr.on('data', (d) => logs.push(String(d)))
  let exited = null
  proc.on('exit', (code) => { exited = code ?? 'signal' })

  const kill = async () => {
    if (exited === null) {
      if (process.platform === 'win32') {
        try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }) } catch {}
      } else {
        proc.kill('SIGTERM')
        for (let i = 0; i < 20 && exited === null; i++) await sleep(100)
        if (exited === null) proc.kill('SIGKILL')
      }
    }
    for (let i = 0; i < 40 && exited === null; i++) await sleep(100)
    await sleep(300)
  }

  let target
  try {
    for (let i = 0; i < 120 && !target; i++) {
      await sleep(250)
      if (exited !== null) break
      if (!fs.existsSync(portFile)) continue
      let port
      try {
        port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim()
      } catch {
        continue // Chromium may still be writing the file (EBUSY on Windows)
      }
      if (!port) continue
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        const page = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'))
        if (page) target = { ...page, port }
      } catch {}
    }
  } catch (e) {
    await kill()
    throw e
  }
  if (!target) {
    await kill()
    throw new Error(`[${label}] app window never appeared (exit=${exited})\n${logs.join('').slice(-2000)}`)
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let seq = 0
  const pending = new Map()
  const errors = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text)
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text)
  }
  const send = (method, params = {}, timeoutMs = 15_000) => new Promise((res, rej) => {
    const id = ++seq
    const timer = setTimeout(() => {
      pending.delete(id)
      rej(new Error(`CDP ${method} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    pending.set(id, (msg) => {
      clearTimeout(timer)
      res(msg)
    })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, 20_000)
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)
    return r.result?.result?.value
  }
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')

  for (let i = 0; i < 60; i++) {
    if (await evaluate(`document.readyState === 'complete' && (document.getElementById('root')?.children.length ?? 0) > 0`)) break
    await sleep(250)
  }
  await sleep(1500)

  const pageCount = async () => (await (await fetch(`http://127.0.0.1:${target.port}/json/list`)).json())
    .filter((t) => t.type === 'page' && !t.url.startsWith('devtools://')).length
  const screenshot = async (file) => {
    if (!captureScreenshots) return
    try {
      const r = await send('Page.captureScreenshot', { format: 'png' }, 10_000)
      fs.writeFileSync(path.join(outDir, file), Buffer.from(r.result.data, 'base64'))
    } catch (err) {
      console.warn(`WARN  screenshot ${file} skipped (${err.message})`)
    }
  }
  const close = async () => {
    try { ws.close() } catch {}
    await kill()
  }
  return { evaluate, screenshot, close, errors, pageCount }
}

const FENCE = '```'
const toolBlock = (obj) => `${FENCE}tool\n${JSON.stringify(obj)}\n${FENCE}`
const lastUser = (body) => [...(body?.messages || [])].reverse().find((m) => m.role === 'user')?.content || ''

/**
 * OpenAI-compatible mock at /<provider>/v1. "groq" is always rate limited, so every chat
 * exercises fallback to "gemini", whose replies are scripted by the user's SMOKE-* marker.
 */
function mockReply(provider, body) {
  if (provider === 'groq') return { status: 429, message: 'Rate limit reached for model mock-model. Please try again in 20s.' }
  const last = lastUser(body)
  if (last.startsWith('Tool results:')) {
    return { text: "Sure! I'd be happy to help.\n\n`read_file` failed for `missing-smoke-file.txt` because it does not exist; `smoke-editor.ts` exports `SMOKE_EDITOR_MARKER`.\n\nNext steps:\n1. SMOKE-NEXT-STEP create `missing-smoke-file.txt` or give the correct path.\n\nI hope this helps! Let me know if you have any other questions." }
  }
  if (last.startsWith('Your previous reply was')) {
    return { text: last.includes('generic request for information') ? 'SMOKE-DIRECT Local chat history is stored on disk and restored at startup.' : 'SMOKE-RECOVERED The setting is read from `settings.json`.' }
  }
  if (last.startsWith('Your reply says you')) return { text: 'SMOKE-HONEST Nothing was edited or run yet; the fix is to change `a - b` to `a + b` in `calc.js`.' }
  if (last.includes('SMOKE-CLAIM')) {
    return { text: 'SMOKE-FABRICATED Fixed.\n\n1. Edited `calc.js` to return `a + b`.\n2. Ran `node calc.test.js`.\n\nAll tests passed.' }
  }
  if (last.includes('SMOKE-ALLFAIL')) return { status: 503, message: 'Service unavailable' }
  if (last.includes('SMOKE-EMPTY')) return { text: '' }
  if (last.includes('SMOKE-DEFLECTION')) return { text: 'Hello! How can I assist you with your task? Please provide the details of the task and context.' }
  if (last.includes('SMOKE-BARE')) return { text: '{"name":"read_file","args":{"path":"smoke-editor.ts"}}' }
  if (last.includes('SMOKE-TOOLS')) {
    return {
      text: [
        "I'll start by inspecting the files.",
        '<tool_call><function=tool>{"name":"read_file","args":{"path":"missing-smoke-file.txt"}}</function></tool_call>',
        toolBlock({ name: 'read_file', args: { path: 'smoke-editor.ts' } }),
        `${FENCE}tool\n{not json}\n${FENCE}`,
      ].join('\n\n'),
    }
  }
  return { text: 'SMOKE-DEFAULT' }
}

function startMockProvider() {
  const requests = []
  const server = http.createServer((req, res) => {
    const provider = req.url.split('/')[1]
    if (req.method === 'GET' && req.url.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'mock-model' }, { id: 'mock-model-b' }] }))
      return
    }
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      let body = {}
      try { body = JSON.parse(raw) } catch {}
      requests.push({ provider, body })
      const reply = mockReply(provider, body)
      if (reply.status) {
        res.writeHead(reply.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: reply.message } }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const piece of reply.text.match(/[\s\S]{1,40}/g) || []) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
      }
      res.end('data: [DONE]\n\n')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}` })))
}

async function sendChat(app, text) {
  const input = `document.querySelector('textarea[placeholder^="Ask me anything"]')`
  await app.evaluate(`(() => {
    const ta = ${input}
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)})
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(250)
  await app.evaluate(`${input}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
}

async function waitForText(app, marker, ms = 30_000) {
  const expr = `document.body.innerText.includes(${JSON.stringify(marker)}) && !document.body.innerText.includes('⏹ Stop')`
  for (let i = 0; i < ms / 250; i++) {
    if (await app.evaluate(expr)) return true
    await sleep(250)
  }
  return false
}

const realDir = realUserDataDir()
const realBefore = stamp(realDir)
const fakeKey = 'sk-proj-' + 'q'.repeat(24)
const convDir = path.join(userData, 'conversations')
const smokeMessages = `[
  { id: 'm1', role: 'user', content: 'SMOKE-MARKER hello, my key is ${fakeKey}', timestamp: Date.now() },
  { id: 'm2', role: 'assistant', content: 'SMOKE-REPLY acknowledged', timestamp: Date.now() }
]`

console.log(`VD Agent smoke test (${exe ? `packaged: ${exe}` : 'dev build'})\n`)
let a
let b
let c
let mock
try {
  // Launch 1: fresh profile.
  a = await launch('launch-1')
  const info = await a.evaluate(`({
    title: document.title,
    rootChildren: document.getElementById('root')?.children.length ?? 0,
    api: typeof window.api,
    missing: ['saveConversation','listConversations','deleteConversation','updateConversation','exportConversation','importConversations','exportDiagnostics','loadSettings','aiChat','aiCancel','aiListModels','onAIStream','toolExecute','projectMemoryLoad','listCheckpoints','restoreCheckpoint','updateStatus'].filter(k => typeof window.api?.[k] !== 'function'),
    hasNode: typeof require !== 'undefined' || typeof process !== 'undefined',
    links: [...document.querySelectorAll('a')].map(x => x.href),
    credit: /by Virender Dhiman/.test(document.body.innerText),
    layout: (() => { const r = document.getElementById('root')?.getBoundingClientRect(); return { width: r?.width || 0, height: r?.height || 0, bodyWidth: document.body.scrollWidth, viewportWidth: innerWidth } })(),
  })`)
  check('window title is "VD Agent"', info.title === 'VD Agent', info.title)
  check('React UI rendered', info.rootChildren > 0)
  check('preload bridge exposes the expected API', info.api === 'object' && info.missing.length === 0, info.missing.join(', '))
  check('renderer has no Node globals (context isolation)', !info.hasNode)
  check('first viewport is nonblank and does not overflow horizontally', info.layout.width > 600 && info.layout.height > 400 && info.layout.bodyWidth <= info.layout.viewportWidth + 1, JSON.stringify(info.layout))
  check('welcome screen credits the author with a star link', info.credit && info.links.includes(AUTHOR_URL) && info.links.includes(REPO_URL))
  await a.screenshot('welcome.png')

  const pagesBefore = await a.pageCount()
  const denied = await a.evaluate(`[window.open('about:blank'), window.open('file:///nonexistent-smoke.txt')].every(w => w === null)`)
  await sleep(800)
  const pagesAfter = await a.pageCount()
  check('window.open is denied (no extra app windows)', denied && pagesAfter === pagesBefore, `pages ${pagesBefore} -> ${pagesAfter}`)

  await a.evaluate(`document.querySelector('[aria-label^="Settings"]')?.click()`)
  await sleep(800)
  const about = await a.evaluate(`(() => {
    const card = document.querySelector('[aria-label="About VD Agent"]')
    card?.scrollIntoView()
    return { found: !!card, text: card?.innerText ?? '', links: card ? [...card.querySelectorAll('a')].map(x => x.href) : [] }
  })()`)
  check('Settings shows the About card with credit and links', about.found && /Virender Dhiman/.test(about.text) && /All rights reserved/.test(about.text)
    && about.links.includes(AUTHOR_URL) && about.links.includes(REPO_URL) && about.links.some((l) => l.endsWith('/LICENSE')))
  await sleep(300)
  await a.screenshot('settings.png')
  await a.evaluate(`document.querySelector('[aria-label^="Agent"]')?.click()`)

  const settings = await a.evaluate(`window.api.loadSettings()`)
  check('settings load over IPC', Array.isArray(settings?.providers) && settings.providers.length > 0, `active=${settings?.activeProvider}`)
  await a.evaluate(`window.api.loadSettings().then(s => window.api.saveSettings({ ...s, workspacePath: ${JSON.stringify(workspace)} }))`)

  const terminal = await a.evaluate(`window.api.terminalCreate('smoke-terminal', ${JSON.stringify(workspace)})`)
  await a.evaluate(`window.api.terminalKill('smoke-terminal')`)
  check('native terminal PTY starts in the workspace', terminal?.success === true)

  const updateStatus = await a.evaluate(`window.api.updateStatus()`)
  check('update status is available over IPC', typeof updateStatus?.state === 'string' && typeof updateStatus?.message === 'string', updateStatus?.state)
  const memory = await a.evaluate(`window.api.projectMemoryLoad(${JSON.stringify(workspace)}, true)`)
  check('local project memory is generated for the workspace', memory?.workspace === workspace && memory?.content?.includes('smoke-editor.ts'))

  const archiveList = await a.evaluate(`window.api.toolExecute({ name: 'archive_list', args: { archive_path: 'order-api-raw.zip' }, workspace: ${JSON.stringify(workspace)} })`)
  check('archive tool inventories every ZIP file before extraction',
    archiveList?.result?.includes('3 files') && archiveList.result.includes('orders/order-a.json') && archiveList.result.includes('metadata/source.txt'))
  const archiveExtract = await a.evaluate(`window.api.toolExecute({ name: 'archive_extract', args: { archive_path: 'order-api-raw.zip', output_path: 'order-api-raw-extracted' }, workspace: ${JSON.stringify(workspace)}, sessionId: 'archive-smoke', taskId: 'archive-to-csv' })`)
  check('archive tool safely extracts nested files inside the workspace',
    archiveExtract?.result?.includes('Extracted 3 files')
      && fs.readFileSync(path.join(workspace, 'order-api-raw-extracted', 'orders', 'order-a.json'), 'utf8').includes('A-1'))
  const archiveCheckpoints = await a.evaluate(`window.api.listCheckpoints('archive-smoke')`)
  const archiveRestored = archiveCheckpoints?.[0]
    ? await a.evaluate(`window.api.restoreCheckpoint('archive-smoke', ${JSON.stringify(archiveCheckpoints[0].id)})`)
    : null
  check('archive extraction checkpoint removes newly extracted files on restore',
    archiveRestored?.success && !fs.existsSync(path.join(workspace, 'order-api-raw-extracted', 'orders', 'order-a.json')))

  const changed = await a.evaluate(`window.api.toolExecute({ name: 'write_file', args: { path: 'checkpoint-smoke.txt', content: 'after checkpoint\\n' }, workspace: ${JSON.stringify(workspace)}, sessionId: 'smoke-session', taskId: 'smoke-task' })`)
  const checkpoints = await a.evaluate(`window.api.listCheckpoints('smoke-session')`)
  check('agent file writes create a pre-edit checkpoint', !!changed?.result && Array.isArray(checkpoints) && checkpoints.length === 1 && checkpoints[0].files.some((file) => file.relativePath === 'checkpoint-smoke.txt'))
  const checkpointSummary = checkpoints?.[0] ? {
    id: checkpoints[0].id, sessionId: checkpoints[0].sessionId, createdAt: checkpoints[0].createdAt,
    label: checkpoints[0].label, files: checkpoints[0].files.map((file) => file.relativePath),
  } : null
  const restoredCheckpoint = checkpoints?.[0]
    ? await a.evaluate(`window.api.restoreCheckpoint('smoke-session', ${JSON.stringify(checkpoints[0].id)})`)
    : null
  check('checkpoint restore returns the previous file content', restoredCheckpoint?.success && fs.readFileSync(path.join(workspace, 'checkpoint-smoke.txt'), 'utf8') === 'before checkpoint\n')

  const saved = await a.evaluate(`window.api.saveConversation({ id: 'smoke-session', title: 'Smoke test chat', pinned: true, summary: 'SMOKE-SUMMARY', resume: { workspacePath: ${JSON.stringify(workspace)}, selectedFile: 'smoke-editor.ts', projectMemory: 'SMOKE-PROJECT-MEMORY', checkpoint: ${JSON.stringify(checkpointSummary)}, lastVerification: { command: 'npm test', ok: true, timestamp: Date.now(), summary: 'SMOKE-VERIFIED' } }, messages: ${smokeMessages} })`)
  const resaved = await a.evaluate(`window.api.saveConversation({ id: 'smoke-session', title: 'Smoke test chat', pinned: true, summary: 'SMOKE-SUMMARY', resume: { workspacePath: ${JSON.stringify(workspace)}, selectedFile: 'smoke-editor.ts', projectMemory: 'SMOKE-PROJECT-MEMORY', checkpoint: ${JSON.stringify(checkpointSummary)}, lastVerification: { command: 'npm test', ok: true, timestamp: Date.now(), summary: 'SMOKE-VERIFIED' } }, messages: ${smokeMessages} })`)
  const files = fs.existsSync(convDir) ? fs.readdirSync(convDir).filter((f) => f.endsWith('.json')) : []
  check('chat saves to userData/conversations; re-save updates the same file', saved?.success && resaved?.success && files.length === 1 && files[0] === 'smoke-session.json', files.join(','))
  const raw = files.length ? fs.readFileSync(path.join(convDir, files[0]), 'utf8') : ''
  check('API key is redacted in the saved chat', raw.includes('SMOKE-MARKER') && !raw.includes(fakeKey) && raw.includes('[redacted-key]'))
  const errors1 = [...a.errors]
  await a.close()
  a = null
  check('launch 1: no renderer errors', errors1.length === 0, errors1.slice(0, 3).join(' | '))

  // Launch 2: same profile, history must survive the restart.
  b = await launch('launch-2')
  const listed = await b.evaluate(`window.api.listConversations()`)
  check('saved chat is listed after restart', Array.isArray(listed) && listed.some((c) => c.id === 'smoke-session'))
  const resumed = Array.isArray(listed) ? listed.find((item) => item.id === 'smoke-session') : null
  const richResumeOk = resumed?.pinned === true && resumed?.resume?.workspacePath === workspace
    && resumed?.resume?.selectedFile === 'smoke-editor.ts' && resumed?.resume?.projectMemory?.includes('smoke-editor.ts')
    && resumed?.resume?.checkpoint?.id === checkpointSummary?.id
    && resumed?.resume?.lastVerification?.summary === 'SMOKE-VERIFIED'
  check('restart data includes pinned rich resume and verification state', richResumeOk,
    richResumeOk ? '' : JSON.stringify({ pinned: resumed?.pinned, resume: resumed?.resume }).slice(0, 800))
  await sleep(1200)
  const restored = await b.evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /History/.test(x.textContent || ''))
    const r = btn?.getBoundingClientRect()
    return { text: document.body.innerText, headerTop: r?.top ?? -1, headerBottom: r?.bottom ?? Infinity, vh: innerHeight }
  })()`)
  check('latest chat is restored into the UI on startup', restored.text.includes('SMOKE-MARKER') && restored.text.includes('SMOKE-REPLY'))
  check('chat header stays visible after restore', restored.headerTop >= 0 && restored.headerBottom <= restored.vh)
  check('sidebar shows the package version', restored.text.includes(`v${pkg.version}`), `v${pkg.version}`)

  // Code editor: the workspace saved in launch 1 is restored. Select a file in Files; the
  // editor is shown beside the Agent panel, so switch back and wait for Monaco to render it.
  await b.evaluate(`document.querySelector('[aria-label^="Files"]')?.click()`)
  let selected = false
  for (let i = 0; i < 40 && !selected; i++) {
    await sleep(250)
    selected = await b.evaluate(`(() => {
      const item = [...document.querySelectorAll('.file-tree-item')].find(x => x.textContent.includes('smoke-editor.ts'))
      item?.click()
      return !!item
    })()`)
  }
  await sleep(300)
  await b.evaluate(`document.querySelector('[aria-label^="Agent"]')?.click()`)
  let editorText = ''
  for (let i = 0; i < 240 && !editorText.includes('SMOKE_EDITOR_MARKER'); i++) {
    await sleep(250)
    editorText = await b.evaluate(`document.querySelector('.monaco-editor .view-lines')?.textContent ?? ''`)
  }
  check('code editor (bundled Monaco) opens a workspace file', editorText.includes('SMOKE_EDITOR_MARKER'))
  await sleep(500)
  await b.screenshot('editor.png')

  const del = await b.evaluate(`window.api.deleteConversation('smoke-session')`)
  const after = await b.evaluate(`window.api.listConversations()`)
  check('delete removes the chat, backup, checkpoints, and list entry', del?.success
    && !fs.existsSync(path.join(convDir, 'smoke-session.json'))
    && !fs.existsSync(path.join(convDir, 'smoke-session.json.bak'))
    && !fs.existsSync(path.join(userData, 'checkpoints', 'smoke-session'))
    && after.length === 0)
  const traversal = await b.evaluate(`window.api.deleteConversation('../settings')`)
  check('path-traversal session id is rejected', !traversal?.success)
  const errors2 = [...b.errors]
  await b.close()
  b = null
  check('launch 2: no renderer errors', errors2.length === 0, errors2.slice(0, 3).join(' | '))

  // Launch 3: agent answer handling against the local mock provider. No network, no real keys.
  mock = await startMockProvider()
  const settingsFile = path.join(userData, 'settings.json')
  const s3 = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  s3.activeProvider = 'groq'
  s3.providers = s3.providers.map((p) => (p.id === 'groq' || p.id === 'gemini'
    ? { ...p, baseUrl: `${mock.url}/${p.id}/v1`, apiKey: `smoke-mock-${p.id}-key-000000` }
    : { ...p, apiKey: '' }))
  fs.writeFileSync(settingsFile, JSON.stringify(s3, null, 2))

  c = await launch('launch-3')
  await c.evaluate(`document.querySelector('[aria-label^="Agent"]')?.click()`)
  await sleep(500)

  const toolsStart = mock.requests.length
  await sendChat(c, 'SMOKE-TOOLS read missing-smoke-file.txt and smoke-editor.ts')
  const toolsDone = await waitForText(c, 'SMOKE-NEXT-STEP')
  const toolsReqs = mock.requests.slice(toolsStart)
  let refreshedCatalog
  for (let i = 0; i < 20; i++) {
    try {
      refreshedCatalog = JSON.parse(fs.readFileSync(settingsFile, 'utf8')).providers?.find((p) => p.id === 'groq')
    } catch {}
    if (refreshedCatalog?.models?.includes('mock-model-b')) break
    await sleep(250)
  }
  const catalogDetail = `${refreshedCatalog?.model || 'none'} :: ${(refreshedCatalog?.models || []).join(',') || 'none'}`
  check('agent: live model catalog is saved and stale defaults are replaced',
    refreshedCatalog?.model === 'mock-model' && refreshedCatalog?.models?.join(',') === 'mock-model,mock-model-b',
    catalogDetail)
  const firstGemini = toolsReqs.findIndex((r) => r.provider === 'gemini')
  const system = toolsReqs[firstGemini]?.body.messages?.[0]?.content || ''
  check('agent: system prompt carries the answer-quality rules and the workspace',
    system.includes('## When a tool fails') && system.includes('Ask only when the answer changes') && system.includes(`Workspace: ${workspace}`))
  const followUp = lastUser(toolsReqs.find((r) => r.provider === 'gemini' && lastUser(r.body).startsWith('Tool results:'))?.body)
  const toolFailureOk = followUp.includes('Tool read_file FAILED.') && followUp.includes(path.join(workspace, 'missing-smoke-file.txt')) && followUp.includes('Hint: The path does not exist')
  check('agent: a failed tool call reaches the model with the error and a hint', toolFailureOk,
    toolFailureOk ? '' : followUp ? followUp.slice(0, 400).replace(/\s+/g, ' ') : `requests: ${toolsReqs.map((r) => `${r.provider}<${lastUser(r.body).slice(0, 24).replace(/\s+/g, ' ')}>`).join(', ')}`)
  check('agent: relative tool paths resolve against the workspace', followUp.includes('Tool read_file succeeded.') && followUp.includes('SMOKE_EDITOR_MARKER'))
  check('agent: a malformed tool block is reported to the model, not dropped', followUp.includes('Tool block 3 is not valid'))
  check('agent: later rounds stay on the provider that answered', firstGemini > 0 && toolsReqs.slice(firstGemini).every((r) => r.provider !== 'groq'))
  const ui1 = await c.evaluate(`document.body.innerText`)
  check('agent: the user is told once which provider answered after a fallback', (ui1.match(/so this answer came from Google Gemini/g) || []).length === 1)
  check('agent: filler is stripped from replies and next steps are kept',
    toolsDone && !/Certainly|Great question|happy to help|I hope this helps|Let me know if you have|I'll start by/i.test(ui1) && ui1.includes('Next steps:'))
  await c.screenshot('agent.png')

  const bareStart = mock.requests.length
  await sendChat(c, 'SMOKE-BARE inspect smoke-editor.ts')
  let bareFollowUp = ''
  for (let i = 0; i < 80 && !bareFollowUp; i++) {
    await sleep(250)
    bareFollowUp = lastUser(mock.requests.slice(bareStart).find((r) => lastUser(r.body).startsWith('Tool results:'))?.body)
  }
  check('agent: a known bare JSON tool call is executed',
    bareFollowUp.includes('Tool read_file succeeded.') && bareFollowUp.includes('SMOKE_EDITOR_MARKER'))

  const emptyStart = mock.requests.length
  await sendChat(c, 'SMOKE-EMPTY where is the setting read from?')
  const recovered = await waitForText(c, 'SMOKE-RECOVERED')
  const corrected = mock.requests.slice(emptyStart).filter((r) => lastUser(r.body).startsWith('Your previous reply was empty')).length
  check('agent: an empty reply gets one corrective retry and recovers', recovered && corrected === 1, `corrections=${corrected}`)
  const emptyModels = new Set(mock.requests.slice(emptyStart)
    .filter((r) => r.provider === 'gemini' && lastUser(r.body).includes('SMOKE-EMPTY')).map((r) => r.body.model))
  check('agent: an empty reply is retried on the next model first', emptyModels.size >= 2, [...emptyModels].join(', '))

  const claimStart = mock.requests.length
  await sendChat(c, 'SMOKE-CLAIM fix the add bug in calc.js')
  const honest = await waitForText(c, 'SMOKE-HONEST')
  const claimCorrections = mock.requests.slice(claimStart).filter((r) => lastUser(r.body).startsWith('Your reply says you')).length
  const shownFabrication = await c.evaluate(`document.body.innerText.includes('SMOKE-FABRICATED')`)
  check('agent: claimed edits or test runs without a tool call are challenged, not shown',
    honest && claimCorrections === 1 && !shownFabrication, `corrections=${claimCorrections} shownFabrication=${shownFabrication}`)

  const deflectionStart = mock.requests.length
  await sendChat(c, 'SMOKE-DEFLECTION Is local chat history restored after restart?')
  const direct = await waitForText(c, 'SMOKE-DIRECT')
  const deflectionCorrections = mock.requests.slice(deflectionStart)
    .filter((r) => lastUser(r.body).includes('generic request for information')).length
  const deflectionShown = await c.evaluate(`document.body.innerText.includes('How can I assist you with your task?')`)
  check('agent: generic deflection is corrected instead of shown',
    direct && deflectionCorrections === 1 && !deflectionShown,
    `corrections=${deflectionCorrections} shownDeflection=${deflectionShown}`)

  await sendChat(c, 'SMOKE-ALLFAIL anything')
  const failShown = await waitForText(c, 'failed on all 2 providers tried')
  const ui3 = await c.evaluate(`document.body.innerText`)
  const failText = ui3.slice(ui3.lastIndexOf('The request failed'))
  check('agent: a total failure lists each provider with next steps',
    failShown && /Groq.*rate limited/.test(failText) && /Gemini.*provider error/.test(failText) && failText.includes('Next steps:'))

  const errors3 = [...c.errors]
  await c.close()
  c = null
  check('launch 3: no renderer errors', errors3.length === 0, errors3.slice(0, 3).join(' | '))

  check('real user data folder untouched', stamp(realDir) === realBefore, realDir)
} catch (e) {
  check('smoke run completed', false, e.message)
} finally {
  if (a) await a.close()
  if (b) await b.close()
  if (c) await c.close()
  if (mock) mock.server.close()
  for (const dir of [userData, workspace]) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

const failed = results.filter((r) => !r.ok).length
const screenshotNote = captureScreenshots ? `Screenshots: ${outDir}` : 'Screenshots disabled; set SMOKE_SCREENSHOTS=1 to capture them.'
console.log(`\n${results.length - failed}/${results.length} checks passed. ${screenshotNote}`)
process.exit(failed ? 1 : 0)

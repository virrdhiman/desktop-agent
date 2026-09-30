/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * End-to-end smoke test: launches the real app twice against a throwaway
 * user data folder and drives it over the Chrome DevTools Protocol.
 *
 *   npm run smoke                                  # dev build (runs `npm run build` first)
 *   npm run smoke -- --exe "release/win-unpacked/VD Agent.exe"   # packaged app
 *   npm run smoke -- --out ./smoke-shots           # keep screenshots somewhere specific
 *
 * Needs a desktop session (a window opens briefly). On headless Linux use xvfb-run.
 * Never touches the real VD Agent settings or chat history.
 */
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(repo, 'package.json'))
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
const REPO_URL = 'https://github.com/virrdhiman/desktop-agent'
const AUTHOR_URL = 'https://virender.in/'

const argValue = (name) => {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : undefined
}
const exe = argValue('--exe') || process.env.SMOKE_EXE
const outDir = path.resolve(argValue('--out') || path.join(os.tmpdir(), 'vd-agent-smoke'))
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
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
      const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim()
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
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
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
    const r = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(outDir, file), Buffer.from(r.result.data, 'base64'))
  }
  const close = async () => {
    try { ws.close() } catch {}
    await kill()
  }
  return { evaluate, screenshot, close, errors, pageCount }
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
try {
  // Launch 1: fresh profile.
  a = await launch('launch-1')
  const info = await a.evaluate(`({
    title: document.title,
    rootChildren: document.getElementById('root')?.children.length ?? 0,
    api: typeof window.api,
    missing: ['saveConversation','listConversations','deleteConversation','loadSettings','aiChat','aiCancel','aiListModels','onAIStream'].filter(k => typeof window.api?.[k] !== 'function'),
    hasNode: typeof require !== 'undefined' || typeof process !== 'undefined',
    links: [...document.querySelectorAll('a')].map(x => x.href),
    credit: /by Virender Dhiman/.test(document.body.innerText),
  })`)
  check('window title is "VD Agent"', info.title === 'VD Agent', info.title)
  check('React UI rendered', info.rootChildren > 0)
  check('preload bridge exposes the expected API', info.api === 'object' && info.missing.length === 0, info.missing.join(', '))
  check('renderer has no Node globals (context isolation)', !info.hasNode)
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

  const saved = await a.evaluate(`window.api.saveConversation({ id: 'smoke-session', title: 'Smoke test chat', messages: ${smokeMessages} })`)
  const resaved = await a.evaluate(`window.api.saveConversation({ id: 'smoke-session', title: 'Smoke test chat', messages: ${smokeMessages} })`)
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
  for (let i = 0; i < 80 && !editorText.includes('SMOKE_EDITOR_MARKER'); i++) {
    await sleep(250)
    editorText = await b.evaluate(`document.querySelector('.monaco-editor .view-lines')?.textContent ?? ''`)
  }
  check('code editor (bundled Monaco) opens a workspace file', editorText.includes('SMOKE_EDITOR_MARKER'))
  await sleep(500)
  await b.screenshot('editor.png')

  const del = await b.evaluate(`window.api.deleteConversation('smoke-session')`)
  const after = await b.evaluate(`window.api.listConversations()`)
  check('delete removes the chat from disk and the list', del?.success && !fs.existsSync(path.join(convDir, 'smoke-session.json')) && after.length === 0)
  const traversal = await b.evaluate(`window.api.deleteConversation('../settings')`)
  check('path-traversal session id is rejected', !traversal?.success)
  const errors2 = [...b.errors]
  await b.close()
  b = null
  check('launch 2: no renderer errors', errors2.length === 0, errors2.slice(0, 3).join(' | '))

  check('real user data folder untouched', stamp(realDir) === realBefore, realDir)
} catch (e) {
  check('smoke run completed', false, e.message)
} finally {
  if (a) await a.close()
  if (b) await b.close()
  for (const dir of [userData, workspace]) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${outDir}`)
process.exit(failed ? 1 : 0)

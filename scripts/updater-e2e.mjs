/** Real packaged-app updater QA. Uses isolated user data and the configured release feed. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'

const value = (name) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
const exe = path.resolve(value('--exe') || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'PIT Agent', 'PIT Agent.exe'))
const userData = path.resolve(value('--user-data') || fs.mkdtempSync(path.join(os.tmpdir(), 'vd-agent-updater-e2e-')))
const expectedCurrent = value('--current') || '1.0.1'
const expectedUpdate = value('--update') || '1.1.0'
const triggerInstall = process.argv.includes('--install')
const allowUiVersionMismatch = process.argv.includes('--allow-ui-version-mismatch')
const seedUserData = process.argv.includes('--seed-user-data')
const timeoutMs = Number(value('--timeout-ms') || 10 * 60_000)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (!fs.existsSync(exe)) throw new Error(`Installed executable not found: ${exe}`)
fs.mkdirSync(userData, { recursive: true })
const portFile = path.join(userData, 'DevToolsActivePort')
fs.rmSync(portFile, { force: true })

const child = spawn(exe, ['--remote-debugging-port=0', `--user-data-dir=${userData}`], {
  env: { ...process.env, VD_AGENT_DISABLE_ENV_IMPORT: '1' },
})
let exited = false
child.on('exit', () => { exited = true })
const stop = () => {
  if (exited) return
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  } else child.kill('SIGTERM')
}

let socket
try {
  let target
  for (let i = 0; i < 160 && !target && !exited; i++) {
    await sleep(250)
    if (!fs.existsSync(portFile)) continue
    const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim()
    if (!port) continue
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = pages.find((entry) => entry.type === 'page' && !entry.url.startsWith('devtools://'))
    } catch {}
  }
  if (!target) throw new Error('Installed app did not expose a renderer for updater QA.')

  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map()
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
  const send = (method, params = {}, callTimeout = 30_000) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)) }, callTimeout)
    pending.set(id, (message) => { clearTimeout(timer); resolve(message) })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression, callTimeout) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, callTimeout)
    if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text)
    return response.result?.result?.value
  }
  await send('Runtime.enable')
  for (let i = 0; i < 40; i++) {
    const ready = await evaluate(`document.body?.innerText?.trim().length > 20`)
    if (ready) break
    await sleep(250)
  }
  const boot = await evaluate(`(async () => {
    globalThis.__vdUpdateStates = []
    const capabilities = {
      updateStatus: typeof window.api.updateStatus === 'function',
      checkForUpdates: typeof window.api.checkForUpdates === 'function',
      installUpdate: typeof window.api.installUpdate === 'function',
      onUpdateStatus: typeof window.api.onUpdateStatus === 'function',
    }
    if (capabilities.onUpdateStatus) {
      globalThis.__vdUpdateDispose = window.api.onUpdateStatus((state) => globalThis.__vdUpdateStates.push(state))
    }
    const settings = await window.api.loadSettings()
    await window.api.saveSettings({ ...settings, autoUpdate: true })
    if (${seedUserData ? 'true' : 'false'}) {
      await window.api.saveConversation({
        id: 'update-preservation',
        title: 'Updater persistence check',
        messages: [{ role: 'user', content: 'Preserve this chat across the update.' }],
      })
    }
    return { text: document.body.innerText, capabilities, status: capabilities.updateStatus ? await window.api.updateStatus() : null }
  })()`)
  if (!allowUiVersionMismatch && !boot?.text?.includes(`v${expectedCurrent}`)) throw new Error(`Expected the running app to show v${expectedCurrent}.`)
  if (!boot.capabilities?.checkForUpdates || !boot.capabilities?.updateStatus || !boot.capabilities?.installUpdate) {
    throw new Error(`Installed app v${expectedCurrent} does not contain the updater API: ${JSON.stringify(boot.capabilities)}`)
  }
  await evaluate(`window.api.checkForUpdates()`, 60_000)

  const started = Date.now()
  let result
  while (Date.now() - started < timeoutMs) {
    result = await evaluate(`(async () => ({ status: await window.api.updateStatus(), states: globalThis.__vdUpdateStates }))()`)
    if (['downloaded', 'error', 'current', 'unavailable'].includes(result?.status?.state)) break
    await sleep(1000)
  }
  if (result?.status?.state !== 'downloaded') throw new Error(`Updater did not download ${expectedUpdate}: ${JSON.stringify(result)}`)
  if (result.status.version !== expectedUpdate) throw new Error(`Expected update ${expectedUpdate}, received ${result.status.version || 'unknown'}.`)
  const states = result.states || []
  if (!states.some((state) => state.state === 'available')) throw new Error('Updater never reported update-available.')

  const output = {
    ok: true, current: expectedCurrent, update: expectedUpdate, userData, states,
    usedCachedDownload: !states.some((state) => state.state === 'downloading'),
    installTriggered: false,
  }
  if (triggerInstall) {
    output.installTriggered = true
    try { await evaluate(`window.api.installUpdate()`, 10_000) } catch {}
    for (let i = 0; i < 300 && !exited; i++) await sleep(100)
    if (!exited) throw new Error('The app did not exit after requesting update installation.')
  }
  console.log(JSON.stringify(output, null, 2))
} finally {
  try { socket?.close() } catch {}
  if (!triggerInstall) stop()
}

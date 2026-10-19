import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'

function loadPlaywright() {
  const require = createRequire(import.meta.url)
  return require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
}

const exe = process.argv[2]
if (!exe) throw new Error('Usage: node tests/human/agent-loop-stall.mjs <packaged executable>')
const root = path.resolve('.work', 'agent-loop-stall-e2e', Date.now().toString())
const workspace = path.join(root, 'workspace')
const userData = path.join(root, 'userdata')
await fs.mkdir(workspace, { recursive: true })
await fs.mkdir(userData, { recursive: true })

let timeoutCalls = 0
let proseCalls = 0
let prosePhase = 0
const server = http.createServer(async (request, response) => {
  if (request.url === '/v1/models') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'stall-model' }] }))
    return
  }
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    let body = ''
    for await (const chunk of request) body += chunk
    const payload = JSON.parse(body)
    const lastUser = [...(payload.messages || [])].reverse().find((message) => message.role === 'user')?.content || ''
    if (lastUser.includes('STALL-TIMEOUT')) {
      timeoutCalls++
      // Keep this turn open to prove that the renderer surfaces the bounded
      // per-turn timeout instead of leaving the queue in a running state.
      return
    }
    proseCalls++
    const fence = '```tool'
    const tool = (value) => `${fence}\n${JSON.stringify(value)}\n\`\`\``
    let text
    if (prosePhase === 0) {
      prosePhase++
      text = tool({ name: 'write_file', args: { path: 'stall-fixture.txt', content: 'stall regression fixture\n' } })
    } else if (lastUser.includes('Continue the unfinished task now.')) {
      prosePhase++
      text = tool({ name: 'read_file', args: { path: 'stall-fixture.txt' } })
    } else if (lastUser.includes('Tool results:')) {
      text = prosePhase === 1
        ? 'I created the fixture. I still need your approval to inspect it.'
        : 'Done. The fixture was inspected successfully.'
    } else {
      text = 'Unexpected request in the prose recovery scenario.'
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }))
    return
  }
  response.writeHead(404)
  response.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  providers: [{ id: 'custom_openai', name: 'Test provider', apiKey: 'test-loop-stall-key', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'stall-model' }],
  activeProvider: 'custom_openai', workspacePath: workspace, permissionMode: 'ask-risky', setupChecklistDismissed: true,
}, null, 2))

const playwright = loadPlaywright()
const app = await playwright._electron.launch({
  executablePath: path.resolve(exe),
  args: [process.env.VD_ELECTRON_APP_PATH ? path.resolve(process.env.VD_ELECTRON_APP_PATH) : '', `--user-data-dir=${userData}`].filter(Boolean),
  dumpio: true,
  env: { ...process.env, VD_AGENT_DISABLE_ENV_IMPORT: '1', VD_AGENT_CHAT_TIMEOUT_MS: '1000' },
})
try {
  const page = await app.firstWindow()
  const input = page.locator('textarea[aria-label="Chat message input"], textarea[placeholder*="Ask or queue" i]').first()
  await input.waitFor({ state: 'visible', timeout: 20_000 })
   await input.fill('STALL-TIMEOUT Create the fixture file, then verify it with a command.')
  await input.press('Enter')
  try {
    await page.getByText(/Agent stopped: per-turn timeout/).waitFor({ state: 'visible', timeout: 20_000 })
  } catch {
    throw new Error(`Timeout notice did not appear; timeoutCalls=${timeoutCalls}; body=${(await page.locator('body').innerText().catch(() => '')).slice(-1600)}`)
  }
   if (timeoutCalls < 1) throw new Error(`Expected at least one timed-out chat call, got ${timeoutCalls}`)

   await app.close()
   prosePhase = 0
   const proseUserData = path.join(root, 'prose-userdata')
   await fs.mkdir(proseUserData, { recursive: true })
   await fs.writeFile(path.join(proseUserData, 'settings.json'), JSON.stringify({
     providers: [{ id: 'custom_openai', name: 'Test provider', apiKey: 'test-loop-stall-key', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'stall-model' }],
     activeProvider: 'custom_openai', workspacePath: workspace, permissionMode: 'ask-risky', setupChecklistDismissed: true,
   }, null, 2))
   const proseApp = await playwright._electron.launch({
     executablePath: path.resolve(exe),
     args: [process.env.VD_ELECTRON_APP_PATH ? path.resolve(process.env.VD_ELECTRON_APP_PATH) : '', `--user-data-dir=${proseUserData}`].filter(Boolean),
     dumpio: true,
     env: { ...process.env, VD_AGENT_DISABLE_ENV_IMPORT: '1', VD_AGENT_CHAT_TIMEOUT_MS: '1000' },
   })
   try {
     const prosePage = await proseApp.firstWindow()
     const proseInput = prosePage.locator('textarea[aria-label="Chat message input"], textarea[placeholder*="Ask or queue" i]').first()
     await proseInput.waitFor({ state: 'visible', timeout: 20_000 })
     await proseInput.fill('STALL-PROSE Create the fixture and inspect it after the tool result.')
     await proseInput.press('Enter')
     await prosePage.getByText(/Done\. The fixture was inspected successfully\./).waitFor({ state: 'visible', timeout: 20_000 })
     if (proseCalls !== 4) throw new Error(`Expected exactly one prose recovery retry and a final answer, got ${proseCalls} calls`)
     if ((await fs.readFile(path.join(workspace, 'stall-fixture.txt'), 'utf8')) !== 'stall regression fixture\n') {
       throw new Error('The first tool call did not create the fixture file')
     }
   } finally {
     await proseApp.close().catch(() => {})
   }
   console.log(JSON.stringify({ status: 'pass', timeoutCalls, proseCalls, message: 'timeout surfaced; prose recovery completed' }))
} finally {
  await app.close().catch(() => {})
  await new Promise((resolve) => server.close(resolve))
}

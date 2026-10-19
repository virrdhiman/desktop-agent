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

let chatCalls = 0
const server = http.createServer(async (request, response) => {
  if (request.url === '/v1/models') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'stall-model' }] }))
    return
  }
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    let body = ''
    for await (const chunk of request) body += chunk
    chatCalls++
    // Keep this turn open to prove that the renderer surfaces the bounded
    // per-turn timeout instead of leaving the queue in a running state.
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
  await input.fill('Create the fixture file, then verify it with a command.')
  await input.press('Enter')
  try {
    await page.getByText(/Agent stopped: per-turn timeout/).waitFor({ state: 'visible', timeout: 20_000 })
  } catch {
    throw new Error(`Timeout notice did not appear; chatCalls=${chatCalls}; body=${(await page.locator('body').innerText().catch(() => '')).slice(-1600)}`)
  }
  if (chatCalls < 1) throw new Error(`Expected at least one timed-out chat call, got ${chatCalls}`)
  console.log(JSON.stringify({ status: 'pass', chatCalls, message: 'Agent stopped: per-turn timeout' }))
} finally {
  await app.close().catch(() => {})
  await new Promise((resolve) => server.close(resolve))
}

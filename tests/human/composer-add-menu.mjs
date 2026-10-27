import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const require = createRequire(path.join(repo, 'package.json'))
const outDir = path.resolve(process.env.COMPOSER_E2E_OUT || 'C:/vd-vms/screenshots/composer-add-menu')
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vd-composer-e2e-'))
const workspace = path.join(root, 'workspace')
const userData = path.join(root, 'userdata')
await fs.mkdir(workspace, { recursive: true })
await fs.mkdir(userData, { recursive: true })
await fs.writeFile(path.join(workspace, 'example.ts'), 'export const answer = 42\n')
await fs.mkdir(path.join(workspace, 'src'))
await fs.writeFile(path.join(workspace, 'src', 'feature.ts'), 'export function feature() { return true }\n')
await fs.mkdir(outDir, { recursive: true })

let chatCalls = 0
const server = http.createServer(async (request, response) => {
  if (request.url?.endsWith('/models')) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'composer-test-model' }] }))
    return
  }
  if (!request.url?.endsWith('/chat/completions')) {
    response.writeHead(404)
    response.end()
    return
  }
  let body = ''
  for await (const chunk of request) body += chunk
  const payload = JSON.parse(body)
  const hasToolResult = (payload.messages || []).some((message) => String(message.content || '').includes('Tool results:'))
  chatCalls++
  const content = !hasToolResult
    ? '```tool\n{"name":"read_file","args":{"path":"example.ts"}}\n```'
    : 'Plan execution complete after the approved verification.'
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  providers: [{ id: 'custom_openai', name: 'Composer test', apiKey: 'local-test', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'composer-test-model' }],
  activeProvider: 'custom_openai', workspacePath: workspace, teamMode: 'off', setupChecklistDismissed: true,
}, null, 2))

const playwright = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright-core')
const electron = require('electron')
const app = await playwright._electron.launch({
  executablePath: electron,
  args: [repo, `--user-data-dir=${userData}`],
  env: { ...process.env, VD_AGENT_DISABLE_ENV_IMPORT: '1', VD_AGENT_AUTO_APPROVE_TOOLS: '1' },
})
const page = await app.firstWindow()
const input = page.locator('textarea[aria-label="Chat message input"]')
const shot = async (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) })
try {
  await input.waitFor({ state: 'visible', timeout: 20_000 })
  await shot('01-ready')

  await page.getByRole('button', { name: 'Add to chat' }).click()
  await page.getByRole('menu', { name: 'Add to chat' }).waitFor({ state: 'visible' })
  await shot('02-plus-menu')
  await page.keyboard.press('Escape')

  await input.fill('/')
  await page.getByRole('menu', { name: 'Add to chat' }).waitFor({ state: 'visible' })
  await shot('03-slash-menu')
  await input.fill('/plan')
  await page.getByRole('menu').press('Enter')
  await page.getByText('Plan Mode', { exact: false }).waitFor({ state: 'visible' })
  await shot('04-plan-mode')

  await page.getByRole('button', { name: 'Add to chat' }).click()
  await page.getByRole('menuitem', { name: /Goal/ }).click()
  await page.getByRole('textbox', { name: 'Task goal' }).fill('Keep the verification green')
  await page.getByRole('button', { name: 'Set', exact: true }).click()
  await page.getByText('Goal:', { exact: false }).waitFor({ state: 'visible' })
  await shot('05-goal-set')

  await input.fill('@example')
  await page.getByRole('menu', { name: 'Add to chat' }).waitFor({ state: 'visible' })
  await page.getByRole('menuitem', { name: /example\.ts/ }).press('Enter')
  await page.getByText('example.ts', { exact: true }).waitFor({ state: 'visible' })
  await shot('06-file-attached')

  await input.fill('PLAN-E2E verify the attached file')
  await input.press('Enter')
  await page.getByText('Plan ready. No tools ran.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
  if (chatCalls !== 1) throw new Error(`Expected one pre-approval request, got ${chatCalls}`)
  await shot('07-awaiting-approval')
  await page.getByRole('button', { name: 'Approve and run' }).click()
  await page.getByText('Plan execution complete after the approved verification.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
  if (chatCalls < 2) throw new Error('Approval did not resume the request')
  await shot('08-approved-result')

  await page.getByRole('button', { name: 'Clear task goal' }).click()
  if (await page.getByText('Goal:', { exact: false }).count()) throw new Error('Goal was not cleared')
  await shot('09-goal-cleared')
  console.log(JSON.stringify({ status: 'pass', screenshots: outDir, chatCalls }))
} finally {
  await app.close().catch(() => {})
  await new Promise((resolve) => server.close(resolve))
}

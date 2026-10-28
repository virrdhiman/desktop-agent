import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(path.join(repo, 'package.json'))
const timestamp = new Date().toISOString().replaceAll(':', '-')
const profile = path.join(repo, '.work', 'live-agent-activity', timestamp)
const screenshots = path.join(repo, '.work', 'screens', 'live-agent-activity', timestamp)
const fixture = path.join('C:\\vd-vms\\qa-fixture', `agent-activity-${timestamp}`)
const evidence = { startedAt: new Date().toISOString(), checks: [], screenshots: [], errors: 0 }
const fakeKey = `activity-e2e-${randomUUID()}`
const envSecret = `activity-env-${randomUUID()}`

const freeBytes = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', '[int64](Get-PSDrive C).Free'], { encoding: 'utf8' }).trim())
if (!Number.isFinite(freeBytes) || freeBytes < 20 * 1024 ** 3) throw new Error('Refusing activity E2E: C: has less than 20 GB free.')

await fs.mkdir(profile, { recursive: true })
await fs.mkdir(screenshots, { recursive: true })
await fs.mkdir(fixture, { recursive: true })
await fs.writeFile(path.join(fixture, 'activity-fixture.txt'), 'ACTIVITY_FIXTURE_MARKER\nRead this fixture before running the command.\n')

let playwright
for (const candidate of [process.env.PLAYWRIGHT_PACKAGE, 'playwright', 'playwright-core'].filter(Boolean)) {
  try { playwright = require(candidate); break } catch {}
}
if (!playwright?._electron) throw new Error('Playwright Electron support is required; set PLAYWRIGHT_PACKAGE to an installed Playwright package.')

const toolBlock = (name, args) => `\`\`\`tool\n${JSON.stringify({ name, args })}\n\`\`\``
const commandOutput = `node -e "console.log('ACTIVITY_COMMAND_BEGIN');console.log(process.env.VD_ACTIVITY_TEST_SECRET);setTimeout(()=>console.log('ACTIVITY_COMMAND_OK'),900)"`
const slowCommand = `node -e "console.log('STOP_COMMAND_STARTED');setTimeout(()=>console.log('STOP_SHOULD_CANCEL'),30000)"`

const provider = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url?.endsWith('/models')) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'activity-test-model' }] }))
    return
  }
  if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
    response.writeHead(404).end()
    return
  }
  let raw = ''
  request.on('data', (chunk) => { raw += chunk })
  request.on('end', () => {
    let body = {}
    try { body = JSON.parse(raw) } catch {}
    const transcript = JSON.stringify(body.messages || [])
    let content
    if (transcript.includes('ACTIVITY_STOP_QUERY')) {
      content = toolBlock('run_command', { command: slowCommand })
    } else if (transcript.includes('ACTIVITY_COMMAND_OK')) {
      content = 'I read the fixture and ran the command successfully.'
    } else if (transcript.includes('ACTIVITY_FIXTURE_MARKER')) {
      content = toolBlock('run_command', { command: commandOutput })
    } else {
      content = toolBlock('read_file', { path: 'activity-fixture.txt' })
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content } }] }))
  })
})
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${provider.address().port}/v1`

let app
let page
const assert = (condition, name) => {
  if (!condition) throw new Error(`Live activity E2E failed: ${name}`)
  evidence.checks.push({ name, passed: true })
}
const screenshot = async (name) => {
  const file = path.join(screenshots, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  evidence.screenshots.push(file)
  return file
}
const launch = async () => playwright._electron.launch({
  executablePath: require('electron'),
  args: [repo, '--remote-debugging-port=0', `--user-data-dir=${profile}`],
  cwd: repo,
  env: {
    ...process.env,
    VD_AGENT_AUTO_APPROVE_TOOLS: '1',
    VD_AGENT_DISABLE_ENV_IMPORT: '1',
    VD_ACTIVITY_TEST_SECRET: envSecret,
  },
})
const waitForVisible = async (locator, timeout = 20_000) => locator.waitFor({ state: 'visible', timeout })
const sendPrompt = async (text) => {
  const input = page.getByRole('textbox', { name: 'Chat message input' })
  await waitForVisible(input)
  await input.fill(text)
  await input.press('Enter')
}

try {
  app = await launch()
  page = await app.firstWindow()
  page.on('console', (message) => { if (message.type() === 'error') evidence.errors += 1 })
  page.on('pageerror', () => { evidence.errors += 1 })
  const settingsResult = await page.evaluate(async ({ baseUrl, fakeKey, fixture }) => {
    const settings = await window.api.loadSettings()
    const selected = settings.providers.find((candidate) => candidate.id !== 'anthropic' && candidate.id !== 'gemini') || settings.providers[0]
    if (!selected) return { error: 'No compatible provider entry exists in the isolated profile.' }
    const providers = settings.providers.map((candidate) => candidate.id === selected.id
      ? { ...candidate, baseUrl, model: 'activity-test-model', models: ['activity-test-model'], apiKey: fakeKey, hasKey: true }
      : candidate)
    return window.api.saveSettings({
      ...settings, providers, activeProvider: selected.id, workspacePath: fixture,
      teamMode: 'off', setupChecklistDismissed: true, allowPaidModels: true,
    })
  }, { baseUrl, fakeKey, fixture })
  assert(!settingsResult?.error, 'isolated local provider and fixture workspace configured')
  await page.reload()
  const skip = page.getByRole('button', { name: 'Skip use defaults', exact: true })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await waitForVisible(page.getByRole('textbox', { name: 'Chat message input' }))
  await screenshot('agent-before-query')

  await sendPrompt('Read activity-fixture.txt, then run the local verification command and summarize it.')
  const readStep = page.locator('.vd-agent-activity-step').filter({ hasText: 'Reading activity-fixture.txt' }).first()
  await waitForVisible(readStep, 30_000)
  assert(await readStep.isVisible(), 'file read appears as an ordered activity step')
  assert(!await page.getByText('Thinking...', { exact: true }).isVisible().catch(() => false), 'activity replaces the generic Thinking indicator')
  const commandStep = page.locator('.vd-agent-activity-step').filter({ hasText: 'Running node -e' }).first()
  await waitForVisible(commandStep, 30_000)
  const orderedSteps = await page.locator('.vd-agent-activity-step > summary').allTextContents()
  assert(orderedSteps.findIndex((text) => text.includes('Reading activity-fixture.txt')) < orderedSteps.findIndex((text) => text.includes('Running node -e')), 'file and command steps appear in order')
  await commandStep.locator('summary').click()
  const liveOutput = commandStep.locator('pre').filter({ hasText: 'ACTIVITY_COMMAND_BEGIN' }).last()
  await waitForVisible(liveOutput, 10_000)
  await screenshot('activity-live-command-output')
  const activityText = await page.locator('.vd-agent-activity').allTextContents()
  assert(activityText.join('\n').includes('[redacted]'), 'command output is live and environment values are masked')
  assert(!activityText.join('\n').includes(envSecret), 'masked environment value is absent from chat activity')
  await waitForVisible(page.getByText('I read the fixture and ran the command successfully.', { exact: true }), 30_000)
  await screenshot('activity-query-complete')
  assert(await page.locator('.vd-agent-activity').count() > 0, 'completed activity remains attached to the assistant message')

  await sendPrompt('ACTIVITY_STOP_QUERY: start the long fixture command and wait for me to stop it.')
  const runningCommand = page.locator('.vd-agent-activity-step').filter({ hasText: 'Running node -e' }).last()
  await waitForVisible(runningCommand, 30_000)
  await runningCommand.locator('summary').click()
  await waitForVisible(runningCommand.locator('pre').filter({ hasText: 'STOP_COMMAND_STARTED' }).last(), 10_000)
  await screenshot('activity-before-stop')
  const stop = page.getByRole('button', { name: /Stop/ }).first()
  await waitForVisible(stop)
  await stop.click()
  const cancelledStep = page.getByText('Remaining steps cancelled', { exact: true }).last()
  await cancelledStep.waitFor({ state: 'attached', timeout: 10_000 })
  await page.locator('.vd-agent-activity').last().locator(':scope > summary').click()
  await waitForVisible(cancelledStep, 10_000)
  await screenshot('activity-after-stop')
  assert(await page.getByText('Remaining steps cancelled', { exact: true }).isVisible(), 'Stop cancels the active command and records cancelled steps')

  await new Promise((resolve) => setTimeout(resolve, 1_500))
  await app.close()
  app = await launch()
  page = await app.firstWindow()
  page.on('console', (message) => { if (message.type() === 'error') evidence.errors += 1 })
  page.on('pageerror', () => { evidence.errors += 1 })
  await waitForVisible(page.getByRole('textbox', { name: 'Chat message input' }))
  if (!await page.getByText('Reading activity-fixture.txt', { exact: false }).count()) {
    const expandHistory = page.getByRole('button', { name: 'Expand history' })
    if (await expandHistory.isVisible().catch(() => false)) await expandHistory.click()
    const resume = page.getByRole('button', { name: 'Resume', exact: true }).first()
    await waitForVisible(resume)
    await resume.click()
  }
  const restoredActivity = page.locator('.vd-agent-activity').filter({ hasText: 'Reading activity-fixture.txt' }).first()
  await restoredActivity.waitFor({ state: 'attached', timeout: 15_000 })
  if (!await page.getByText('Reading activity-fixture.txt', { exact: false }).isVisible().catch(() => false)) {
    await restoredActivity.locator(':scope > summary').click()
  }
  await waitForVisible(page.getByText('Reading activity-fixture.txt', { exact: false }), 15_000)
  await screenshot('activity-history-after-reload')
  assert(await page.getByText('Worked for', { exact: false }).count() > 0, 'saved activity history reloads with the chat')
  assert(evidence.errors === 0, `no renderer console or page errors (${evidence.errors})`)
  evidence.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(screenshots, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(`PASS live activity E2E: ${evidence.checks.length} checks; screenshots: ${screenshots}`)
} catch (error) {
  evidence.failed = error instanceof Error ? error.message : 'Unknown E2E error'
  evidence.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(screenshots, 'evidence.json'), JSON.stringify(evidence, null, 2)).catch(() => {})
  throw error
} finally {
  if (app) await app.close().catch(() => {})
  await new Promise((resolve) => provider.close(resolve))
}

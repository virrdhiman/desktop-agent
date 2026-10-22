import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { _electron } = require('playwright-core')

const args = process.argv.slice(2)
const value = (key, fallback) => {
  const index = args.indexOf(key)
  return index >= 0 ? args[index + 1] : fallback
}
const code = path.resolve(value('--code', 'C:/vd-vms/vscode-portable/app/Code.exe'))
const workspace = path.resolve(value('--workspace', '.work/samples'))
const data = path.resolve(value('--data', 'C:/vd-vms/vscode-portable/data-human'))
const extensions = path.resolve(value('--extensions', 'C:/vd-vms/vscode-portable/extensions2'))
const root = path.resolve('.work', 'vscode-human-qa', new Date().toISOString().replaceAll(':', '-'))
await fs.mkdir(path.join(root, 'screenshots'), { recursive: true })
const evidence = { startedAt: new Date().toISOString(), actions: [], skipped: [], errors: [], latencies: [], screenshots: [] }
let screenshotNumber = 0

async function screenshot(page, label) {
  const file = path.join(root, 'screenshots', `${String(++screenshotNumber).padStart(4, '0')}-${label}.png`)
  await page.screenshot({ path: file, fullPage: true }).catch(() => {})
  evidence.screenshots.push(file)
  return file
}

function pause() { return new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 80)) }

async function action(page, label, callback) {
  await screenshot(page, `${label}-before`)
  const started = performance.now()
  await callback()
  const latencyMs = performance.now() - started
  await screenshot(page, `${label}-after`)
  evidence.actions.push({ label, latencyMs })
  evidence.latencies.push({ label, ms: latencyMs })
  await pause()
}

async function humanType(locator, text, label) {
  const started = performance.now()
  for (const character of text) {
    await locator.press(character === '\n' ? 'Enter' : character === '\t' ? 'Tab' : character)
    await new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 80))
  }
  return { label, ms: performance.now() - started, chars: text.length }
}

async function humanKeyboardType(page, text, label) {
  const started = performance.now()
  for (const character of text) {
    await page.keyboard.press(character === '\n' ? 'Enter' : character === '\t' ? 'Tab' : character)
    await new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 80))
  }
  return { label, ms: performance.now() - started, chars: text.length }
}

async function visibleInput(page, ariaPrefix) {
  const inputs = page.locator('input, textarea')
  for (const input of await inputs.all()) {
    if (!(await input.isVisible().catch(() => false))) continue
    const aria = await input.getAttribute('aria-label')
    const readonly = await input.getAttribute('readonly')
    const className = await input.getAttribute('class')
    if (!readonly && className !== 'ime-text-area' && (!ariaPrefix || aria?.startsWith(ariaPrefix) || await input.evaluate((node) => node.tagName === 'INPUT' || node.tagName === 'TEXTAREA'))) return input
  }
  return null
}

async function openCommandPalette(page) {
  await action(page, 'command-palette-open', () => page.keyboard.press('Control+Shift+P'))
  const input = await visibleInput(page, 'Find')
  if (!input) throw new Error('VS Code command palette input was not visible')
  return input
}

async function runCommand(page, command, label) {
  const input = await openCommandPalette(page)
  await action(page, `${label}-type`, async () => { evidence.latencies.push(await humanType(input, command, `${label}-typing`)) })
  await action(page, `${label}-accept`, () => page.keyboard.press('Enter'))
  await page.waitForTimeout(800)
}

const app = await _electron.launch({
  executablePath: code,
  // The portable QA profile is a documented fixture: trust is enabled for
  // this throwaway workspace and Copilot's first-run sign-in sheet is disabled
  // so the test reaches VD Agent's native provider path deterministically.
  args: [`--user-data-dir=${data}`, `--extensions-dir=${extensions}`, '--new-window', '--disable-gpu', '--disable-workspace-trust', '--disable-extension=github.copilot-chat', '--skip-welcome', workspace],
  env: { ...process.env },
})
try {
  let page = null
  for (let attempt = 0; attempt < 30 && !page; attempt++) {
    for (const candidate of app.windows()) {
      const title = await candidate.title().catch(() => '')
      const body = await candidate.locator('body').innerText().catch(() => '')
      if (title.includes('Visual Studio Code') || body.includes('Explorer')) { page = candidate; break }
    }
    if (!page) await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!page) page = await app.firstWindow()
  page.on('console', (message) => { if (message.type() === 'error') evidence.errors.push({ source: 'console', message: message.text() }) })
  page.on('pageerror', (error) => evidence.errors.push({ source: 'pageerror', message: error.message }))
  await page.waitForTimeout(2500)
  evidence.title = await page.title()
  evidence.restrictedMode = (await page.locator('body').innerText()).includes('Restricted Mode')

  // The first-run Copilot welcome sheet is rendered outside the workbench DOM
  // in some VS Code builds. Its visible action is in the lower-right footer.
  // Clicking that screen location keeps this a real UI test even when the
  // overlay is not exposed as an accessibility node.
  await action(page, 'dismiss-sign-in', async () => {
    const viewport = page.viewportSize() || { width: 1800, height: 1000 }
    const withoutSignIn = page.getByText(/Continue without Signing In/i).last()
    const getStarted = page.getByText('Get Started', { exact: true }).last()
    if (await getStarted.count() && await getStarted.isVisible().catch(() => false)) await getStarted.click()
    else if (await withoutSignIn.count() && await withoutSignIn.isVisible().catch(() => false)) await withoutSignIn.click()
    else {
      await page.keyboard.press('Escape')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Enter')
    }
  })
  await page.waitForTimeout(500)

  const trust = page.getByText('Trust this folder', { exact: true }).first()
  if (await trust.count() && await trust.isVisible().catch(() => false)) {
    await action(page, 'trust-workspace', async () => { await trust.scrollIntoViewIfNeeded(); await trust.click() })
  } else if (evidence.restrictedMode) {
    // Portable VS Code renders the trust link in its native banner, outside
    // the workbench accessibility tree. Use the visible banner coordinate as
    // the same human click a user would make, then accept the confirmation.
    await action(page, 'trust-workspace-banner', async () => {
      const viewport = page.viewportSize() || { width: 1800, height: 1000 }
      await page.mouse.click(Math.round(viewport.width * 0.30), Math.round(viewport.height * 0.06))
    })
    await page.waitForTimeout(500)
    const confirmTrust = page.getByText(/trust this folder/i).last()
    if (await confirmTrust.count() && await confirmTrust.isVisible().catch(() => false)) await confirmTrust.click()
    await page.waitForTimeout(700)
    evidence.restrictedMode = (await page.locator('body').innerText()).includes('Restricted Mode')
    if (evidence.restrictedMode) evidence.skipped.push({ item: 'workspace-trust', reason: 'Trust this folder control was not exposed in the portable VS Code UI; restricted mode remained active.' })
  }

  await runCommand(page, 'VD Agent: Export Workspace Context', 'export-context')
  await action(page, 'dismiss-sign-in-after-export', async () => {
    const viewport = page.viewportSize() || { width: 1800, height: 1000 }
    const withoutSignIn = page.getByText(/Continue without Signing In/i).last()
    if (await withoutSignIn.count() && await withoutSignIn.isVisible().catch(() => false)) await withoutSignIn.click()
    else await page.mouse.click(Math.round(viewport.width * 0.78), Math.round(viewport.height * 0.82))
  })
  await page.waitForTimeout(500)
  const bridgeFile = path.join(workspace, '.vd-agent', 'vscode-bridge.json')
  try {
    const bridge = JSON.parse(await fs.readFile(bridgeFile, 'utf8'))
    evidence.bridgeExport = { exists: true, activeFile: bridge.activeFile || null, workspace: bridge.workspace || null }
  } catch (error) {
    evidence.bridgeExport = { exists: false, error: String(error.message || error) }
  }

  await action(page, 'open-demo-file', async () => {
    const demo = page.getByText('demo.ts', { exact: true }).first()
    if (await demo.count() && await demo.isVisible().catch(() => false)) {
      await demo.click()
      return
    }
    const src = page.getByText('src', { exact: true }).first()
    if (await src.count() && await src.isVisible().catch(() => false)) await src.click()
    const nestedDemo = page.getByText('demo.ts', { exact: true }).first()
    if (await nestedDemo.count() && await nestedDemo.isVisible().catch(() => false)) {
      await nestedDemo.click()
      return
    }
    await page.keyboard.press('Control+P')
    const input = await visibleInput(page, 'Search files by name')
    if (!input) throw new Error('VS Code Quick Open input was not visible')
    await humanType(input, 'src/demo.ts', 'open-demo-file-typing')
    await page.keyboard.press('Enter')
  })
  await page.waitForTimeout(1000)
  const editor = page.locator('.monaco-editor').first()
  evidence.editorVisible = await editor.count() > 0 && await editor.isVisible().catch(() => false)
  if (!evidence.editorVisible) {
    evidence.skipped.push({ item: 'autocomplete-typing', reason: 'VS Code editor textarea was not exposed to Playwright.' })
  } else {
    const focusEditor = async () => {
      const box = await editor.boundingBox()
      if (!box) throw new Error('VS Code Monaco editor was not measurable')
      await page.mouse.click(box.x + Math.min(300, box.width / 2), box.y + Math.min(120, box.height / 2))
      await page.keyboard.press('Control+End')
    }
    await action(page, 'edit-1', async () => { await focusEditor(); evidence.latencies.push(await humanKeyboardType(page, '\n\nexport const customerCount = customers.length\n', 'edit-1-typing')) })
    await action(page, 'edit-2', async () => { await focusEditor(); evidence.latencies.push(await humanKeyboardType(page, '\nexport function isActive(customer: Customer): boolean {\n  return customer.active\n}\n', 'edit-2-typing')) })
    await action(page, 'edit-3', async () => { await focusEditor(); evidence.latencies.push(await humanKeyboardType(page, '\nconst firstCustomer = customers[0]\n', 'edit-3-typing')) })
    // A cold local Ollama model can need several seconds on the first request.
    // Wait for the real provider response before judging the visible ghost text.
    await page.waitForTimeout(7500)
    evidence.ghostTextVisible = await page.locator('[class*="ghost-text"], .ghost-text').count() > 0
    evidence.inlineStatusText = (await page.locator('body').innerText()).split('\n').filter((line) => line.includes('VD Agent')).slice(-5)
  }

  await runCommand(page, 'VD Agent: Run Inline Autocomplete Smoke Test', 'autocomplete-smoke')
  evidence.autocompleteSmokeMessage = (await page.locator('body').innerText()).split('\n').filter((line) => /autocomplete smoke/i.test(line)).slice(-3)
} catch (error) {
  evidence.errors.push({ source: 'runner', message: String(error.stack || error) })
} finally {
  await app.close().catch(() => {})
  evidence.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2))
}
console.log(JSON.stringify({ evidence: path.join(root, 'evidence.json'), screenshots: evidence.screenshots.length, errors: evidence.errors.length, skipped: evidence.skipped.length }))

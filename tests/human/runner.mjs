import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadPlaywright, makeEvidence } from './qa-helper.mjs'
import { runScenario } from './scenarios.mjs'

const args = process.argv.slice(2); const value = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : undefined }
const exe = value('--exe'); if (!exe) { console.error('Usage: node tests/human/runner.mjs --exe <packaged executable> [--scenario smoke,terminal,persistence,search,checklist] [--keep-setup]'); process.exit(2) }
const driveFree = process.platform === 'win32' ? Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-PSDrive C).Free'], { encoding: 'utf8' }).trim()) : Number(execFileSync('df', ['-Pk', '/mnt/c'], { encoding: 'utf8' }).trim().split(/\s+/).at(-3)) * 1024
if (driveFree < 20 * 1024 ** 3) throw new Error('Refusing QA writes: C: has less than 20 GB free')
const root = path.resolve('.work', 'human-qa', new Date().toISOString().replaceAll(':', '-')); await fs.mkdir(root, { recursive: true }); const q = await makeEvidence(root)
let playwright; try { playwright = loadPlaywright() } catch (error) { q.evidence.errors.push({ message: error.message }); await q.save(); console.error(error.message); process.exit(3) }
const executableArgs = exe.toLowerCase().endsWith('.appimage') ? ['--appimage-extract-and-run'] : []
const userDataDir = path.resolve(root, 'userdata')
const launch = () => playwright._electron.launch({ executablePath: path.resolve(exe), args: [...executableArgs, '--user-data-dir=' + userDataDir], env: { ...process.env, VD_AGENT_DISABLE_ENV_IMPORT: '1' } })
let app = await launch()
try {
  let page = await app.firstWindow()
  page.on('console', m => { if (m.type() === 'error') q.evidence.errors.push({ source: 'console', message: m.text() }) })
  page.on('pageerror', e => q.evidence.errors.push({ source: 'pageerror', message: e.message }))
  const skipSetup = page.getByRole('button', { name: 'Skip use defaults', exact: true })
  await page.waitForTimeout(800)
  const scenarios = (value('--scenario') || 'smoke').split(',')
  if (!args.includes('--keep-setup') && !scenarios.some(s => ['skip', 'customize', 'checklist'].includes(s)) && await skipSetup.count()) {
    await q.shot(page, 'optional-setup-before-scroll')
    await skipSetup.scrollIntoViewIfNeeded()
    await q.shot(page, 'optional-setup-after-scroll')
    await q.click(page, skipSetup, 'optional-setup-skip')
  }
  for (const scenario of scenarios) {
    if (scenario === 'crash') {
      await q.shot(page, 'crash-before-kill')
      try {
        const process = app.process()
        process.kill()
        await new Promise(resolve => setTimeout(resolve, 1_000))
        app = await launch()
        page = await app.firstWindow()
        await page.getByRole('tab', { name: /Help panel/ }).click()
        await page.getByRole('region', { name: 'Help > Diagnostics' }).waitFor({ state: 'visible', timeout: 15_000 })
        await q.shot(page, 'crash-after-restart-diagnostics')
        q.record('assert', { scenario, result: 'forced app termination was followed by visible diagnostics after restart' })
      } catch (error) {
        q.evidence.errors.push({ scenario, message: error?.message || String(error) })
        q.evidence.skipped.push({ scenario, reason: `Exact crash/restart harness error: ${error?.message || String(error)}` })
      }
      continue
    }
    if (scenario === 'resume') {
      const input = page.locator('textarea[aria-label="Chat message input"], textarea[placeholder*="Ask or queue" i]').first()
      if (await input.isVisible().catch(() => false)) {
        await q.click(page, input, 'resume-marker-focus')
        await q.type(page, input, 'QA resume marker', 'resume-marker')
        await q.shot(page, 'resume-marker-before-submit')
        await input.press('Enter')
        q.record('key', { label: 'resume-marker-submit', key: 'Enter', latencyMs: 0 })
        await q.shot(page, 'resume-before-restart')
        await new Promise(resolve => setTimeout(resolve, 5_500))
        await app.close()
        app = await launch()
        page = await app.firstWindow()
        await page.getByRole('tab', { name: /Sessions panel/ }).click()
        await page.getByRole('button', { name: 'Resume', exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 })
        await q.shot(page, 'resume-after-restart')
        q.record('assert', { scenario, result: 'saved session was visible after application restart' })
      } else q.evidence.skipped.push({ scenario, reason: 'No visible chat input for a resumable marker' })
    } else await runScenario(scenario, page, q)
  }
} finally {
  try { await Promise.race([app.close(), new Promise(resolve => setTimeout(resolve, 5_000))]) } catch {}
  try {
    const child = app.process()
    if (child && !child.killed) child.kill()
  } catch {}
  await q.save()
}
console.log(JSON.stringify({ evidence: path.join(root, 'evidence.json'), scenarios: (value('--scenario') || 'smoke').split(',') }))

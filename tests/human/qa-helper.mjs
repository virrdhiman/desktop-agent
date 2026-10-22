import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

export function loadPlaywright() {
  const require = createRequire(import.meta.url)
  const candidates = [process.env.PLAYWRIGHT_PACKAGE, 'playwright'].filter(Boolean)
  for (const name of candidates) { try { return require(name) } catch {} }
  throw new Error('Playwright is required. Set PLAYWRIGHT_PACKAGE to a package resolution path; no dependency was installed.')
}

export async function makeEvidence(root) {
  await fs.mkdir(path.join(root, 'screenshots'), { recursive: true })
  const evidence = { startedAt: new Date().toISOString(), actions: [], errors: [], glitches: [], skipped: [], latencies: [] }
  let n = 0
  const shot = async (page, label) => { const file = path.join(root, 'screenshots', `${String(++n).padStart(4, '0')}-${label}.png`); await page.screenshot({ path: file, fullPage: true }).catch(() => {}); return file }
  const record = (action, detail = {}) => evidence.actions.push({ at: new Date().toISOString(), action, ...detail })
  const pause = () => new Promise(r => setTimeout(r, 150 + Math.random() * 350))
  const click = async (page, locator, label) => { await shot(page, `${label}-before`); const t = performance.now(); await locator.click(); const latency = performance.now() - t; await shot(page, `${label}-after`); record('click', { label, latencyMs: latency }); evidence.latencies.push({ label, kind: 'click', ms: latency }); await pause() }
  const type = async (page, locator, text, label) => { for (const [i, key] of [...text].entries()) { await shot(page, `${label}-key-${i}-before`); const t = performance.now(); await locator.press(key); const ms = performance.now() - t; await shot(page, `${label}-key-${i}-after`); record('key', { label, key: key === ' ' ? 'Space' : key, latencyMs: ms }); evidence.latencies.push({ label, kind: 'key', key, ms }); await new Promise(r => setTimeout(r, 120 + Math.random() * 80)) } }
  const save = async () => { evidence.finishedAt = new Date().toISOString(); await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2)) }
  return { evidence, shot, click, type, pause, record, save, root }
}
export async function sha256(file) { const data = await fs.readFile(file); return crypto.createHash('sha256').update(data).digest('hex') }

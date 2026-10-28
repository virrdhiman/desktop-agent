import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const output = path.join(root, '.work', 'screens', `themes-${runId}`)
const userData = path.join(root, '.work', 'theme-profiles', runId)
const electronPath = createRequire(import.meta.url)('electron')
const shots = ['system', 'light', 'dark', 'pink-light', 'pink-dark', 'pit-brand-light', 'pit-brand-dark']
const env = Object.fromEntries(
  ['PATH', 'SystemRoot', 'WINDIR', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP', 'USERPROFILE']
    .map((key) => [key, process.env[key]])
    .filter(([, value]) => value),
)
Object.assign(env, { VD_AGENT_DISABLE_ENV_IMPORT: '1', VD_AGENT_QA_DIALOGS: '1' })
fs.mkdirSync(output, { recursive: true })
fs.mkdirSync(userData, { recursive: true })

async function launch() {
  return electron.launch({
    executablePath: electronPath,
    args: ['.', '--vd-qa-dialogs', `--user-data-dir=${userData}`],
    cwd: root,
    env,
  })
}

let passed = 0
let app = await launch()
try {
  let page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true })
  await settingsButton.waitFor({ state: 'visible', timeout: 30_000 })

  const skip = page.getByRole('button', { name: /Skip use defaults|Continue to PIT Agent/i })
  if (await skip.count()) await skip.first().click()
  await settingsButton.click()
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByRole('radiogroup', { name: 'Appearance theme' }).waitFor({ state: 'visible' })

  for (const [index, theme] of shots.entries()) {
    const radio = page.locator('input[name="pit-agent-theme"]').nth(index)
    const card = radio.locator('xpath=..')
    await card.click()
    await page.waitForFunction((selected) => document.documentElement.dataset.theme === selected, theme)
    await page.screenshot({ path: path.join(output, `${theme}.png`), fullPage: false })
    const selected = await radio.isChecked()
    if (!selected) throw new Error(`Appearance radio did not stay selected: ${theme}`)
    passed += 1
  }

  await app.close()
  app = await launch()
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'pit-brand-dark', undefined, { timeout: 30_000 })
  passed += 1
  console.log(`Theme Electron smoke: ${passed}/${shots.length + 1} passed`)
  console.log(`Screenshots: ${output}`)
  console.log('Persistence: pit-brand-dark selection survived app restart in isolated userData')
} finally {
  await app.close().catch(() => {})
}

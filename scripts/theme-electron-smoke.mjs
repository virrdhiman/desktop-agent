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
const cases = [
  { preference: 'pit-brand', id: 'pit-brand-light', scheme: 'light', expectedBackground: '#ffffff' },
  { preference: 'pit-brand', id: 'pit-brand-dark', scheme: 'dark', expectedBackground: '#08111f' },
  { preference: 'light', id: 'light', scheme: 'light' },
  { preference: 'dark', id: 'dark', scheme: 'dark' },
  { preference: 'pink-light', id: 'pink-light', scheme: 'light' },
  { preference: 'pink-dark', id: 'pink-dark', scheme: 'dark' },
  { preference: 'system', id: 'system', scheme: 'dark' },
]
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
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'pit-brand')
  passed += 1
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true })
  await settingsButton.waitFor({ state: 'visible', timeout: 30_000 })

  const skip = page.getByRole('button', { name: /Skip use defaults|Continue to PIT Agent/i })
  if (await skip.count()) await skip.first().click()
  await settingsButton.click()
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByRole('radiogroup', { name: 'Appearance theme' }).waitFor({ state: 'visible' })

  for (const testCase of cases) {
    await page.emulateMedia({ colorScheme: testCase.scheme })
    const radio = page.locator(`input[name="pit-agent-theme"][value="${testCase.preference}"]`)
    const card = radio.locator('xpath=..')
    await card.click()
    await page.waitForFunction(({ selected, background }) => {
      if (document.documentElement.dataset.theme !== selected) return false
      return !background || getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() === background
    }, { selected: testCase.preference, background: testCase.expectedBackground })
    await page.screenshot({ path: path.join(output, `${testCase.id}.png`), fullPage: false })
    const selected = await radio.isChecked()
    if (!selected) throw new Error(`Appearance radio did not stay selected: ${testCase.preference}`)
    passed += 1
  }

  await app.close()
  app = await launch()
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'system', undefined, { timeout: 30_000 })
  passed += 1
  console.log(`Theme Electron smoke: ${passed}/${cases.length + 2} passed`)
  console.log(`Screenshots: ${output}`)
  console.log('Persistence: explicit System selection survived app restart in isolated userData')
} finally {
  await app.close().catch(() => {})
}

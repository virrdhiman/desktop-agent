import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const output = path.join(root, '.work', 'screens', `contrast-${runId}`)
const userData = path.join(root, '.work', 'contrast-profiles', runId)
const electronPath = createRequire(import.meta.url)('electron')
const themes = [
  { preference: 'pit-brand', id: 'pit-brand-light', scheme: 'light', expectedBackground: '#ffffff' },
  { preference: 'pit-brand', id: 'pit-brand-dark', scheme: 'dark', expectedBackground: '#08111f' },
  { preference: 'system', id: 'system', scheme: 'dark' },
  { preference: 'light', id: 'light', scheme: 'light' },
  { preference: 'dark', id: 'dark', scheme: 'dark' },
  { preference: 'pink-light', id: 'pink-light', scheme: 'light' },
  { preference: 'pink-dark', id: 'pink-dark', scheme: 'dark' },
]
const sourceLogoHashes = Object.fromEntries(['pit-logo.png', 'pit-logo-trimmed.png'].map((name) => {
  const file = path.join(root, 'src', 'assets', name)
  return [name, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]
}))
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

const auditVisibleContrast = `(() => {
  const rgb = (value) => {
    const match = String(value).match(/rgba?\\(([^)]+)\\)/i)
    if (!match) return null
    const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  const over = (front, back) => {
    const alpha = Math.max(0, Math.min(1, front.a))
    return { r: front.r * alpha + back.r * (1 - alpha), g: front.g * alpha + back.g * (1 - alpha), b: front.b * alpha + back.b * (1 - alpha), a: 1 }
  }
  const luminance = (color) => {
    const linear = [color.r, color.g, color.b].map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  }
  const ratio = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
    return (values[0] + 0.05) / (values[1] + 0.05)
  }
  const visible = (element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
  }
  const background = (element) => {
    const chain = []
    for (let node = element; node && node instanceof HTMLElement; node = node.parentElement) chain.push(node)
    let color = rgb(getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()) || { r: 255, g: 255, b: 255, a: 1 }
    let imageBackground = false
    for (const node of chain.reverse()) {
      const style = getComputedStyle(node)
      if (style.backgroundImage !== 'none') imageBackground = true
      const layer = rgb(style.backgroundColor)
      if (layer) color = over(layer, color)
    }
    let opacity = 1
    for (let node = element; node && node instanceof HTMLElement; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity || 1)
    return { color, opacity, imageBackground }
  }
  const failures = []
  const checked = []
  const inspect = (name, foregroundValue, element, threshold, descriptor) => {
    const fg = rgb(foregroundValue)
    const bg = background(element)
    if (!fg) return
    const effectiveFg = over({ ...fg, a: fg.a * bg.opacity }, bg.color)
    const contrast = ratio(effectiveFg, bg.color)
    const record = { theme: document.documentElement.dataset.theme, name, text: descriptor.slice(0, 100), className: typeof element.className === 'string' ? element.className : element.className?.baseVal || '', ancestors: [element.parentElement, element.parentElement?.parentElement].filter(Boolean).map((node) => node.className?.baseVal || node.className || node.tagName.toLowerCase()), foreground: foregroundValue, background: 'rgb(' + Math.round(bg.color.r) + ', ' + Math.round(bg.color.g) + ', ' + Math.round(bg.color.b) + ')', contrast: Number(contrast.toFixed(2)), threshold, opacity: Number(bg.opacity.toFixed(2)), gradient: bg.imageBackground }
    checked.push(record)
    if (contrast + 0.001 < threshold) failures.push(record)
  }
  for (const element of document.querySelectorAll('body *')) {
    if (!visible(element)) continue
    const style = getComputedStyle(element)
    const directText = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent || '').join(' ').trim()
    if (directText) {
      const large = Number.parseFloat(style.fontSize) >= 24 || (Number.parseFloat(style.fontSize) >= 18.66 && Number.parseInt(style.fontWeight || '400') >= 700)
      const icon = /^[\s\p{P}\p{S}\p{Extended_Pictographic}]+$/u.test(directText)
      inspect(element.tagName.toLowerCase(), style.color, element, large || icon ? 3 : 4.5, directText)
    }
    if (element instanceof HTMLInputElement && element.placeholder && visible(element)) {
      inspect('placeholder', getComputedStyle(element, '::placeholder').color, element, 4.5, element.placeholder)
    }
  }
  for (const icon of document.querySelectorAll('svg')) {
    if (!visible(icon)) continue
    const label = icon.getAttribute('aria-label') || icon.getAttribute('title') || icon.className.baseVal || 'svg icon'
    const path = icon.querySelector('path, circle, rect, line, polyline, polygon')
    if (!path || !visible(path)) continue
    const pathStyle = getComputedStyle(path)
    const fill = pathStyle.fill !== 'none' ? pathStyle.fill : pathStyle.stroke
    if (fill && fill !== 'none') inspect('svg-icon', fill, icon, 3, label)
  }
  return { checked, failures, gradientBackgrounds: [...document.querySelectorAll('body *')].filter((element) => visible(element) && getComputedStyle(element).backgroundImage !== 'none').length }
})()`

let app
const results = []
const failures = []
let page

async function audit(theme, surface) {
  const result = await page.evaluate(auditVisibleContrast)
  const label = `${theme}/${surface}`
  results.push({ label, checked: result.checked.length, failures: result.failures })
  for (const issue of result.failures) failures.push({ surface: label, ...issue })
  console.log(`${label}: ${result.checked.length} visible text/icon checks; ${result.failures.length} contrast failures`)
  if (result.failures.length) console.log(JSON.stringify(result.failures, null, 2))
  if (result.gradientBackgrounds) console.log(`${label}: ${result.gradientBackgrounds} visible gradient backgrounds detected`)
  fs.writeFileSync(path.join(output, 'contrast-audit.json'), JSON.stringify({ results, failures }, null, 2))
}

async function waitForTerminalTheme() {
  await page.waitForFunction(() => {
    const sample = [...document.querySelectorAll('.xterm-rows span')]
      .find((element) => element.textContent?.includes('Windows PowerShell'))
    if (!sample) return true
    const probe = document.createElement('span')
    probe.style.color = 'var(--text-primary)'
    document.body.appendChild(probe)
    const expected = getComputedStyle(probe).color
    probe.remove()
    return getComputedStyle(sample).color === expected
  }, undefined, { timeout: 5_000 })
}

async function verifyLoadedLogos() {
  const logos = await page.evaluate(() => [...document.querySelectorAll('img.vd-brand-logo')].map((image) => {
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context || !image.complete || image.naturalWidth === 0) return { src: image.currentSrc, loaded: false }
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let alphaZero = 0
    let nearWhiteOpaque = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) alphaZero += 1
      if (pixels[index] > 240 && pixels[index + 1] > 240 && pixels[index + 2] > 240 && pixels[index + 3] === 255) nearWhiteOpaque += 1
    }
    return { src: image.currentSrc, loaded: true, width: image.naturalWidth, height: image.naturalHeight, alphaZero, nearWhiteOpaque }
  }))
  console.log(`Logo source SHA-256: ${JSON.stringify(sourceLogoHashes)}`)
  console.log(`Resolved logo assets: ${JSON.stringify(logos)}`)
  if (!logos.length || logos.some((logo) => !logo.loaded || logo.nearWhiteOpaque !== 0)) throw new Error('A rendered logo is missing or contains opaque near-white pixels')
}

try {
  app = await launch()
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'pit-brand')
  const skip = page.getByRole('button', { name: /Skip use defaults|Continue to PIT Agent/i })
  if (await skip.count()) await skip.first().click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  const radios = page.locator('input[name="pit-agent-theme"]')
  await radios.first().waitFor({ state: 'attached' })

  for (const [index, testCase] of themes.entries()) {
    await page.emulateMedia({ colorScheme: testCase.scheme })
    const radio = page.locator(`input[name="pit-agent-theme"][value="${testCase.preference}"]`)
    await radio.locator('xpath=..').click()
    await page.waitForFunction(({ selected, background }) => {
      if (document.documentElement.dataset.theme !== selected) return false
      return !background || getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() === background
    }, { selected: testCase.preference, background: testCase.expectedBackground })
    await waitForTerminalTheme()
    await audit(testCase.id, 'settings-appearance')
    if (testCase.id.startsWith('pit-brand-')) await page.screenshot({ path: path.join(output, `${testCase.id}-appearance.png`) })
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    await page.waitForTimeout(150)
    if (index === 0) await verifyLoadedLogos()
    await page.screenshot({ path: path.join(output, `${testCase.id}-agent.png`) })
    await audit(testCase.id, 'agent-and-composer')
    if (['dark', 'pink-dark', 'pit-brand-light', 'pit-brand-dark'].includes(testCase.id)) {
      await page.screenshot({ path: path.join(output, `logo-${testCase.id}.png`) })
    }

    const fileMenu = page.locator('.top-menus').getByRole('menuitem', { name: 'File', exact: true })
    await fileMenu.click()
    await audit(testCase.id, 'file-menu')
    await page.keyboard.press('Escape')

    const modelButton = page.locator('.vd-model-picker-wrap > button')
    await modelButton.click()
    await page.getByRole('dialog', { name: 'Model picker' }).waitFor({ state: 'visible' })
    await audit(testCase.id, 'model-dialog')
    await page.getByRole('button', { name: 'Done', exact: true }).click()

    const addButton = page.getByRole('button', { name: 'Add to chat', exact: true })
    if (await addButton.count()) {
      await addButton.click()
      await page.getByRole('menu', { name: 'Add to chat' }).waitFor({ state: 'visible' })
      await audit(testCase.id, 'composer-menu')
      await page.keyboard.press('Escape')
    }

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await audit(testCase.id, 'settings')
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  }

  fs.writeFileSync(path.join(output, 'contrast-audit.json'), JSON.stringify({ results, failures }, null, 2))
  console.log(`Theme contrast e2e: ${failures.length ? 'FAIL' : 'PASS'}; ${results.reduce((sum, item) => sum + item.checked, 0)} rendered contrast checks`)
  console.log(`Screenshots and audit: ${output}`)
  if (failures.length) {
    console.error(JSON.stringify(failures.slice(0, 80), null, 2))
    process.exitCode = 1
  }
} finally {
  await app?.close().catch(() => {})
}

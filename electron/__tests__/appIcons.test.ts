import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const mainSource = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function filesUnder(directory: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(fullPath) : [fullPath]
  })
}

function pngSize(filePath: string): [number, number] {
  const png = fs.readFileSync(filePath)
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return [png.readUInt32BE(16), png.readUInt32BE(20)]
}

describe('PIT Agent application icons', () => {
  it('does not reference React or Vite starter SVG icons from the page or public assets', () => {
    const files = [path.join(root, 'index.html'), ...filesUnder(path.join(root, 'public'))]
      .filter((file) => /\.(?:html|js|jsx|ts|tsx|mjs|cjs|css|json|svg)$/i.test(file))
    for (const file of files) {
      expect(fs.readFileSync(file, 'utf8'), path.relative(root, file)).not.toMatch(/(?:react|vite)\.svg/i)
    }
  })

  it('serves the PIT gears favicon at 32 and 64 pixels and the multi-size ICO', () => {
    const publicDir = path.join(root, 'public')
    expect(pngSize(path.join(publicDir, 'favicon-32.png'))).toEqual([32, 32])
    expect(pngSize(path.join(publicDir, 'favicon-64.png'))).toEqual([64, 64])
    const ico = fs.readFileSync(path.join(publicDir, 'favicon.ico'))
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(7)

    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    expect(html).toContain('href="/favicon-32.png"')
    expect(html).toContain('href="/favicon-64.png"')
    expect(html).toContain('href="/favicon.ico"')
  })

  it('creates both BrowserWindows with the platform icon and registers the existing Windows app id', () => {
    expect(mainSource.match(/const icon = resolveWindowIcon\(\)/g)).toHaveLength(2)
    expect(mainSource.match(/^\s+icon,\s*$/gm)).toHaveLength(2)
    expect(mainSource).toContain("process.platform === 'win32' ? 'icon.ico' : 'icon.png'")
    expect(mainSource).toContain('Required PIT Agent window icon not found')
    expect(mainSource).toContain(`const APP_USER_MODEL_ID = '${packageJson.build.appId}'`)
    expect(mainSource).toContain('app.setAppUserModelId(APP_USER_MODEL_ID)')
    expect(mainSource.indexOf('app.setAppUserModelId(APP_USER_MODEL_ID)')).toBeLessThan(mainSource.indexOf('app.whenReady()'))
  })

  it('uses the PIT ICO for the Windows installer, uninstaller, app and portable target shortcuts', () => {
    const build = packageJson.build
    expect(fs.existsSync(path.join(root, 'build/icon.ico'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'build/icon.png'))).toBe(true)
    expect(build.win.icon).toBe('build/icon.ico')
    expect(build.win.signAndEditExecutable).not.toBe(false)
    expect(build.win.signExecutable).toBe(false)
    expect(build.win.target).toContain('portable')
    expect(build.nsis.installerIcon).toBe('build/icon.ico')
    expect(build.nsis.uninstallerIcon).toBe('build/icon.ico')
    expect(build.nsis.createDesktopShortcut).toBe(true)
    expect(build.nsis.createStartMenuShortcut).toBe(true)
    expect(build.nsis.shortcutName).toBe('PIT Agent')
  })
})

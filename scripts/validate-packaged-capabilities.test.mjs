import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { createPackage } from '@electron/asar'
import yazl from 'yazl'
import { describe, expect, it } from 'vitest'
import { parseArguments, validatePackagedCapabilities } from './validate-packaged-capabilities.mjs'

function fixtureDirectory() {
  // Deliberately leave fixtures in the system temp directory. The test suite
  // must not delete user files or rely on cleanup commands.
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vd-agent-packaged-capabilities-'))
}

async function createFixture({ mutateVsix = false, mutateOcr = false, missing = [], withoutMarkers = [], empty = [], vsixFiles = null, vsixName = 'vd-agent-vscode-bridge-0.4.7.vsix', ocrSize = null } = {}) {
  const root = fixtureDirectory()
  const resources = path.join(root, 'resources')
  const appFiles = path.join(root, 'app-files')
  const sourceVsix = path.join(root, 'source-bridge.vsix')
  const sourceOcr = path.join(root, 'eng.traineddata')
  fs.mkdirSync(resources, { recursive: true })
  fs.mkdirSync(appFiles, { recursive: true })
  const zip = new yazl.ZipFile()
  for (const [name, content] of Object.entries(vsixFiles || {
    'extension/package.json': JSON.stringify({ name: 'vd-agent-vscode-bridge', version: '0.4.7', main: './extension.js' }),
    'extension/extension.js': 'function activate() { rebuildIndex() } function rebuildIndex() {} exports.activate = activate',
    'extension/inlineCompletionCore.js': 'exports.complete = () => {}',
    'extension/previewDiff.js': 'exports.diff = () => {}',
  })) zip.addBuffer(Buffer.from(content), name)
  zip.end()
  await new Promise((resolve, reject) => zip.outputStream.pipe(fs.createWriteStream(sourceVsix)).on('close', resolve).on('error', reject))
  fs.writeFileSync(path.join(resources, vsixName), mutateVsix ? Buffer.from('different-bytes') : fs.readFileSync(sourceVsix))
  fs.writeFileSync(sourceOcr, Buffer.from('english-ocr-source-bytes'))
  const ocrHash = crypto.createHash('sha256').update(fs.readFileSync(sourceOcr)).digest('hex')
  const ocrManifest = JSON.stringify({ sha256: ocrHash, size: ocrSize ?? fs.statSync(sourceOcr).size, licenseFile: 'LICENSE.apache-2.0.txt' }, null, 2)
  fs.writeFileSync(path.join(root, 'manifest.json'), ocrManifest)
  fs.writeFileSync(path.join(root, 'LICENSE.apache-2.0.txt'), 'Apache License 2.0 fixture')
  if (!missing.includes('tessdata/eng.traineddata')) {
    fs.mkdirSync(path.join(resources, 'tessdata'), { recursive: true })
    fs.writeFileSync(path.join(resources, 'tessdata', 'eng.traineddata'), mutateOcr ? Buffer.from('different-ocr-bytes') : fs.readFileSync(sourceOcr))
  }
  fs.writeFileSync(path.join(resources, 'tessdata', 'manifest.json'), ocrManifest)
  fs.writeFileSync(path.join(resources, 'tessdata', 'LICENSE.apache-2.0.txt'), 'Apache License 2.0 fixture')

  const files = {
    'dist-electron/main.js': `case "repo_index": case "ocr_image": "sqliteToolEnabled" "postgresToolEnabled" "spreadsheetToolEnabled" "dataWriteEnabled" "pdfToolEnabled" "ocrToolEnabled" "vscode:installBridge" "updates:check" "lsp:definition" "tesseract.js" "typescript" "ollama:models" "ollama:pullSmallModel" "indexingEnabled" "updateChannel" "${vsixName}"`,
    'dist-electron/preload.cjs': '"tool:execute" "vscode:installBridge" "updates:check" "lsp:definition" "ollama:models" "ollama:pullSmallModel"',
    'dist/index.html': '<html><script src="/assets/index-test.js"></script></html>',
    'dist/assets/index-test.js': '"sqliteToolEnabled" "postgresToolEnabled" "spreadsheetToolEnabled" "dataWriteEnabled" "pdfToolEnabled" "ocrToolEnabled" "autoUpdate" "autocompleteEnabled" "indexingEnabled" "telemetryEnabled" "updateChannel" "Skip use defaults" "repo_index" "vscodeInstallBridge"',
    'dist/assets/monacoEditor-test.js': 'editor',
    'dist/assets/editor.worker-test.js': 'worker',
    'node_modules/node-pty/package.json': '{}',
    'node_modules/electron-updater/package.json': '{}',
    'node_modules/electron-updater/out/main.js': 'updater',
    'node_modules/electron-updater/out/NsisUpdater.js': 'nsis updater',
    'node_modules/electron-updater/out/AppImageUpdater.js': 'appimage updater',
    'node_modules/electron-updater/out/DebUpdater.js': 'deb updater',
    'node_modules/typescript/package.json': '{"main":"./lib/typescript.js"}',
    'node_modules/typescript/lib/typescript.js': 'language service',
    'node_modules/tesseract.js/package.json': '{"main":"src/index.js"}',
    'node_modules/tesseract.js/src/index.js': 'ocr entry',
    'node_modules/tesseract.js/src/worker-script/node/index.js': 'ocr worker',
    'node_modules/tesseract.js-core/package.json': '{}',
    'node_modules/tesseract.js-core/tesseract-core.wasm': 'wasm',
  }
  for (const [relative, content] of Object.entries(files)) {
    if (missing.includes(relative)) continue
    const target = path.join(appFiles, ...relative.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, empty.includes(relative) ? '' : withoutMarkers.includes(relative) ? 'stub' : content)
  }
  await createPackage(appFiles, path.join(resources, 'app.asar'))
  const nativeFiles = {
    'node_modules/node-pty/prebuilds/linux-x64/pty.node': 'pty',
    'node_modules/node-pty/prebuilds/linux-x64/spawn-helper': 'helper',
    'node_modules/node-pty/prebuilds/win32-x64/pty.node': 'pty',
  }
  for (const [relative, content] of Object.entries(nativeFiles)) {
    if (missing.includes(relative)) continue
    const target = path.join(resources, 'app.asar.unpacked', ...relative.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  return { root, resources, sourceVsix, sourceOcr }
}

function options(fixture, platform = 'linux') {
  return {
    resourcesPath: fixture.resources,
    sourceVsixPath: fixture.sourceVsix,
    packagedVsixPath: 'vd-agent-vscode-bridge-0.4.7.vsix',
    sourceOcrPath: fixture.sourceOcr,
    packagedOcrPath: 'tessdata/eng.traineddata',
    platform,
    arch: 'x64',
  }
}

describe('packaged capability validation', () => {
  it('requires an explicit repository-relative resources argument', () => {
    expect(() => parseArguments([])).toThrow('--resources')
    expect(() => parseArguments(['--resources', path.resolve('absolute/resources')])).toThrow('--resources')
    expect(parseArguments(['--resources', 'release/linux-unpacked/resources'])).toEqual({
      resourcesPath: 'release/linux-unpacked/resources',
    })
    expect(parseArguments([
      '--resources', 'release/mac-unpacked/resources',
      '--platform', 'macos',
      '--arch', 'arm64',
    ])).toMatchObject({
      resourcesPath: 'release/mac-unpacked/resources',
      platform: 'darwin',
      arch: 'arm64',
    })
  })

  it.each(['linux', 'win32'])('passes complete synthetic %s resources and matches VSIX bytes exactly', async (platform) => {
    const fixture = await createFixture()
    const result = await validatePackagedCapabilities(options(fixture, platform))
    expect(result.ok, JSON.stringify(result.failures)).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.results.map((item) => item.label)).toContain('bridge VSIX exact byte match')
    expect(result.results.map((item) => item.label)).toContain('English OCR exact byte match')
    expect(result.results.map((item) => item.label)).toContain('English OCR pinned SHA-256')
    expect(result.results.map((item) => item.label)).toContain('English OCR license exact byte match')
    expect(result.results.map((item) => item.label)).toContain('packaged feature flags')
  })

  it('fails a changed VSIX and every missing runtime asset', async () => {
    const fixture = await createFixture({
      mutateVsix: true,
      mutateOcr: true,
      missing: [
        'dist-electron/preload.cjs',
        'dist/assets/monacoEditor-test.js',
        'node_modules/node-pty/prebuilds/linux-x64/pty.node',
        'node_modules/electron-updater/out/main.js',
      ],
    })
    const result = await validatePackagedCapabilities(options(fixture))
    expect(result.ok).toBe(false)
    expect(result.failures.map((item) => item.label)).toEqual(expect.arrayContaining([
      'bridge VSIX exact byte match',
      'English OCR exact byte match',
      'built preload',
      'built editor bundle',
      'node-pty native runtime',
      'electron-updater runtime',
    ]))
  })

  it('accepts the compiled Linux node-pty fallback without a macOS-only spawn-helper', async () => {
    const fixture = await createFixture({ missing: ['node_modules/node-pty/prebuilds/linux-x64/spawn-helper'] })
    const result = await validatePackagedCapabilities(options(fixture, 'linux'))
    expect(result.ok, JSON.stringify(result.failures)).toBe(true)
  })

  it('fails when the built feature bundles or flags are stubs despite existing filenames', async () => {
    const fixture = await createFixture({ withoutMarkers: ['dist-electron/main.js', 'dist-electron/preload.cjs', 'dist/assets/index-test.js'] })
    const result = await validatePackagedCapabilities(options(fixture))
    expect(result.failures.map((item) => item.label)).toEqual(expect.arrayContaining([
      'packaged main feature handlers', 'packaged preload feature bridge', 'packaged feature flags',
    ]))
  })

  it.each(['linux', 'win32'])('fails missing indexer, OCR worker/core, and %s updater implementation', async (platform) => {
    const fixture = await createFixture({ missing: [
      'node_modules/typescript/lib/typescript.js', 'node_modules/tesseract.js/src/worker-script/node/index.js',
      'node_modules/tesseract.js-core/tesseract-core.wasm',
      `node_modules/electron-updater/out/${platform === 'linux' ? 'AppImage' : 'Nsis'}Updater.js`,
    ] })
    const result = await validatePackagedCapabilities(options(fixture, platform))
    expect(result.failures.map((item) => item.label)).toEqual(expect.arrayContaining([
      'TypeScript indexer runtime', 'offline OCR worker', 'offline OCR WASM runtime', 'platform updater runtime',
    ]))
  })

  it('fails when a byte-matching VSIX lacks the extension entry or its feature bundle', async () => {
    const fixture = await createFixture({ vsixFiles: { 'extension/package.json': JSON.stringify({ name: 'vd-agent-vscode-bridge', version: '0.4.7', main: './extension.js' }) } })
    const result = await validatePackagedCapabilities(options(fixture))
    expect(result.failures.map((item) => item.label)).toContain('bridge VSIX functional bundle')
  })

  it('fails when the built bridge looks for a different VSIX filename', async () => {
    const fixture = await createFixture({ vsixName: 'vd-agent-vscode-bridge-0.4.6.vsix' })
    const result = await validatePackagedCapabilities(options(fixture))
    expect(result.failures.map((item) => item.label)).toContain('bridge VSIX runtime path')
  })

  it('fails missing OCR manifest and license extraResources config, even if their files exist', async () => {
    const fixture = await createFixture()
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    pkg.build.extraResources = pkg.build.extraResources.filter(({ to }) => !['tessdata/manifest.json', 'tessdata/LICENSE.apache-2.0.txt'].includes(to))
    const packageJsonPath = path.join(fixture.root, 'package.json')
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg))
    const result = await validatePackagedCapabilities({ ...options(fixture), packageJsonPath })
    expect(result.failures.map((item) => item.label)).toEqual(expect.arrayContaining([
      'English OCR manifest configuration', 'English OCR license configuration',
    ]))
  })

  it('fails a missing VSIX or OCR resource mapping even with fixture path overrides', async () => {
    const fixture = await createFixture()
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    pkg.build.extraResources = pkg.build.extraResources.filter(({ to }) => !/\.vsix$|eng\.traineddata$/.test(to))
    const packageJsonPath = path.join(fixture.root, 'package.json')
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg))
    const result = await validatePackagedCapabilities({ ...options(fixture), packageJsonPath })
    expect(result.failures.map((item) => item.label)).toEqual(expect.arrayContaining([
      'bridge VSIX configuration', 'English OCR configuration',
    ]))
  })

  it.each(['win32', 'linux'])('fails when a %s distribution target is not configured', async (platform) => {
    const fixture = await createFixture()
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    pkg.build[platform === 'win32' ? 'win' : 'linux'].target = []
    const packageJsonPath = path.join(fixture.root, 'package.json')
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg))
    const result = await validatePackagedCapabilities({ ...options(fixture, platform), packageJsonPath })
    expect(result.failures.map((item) => item.label)).toContain('packaged target parity')
  })

  it('fails empty files inside app.asar and a manifest with the wrong OCR size', async () => {
    const fixture = await createFixture({ empty: ['node_modules/typescript/lib/typescript.js'], ocrSize: 1 })
    const result = await validatePackagedCapabilities(options(fixture))
    expect(result.failures.map((item) => item.label)).toEqual(expect.arrayContaining([
      'TypeScript indexer runtime', 'English OCR pinned size',
    ]))
  })

  it('fails a corrupt VSIX archive even when the source and packaged bytes match', async () => {
    const fixture = await createFixture()
    fs.writeFileSync(fixture.sourceVsix, 'not a zip')
    fs.writeFileSync(path.join(fixture.resources, 'vd-agent-vscode-bridge-0.4.7.vsix'), 'not a zip')
    const result = await validatePackagedCapabilities(options(fixture))
    expect(result.failures.map((item) => item.label)).toContain('bridge VSIX functional bundle')
  })
})

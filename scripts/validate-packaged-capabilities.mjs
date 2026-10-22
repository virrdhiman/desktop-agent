/**
 * Validate the capabilities that must survive Electron packaging.
 *
 * The command intentionally takes an explicit, repository-relative resources
 * directory. It does not discover an installer, run the app, or infer that a
 * host application is bundled.
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yauzl from 'yauzl'

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(scriptPath), '..')
const require = createRequire(import.meta.url)
const dataFeatureFlags = ['sqliteToolEnabled', 'postgresToolEnabled', 'spreadsheetToolEnabled', 'dataWriteEnabled', 'pdfToolEnabled', 'ocrToolEnabled']

function normalizeArchivePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\/+/, '')
}

function isNonEmptyFile(file) {
  try {
    return fs.statSync(file).isFile() && fs.statSync(file).size > 0
  } catch {
    return false
  }
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}

function addResult(results, level, label, detail = '') {
  results.push({ level, label, detail })
}

function findVsixResource(packageJson) {
  const resources = Array.isArray(packageJson?.build?.extraResources)
    ? packageJson.build.extraResources
    : []
  return resources.find((resource) => (
    typeof resource?.from === 'string'
    && typeof resource?.to === 'string'
    && /\.vsix$/i.test(resource.to)
  ))
}

function findOcrResource(packageJson) {
  const resources = Array.isArray(packageJson?.build?.extraResources)
    ? packageJson.build.extraResources
    : []
  return resources.find((resource) => (
    typeof resource?.from === 'string'
    && typeof resource?.to === 'string'
    && /(?:^|\/)eng\.traineddata$/i.test(normalizeArchivePath(resource.to))
  ))
}

function configuredResource(packageJson, target) {
  const resources = packageJson?.build?.extraResources
  return (Array.isArray(resources) ? resources : []).find((item) => (
    typeof item?.from === 'string' && normalizeArchivePath(item.to) === target
  ))
}

function checkExactResource(results, {
  configurationLabel,
  matchLabel,
  configured,
  sourcePath,
  packagedPath,
  resources,
}) {
  if (!configured) {
    addResult(results, 'FAIL', configurationLabel, `No ${configurationLabel.toLowerCase()} is configured in package.json`)
  }
  if (!sourcePath || !packagedPath) return
  if (!isNonEmptyFile(sourcePath)) {
    addResult(results, 'FAIL', `${configurationLabel} source`, `${sourcePath} is missing or empty`)
    return
  }
  if (!isNonEmptyFile(packagedPath)) {
    addResult(results, 'FAIL', `${configurationLabel} packaged resource`, `${relativePath(resources, packagedPath)} is missing or empty`)
    return
  }
  if (fs.readFileSync(sourcePath).equals(fs.readFileSync(packagedPath))) {
    addResult(results, 'PASS', matchLabel, `${relativePath(resources, packagedPath)} matches ${relativePath(repoRoot, sourcePath)}`)
  } else {
    addResult(results, 'FAIL', matchLabel, `${relativePath(resources, packagedPath)} differs from ${relativePath(repoRoot, sourcePath)}`)
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function readPackageJson(packageJsonPath) {
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  } catch {
    return null
  }
}

async function loadAsar() {
  try {
    const resolved = require.resolve('@electron/asar')
    const module = await import(pathToFileURL(resolved).href)
    return module.default || module
  } catch {
    return null
  }
}

async function readAsarEntries(asarPath, asar = null) {
  if (!isNonEmptyFile(asarPath)) return null
  const implementation = asar || await loadAsar()
  if (!implementation || typeof implementation.listPackage !== 'function') return null
  try {
    const entries = await implementation.listPackage(asarPath)
    return new Set(entries.map(normalizeArchivePath))
  } catch {
    return null
  }
}

function hasEntry(entries, expected) {
  return entries.has(normalizeArchivePath(expected))
}

function hasEntryMatching(entries, matcher) {
  for (const entry of entries) if (matcher(entry)) return entry
  return null
}

function readRuntimeBuffer(entries, resourcesPath, asarPath, asar, relative) {
  const unpacked = findUnpackedFile(resourcesPath, relative)
  if (unpacked) return fs.readFileSync(unpacked)
  if (!hasEntry(entries, relative)) return null
  try { return asar.extractFile(asarPath, path.join(...relative.split('/'))) } catch { return null }
}

function readRuntimeEntry(entries, resourcesPath, asarPath, asar, relative) {
  return readRuntimeBuffer(entries, resourcesPath, asarPath, asar, relative)?.toString('utf8') || ''
}

function checkMarkers(results, label, content, markers, location) {
  const missing = markers.filter((marker) => !content.includes(marker))
  addResult(results, missing.length ? 'FAIL' : 'PASS', label,
    missing.length ? `${location} lacks ${missing.join(', ')}` : location)
}

async function checkVsixBundle(results, packagedVsix) {
  const label = 'bridge VSIX functional bundle'
  if (!isNonEmptyFile(packagedVsix)) return
  try {
    const files = await new Promise((resolve, reject) => {
      yauzl.open(packagedVsix, { lazyEntries: true }, (error, zip) => {
        if (error) return reject(error)
        const entries = new Map()
        zip.on('error', reject)
        zip.on('entry', (entry) => {
          entries.set(entry.fileName, entry.uncompressedSize)
          zip.readEntry()
        })
        zip.on('end', () => resolve(entries))
        zip.readEntry()
      })
    })
    const required = ['extension/package.json', 'extension/extension.js', 'extension/inlineCompletionCore.js', 'extension/previewDiff.js']
    const missing = required.filter((name) => !files.get(name))
    addResult(results, missing.length ? 'FAIL' : 'PASS', label,
      missing.length ? `Missing non-empty VSIX entries: ${missing.join(', ')}` : 'VS Code bridge manifest, entry point and feature modules are present')
  } catch (error) {
    addResult(results, 'FAIL', label, `Cannot inspect VSIX ZIP: ${error.message}`)
  }
}

function normalizePlatform(value) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'win' || normalized === 'windows' || normalized === 'win32') return 'win32'
  if (normalized === 'mac' || normalized === 'macos' || normalized === 'darwin') return 'darwin'
  if (normalized === 'linux' || normalized === 'ubuntu') return 'linux'
  throw new Error(`Unsupported package platform: ${value}`)
}

function findUnpackedFile(resourcesPath, relative) {
  const candidate = path.join(resourcesPath, 'app.asar.unpacked', ...relative.split('/'))
  return isNonEmptyFile(candidate) ? candidate : null
}

function hasRuntimeFile(entries, resourcesPath, relative, asar) {
  return Boolean(findUnpackedFile(resourcesPath, relative))
    || Boolean(readRuntimeBuffer(entries, resourcesPath, path.join(resourcesPath, 'app.asar'), asar, relative)?.length)
}

function checkRequiredEntry(results, entries, resourcesPath, relative, label = relative, asar) {
  if (readRuntimeBuffer(entries, resourcesPath, path.join(resourcesPath, 'app.asar'), asar, relative)?.length) {
    addResult(results, 'PASS', label, relative)
  } else {
    addResult(results, 'FAIL', label, `Missing or empty ${relative} in app.asar or app.asar.unpacked`)
  }
}

function checkNodePty(results, entries, resourcesPath, platform, arch, asar) {
  checkRequiredEntry(results, entries, resourcesPath, 'node_modules/node-pty/package.json', 'node-pty package', asar)

  const target = `${platform}-${arch}`
  const ptyRelative = `node_modules/node-pty/prebuilds/${target}/pty.node`
  const releaseRelative = 'node_modules/node-pty/build/Release/pty.node'
  const ptyPath = hasRuntimeFile(entries, resourcesPath, ptyRelative, asar)
    ? ptyRelative
    : hasRuntimeFile(entries, resourcesPath, releaseRelative, asar)
      ? releaseRelative
      : null
  if (ptyPath) addResult(results, 'PASS', 'node-pty native runtime', ptyPath)
  else addResult(results, 'FAIL', 'node-pty native runtime', `Missing ${ptyRelative} or ${releaseRelative}`)

  // node-pty's macOS posix_spawn path executes spawn-helper. Its Linux
  // forkpty path does not (node-pty/src/unix/pty.cc), and source builds on
  // Linux legitimately contain only build/Release/pty.node.
  if (platform === 'darwin') {
    const helperRelative = `node_modules/node-pty/prebuilds/${target}/spawn-helper`
    const helperPath = hasRuntimeFile(entries, resourcesPath, helperRelative, asar)
      ? helperRelative
      : null
    if (helperPath) addResult(results, 'PASS', 'node-pty spawn helper', helperPath)
    else addResult(results, 'FAIL', 'node-pty spawn helper', `Missing ${helperRelative}`)
  }
}

/**
 * Validate one unpacked Electron resources directory.
 *
 * Absolute paths are accepted by this function to make fixture tests isolated;
 * the CLI rejects absolute --resources values and resolves them from repoRoot.
 */
export async function validatePackagedCapabilities({
  resourcesPath,
  sourceVsixPath,
  packagedVsixPath,
  sourceOcrPath,
  packagedOcrPath,
  packageJsonPath = path.join(repoRoot, 'package.json'),
  platform = process.platform,
  arch = process.arch,
  asar = null,
} = {}) {
  const results = []
  const resources = path.resolve(resourcesPath || '')
  let normalizedPlatform
  try {
    normalizedPlatform = normalizePlatform(platform)
  } catch (error) {
    addResult(results, 'FAIL', 'package platform', error.message)
    return { ok: false, results, failures: results }
  }

  if (!resourcesPath) {
    addResult(results, 'FAIL', 'resources path', 'An unpacked resources path is required')
    return { ok: false, results, failures: results }
  }

  if (!fs.existsSync(resources)) {
    addResult(results, 'FAIL', 'resources path', `${resources} does not exist`)
    return { ok: false, results, failures: results }
  }
  addResult(results, 'PASS', 'resources path', resources)

  const packageJson = readPackageJson(packageJsonPath)
  const targets = normalizedPlatform === 'win32' ? ['nsis', 'portable'] : normalizedPlatform === 'linux' ? ['appimage', 'deb'] : []
  if (targets.length) {
    const configuredTargets = packageJson?.build?.[normalizedPlatform === 'win32' ? 'win' : 'linux']?.target
    const present = Array.isArray(configuredTargets) ? configuredTargets.map((target) => String(target).toLowerCase()) : []
    const missing = targets.filter((target) => !present.includes(target))
    addResult(results, missing.length ? 'FAIL' : 'PASS', 'packaged target parity',
      missing.length ? `Missing build targets: ${missing.join(', ')}` : targets.join(', '))
  }
  const configuredVsix = findVsixResource(packageJson)
  const source = path.resolve(sourceVsixPath || (configuredVsix?.from ? path.resolve(repoRoot, configuredVsix.from) : ''))
  const targetName = packagedVsixPath || configuredVsix?.to
  const packaged = targetName ? path.join(resources, ...normalizeArchivePath(targetName).split('/')) : ''
  checkExactResource(results, {
    configurationLabel: 'bridge VSIX configuration',
    matchLabel: 'bridge VSIX exact byte match',
    configured: configuredVsix,
    sourcePath: source,
    packagedPath: packaged,
    resources,
  })
  await checkVsixBundle(results, packaged)

  const configuredOcr = findOcrResource(packageJson)
  const ocrSource = path.resolve(sourceOcrPath || (configuredOcr?.from ? path.resolve(repoRoot, configuredOcr.from) : ''))
  const ocrTargetName = packagedOcrPath || configuredOcr?.to
  const packagedOcr = ocrTargetName ? path.join(resources, ...normalizeArchivePath(ocrTargetName).split('/')) : ''
  checkExactResource(results, {
    configurationLabel: 'English OCR configuration',
    matchLabel: 'English OCR exact byte match',
    configured: configuredOcr,
    sourcePath: ocrSource,
    packagedPath: packagedOcr,
    resources,
  })
  const ocrManifestSource = path.join(path.dirname(ocrSource), 'manifest.json')
  const ocrManifestPackaged = path.join(path.dirname(packagedOcr), 'manifest.json')
  for (const [target, label] of [
    ['tessdata/manifest.json', 'English OCR manifest configuration'],
    ['tessdata/LICENSE.apache-2.0.txt', 'English OCR license configuration'],
  ]) {
    if (!configuredResource(packageJson, target)) addResult(results, 'FAIL', label, `Missing ${target} in build.extraResources`)
  }
  checkExactResource(results, {
    configurationLabel: 'English OCR manifest',
    matchLabel: 'English OCR manifest exact byte match',
    configured: true,
    sourcePath: ocrManifestSource,
    packagedPath: ocrManifestPackaged,
    resources,
  })
  let ocrManifest
  try { ocrManifest = JSON.parse(fs.readFileSync(ocrManifestSource, 'utf8')) } catch {}
  if (!ocrManifest || !/^[a-f0-9]{64}$/i.test(ocrManifest.sha256 || '')) {
    addResult(results, 'FAIL', 'English OCR pinned SHA-256', `${relativePath(repoRoot, ocrManifestSource)} is missing a valid sha256`)
  } else if (!isNonEmptyFile(ocrSource) || !isNonEmptyFile(packagedOcr)) {
    addResult(results, 'FAIL', 'English OCR pinned SHA-256', 'Source or packaged OCR data is missing')
  } else {
    const expectedHash = String(ocrManifest.sha256).toLowerCase()
    const sourceHash = sha256(ocrSource)
    const packagedHash = sha256(packagedOcr)
    if (sourceHash === expectedHash && packagedHash === expectedHash) {
      addResult(results, 'PASS', 'English OCR pinned SHA-256', expectedHash)
    } else {
      addResult(results, 'FAIL', 'English OCR pinned SHA-256', `expected ${expectedHash}; source ${sourceHash}; packaged ${packagedHash}`)
    }
  }
  const ocrLicenseName = 'LICENSE.apache-2.0.txt'
  if (ocrManifest?.licenseFile !== ocrLicenseName) {
    addResult(results, 'FAIL', 'English OCR license manifest', `Expected licenseFile ${ocrLicenseName}`)
  }
  if (ocrManifest) {
    const sourceSize = isNonEmptyFile(ocrSource) ? fs.statSync(ocrSource).size : null
    const packagedSize = isNonEmptyFile(packagedOcr) ? fs.statSync(packagedOcr).size : null
    const expectedSize = Number(ocrManifest.size)
    addResult(results, expectedSize > 0 && sourceSize === expectedSize && packagedSize === expectedSize ? 'PASS' : 'FAIL',
      'English OCR pinned size', `expected ${ocrManifest.size}; source ${sourceSize ?? 'missing'}; packaged ${packagedSize ?? 'missing'}`)
  }
  checkExactResource(results, {
    configurationLabel: 'English OCR Apache-2.0 license',
    matchLabel: 'English OCR license exact byte match',
    configured: true,
    sourcePath: path.join(path.dirname(ocrSource), ocrLicenseName),
    packagedPath: path.join(path.dirname(packagedOcr), ocrLicenseName),
    resources,
  })

  const asarPath = path.join(resources, 'app.asar')
  const entries = await readAsarEntries(asarPath, asar)
  if (!entries) {
    addResult(results, 'FAIL', 'app.asar inspection', '@electron/asar is unavailable or app.asar is missing/empty')
    return { ok: false, results, failures: results.filter((item) => item.level === 'FAIL') }
  }
  addResult(results, 'PASS', 'app.asar inspection', `${entries.size} archive entries`)

  const asarImplementation = asar || await loadAsar()
  const main = readRuntimeEntry(entries, resources, asarPath, asarImplementation, 'dist-electron/main.js')
  const preload = readRuntimeEntry(entries, resources, asarPath, asarImplementation, 'dist-electron/preload.cjs')
  const renderer = hasEntryMatching(entries, (entry) => /^dist\/assets\/index-[^/]+\.js$/i.test(entry))
  const rendererContent = renderer ? readRuntimeEntry(entries, resources, asarPath, asarImplementation, renderer) : ''
  checkMarkers(results, 'packaged main feature handlers', main,
    ['repo_index', 'ocr_image', 'ocrToolEnabled', 'vscode:installBridge', 'updates:check', 'lsp:definition', 'tesseract.js', 'typescript', 'ollama:models', 'ollama:pullSmallModel', 'indexingEnabled', 'updateChannel'],
    'dist-electron/main.js')
  checkMarkers(results, 'packaged preload feature bridge', preload,
    ['tool:execute', 'vscode:installBridge', 'updates:check', 'lsp:definition', 'ollama:models', 'ollama:pullSmallModel'], 'dist-electron/preload.cjs')
  checkMarkers(results, 'packaged feature flags', rendererContent,
    [...dataFeatureFlags, 'autoUpdate', 'autocompleteEnabled', 'indexingEnabled', 'telemetryEnabled', 'updateChannel', 'Skip use defaults'], renderer || 'dist/assets/index-*.js')
  const runtimeVsixName = /vd-agent-vscode-bridge-[^/"'\\\s]+\.vsix/i.exec(main)?.[0]
  if (runtimeVsixName && path.basename(packaged) !== runtimeVsixName) {
    addResult(results, 'FAIL', 'bridge VSIX runtime path', `Built main expects ${runtimeVsixName}; packaged resource is ${path.basename(packaged)}`)
  } else if (!runtimeVsixName) {
    addResult(results, 'FAIL', 'bridge VSIX runtime path', 'Built main does not reference a vd-agent-vscode-bridge-*.vsix resource')
  } else addResult(results, 'PASS', 'bridge VSIX runtime path', runtimeVsixName)

  checkRequiredEntry(results, entries, resources, 'dist-electron/main.js', 'built main process', asarImplementation)
  checkRequiredEntry(results, entries, resources, 'dist-electron/preload.cjs', 'built preload', asarImplementation)
  checkRequiredEntry(results, entries, resources, 'dist/index.html', 'built renderer entry', asarImplementation)
  const editorBundle = hasEntryMatching(entries, (entry) => /^dist\/assets\/monacoEditor-[^/]+\.js$/i.test(entry))
  if (editorBundle) addResult(results, 'PASS', 'built editor bundle', editorBundle)
  else addResult(results, 'FAIL', 'built editor bundle', 'Missing dist/assets/monacoEditor-*.js')
  const editorWorker = hasEntryMatching(entries, (entry) => /^dist\/assets\/editor\.worker-[^/]+\.js$/i.test(entry))
  if (editorWorker) addResult(results, 'PASS', 'built editor worker', editorWorker)
  else addResult(results, 'FAIL', 'built editor worker', 'Missing dist/assets/editor.worker-*.js')

  checkNodePty(results, entries, resources, normalizedPlatform, arch, asarImplementation)
  checkRequiredEntry(results, entries, resources, 'node_modules/electron-updater/package.json', 'electron-updater package', asarImplementation)
  checkRequiredEntry(results, entries, resources, 'node_modules/electron-updater/out/main.js', 'electron-updater runtime', asarImplementation)
  checkRequiredEntry(results, entries, resources,
    `node_modules/electron-updater/out/${normalizedPlatform === 'win32' ? 'Nsis' : normalizedPlatform === 'linux' ? 'AppImage' : 'Mac'}Updater.js`,
    'platform updater runtime', asarImplementation)
  if (normalizedPlatform === 'linux') checkRequiredEntry(results, entries, resources, 'node_modules/electron-updater/out/DebUpdater.js', 'DEB updater runtime', asarImplementation)
  checkRequiredEntry(results, entries, resources, 'node_modules/typescript/package.json', 'TypeScript indexer package', asarImplementation)
  checkRequiredEntry(results, entries, resources, 'node_modules/typescript/lib/typescript.js', 'TypeScript indexer runtime', asarImplementation)
  checkRequiredEntry(results, entries, resources, 'node_modules/tesseract.js/package.json', 'offline OCR package', asarImplementation)
  checkRequiredEntry(results, entries, resources, 'node_modules/tesseract.js/src/index.js', 'offline OCR runtime', asarImplementation)
  checkRequiredEntry(results, entries, resources, 'node_modules/tesseract.js/src/worker-script/node/index.js', 'offline OCR worker', asarImplementation)
  checkRequiredEntry(results, entries, resources, 'node_modules/tesseract.js-core/tesseract-core.wasm', 'offline OCR WASM runtime', asarImplementation)

  const failures = results.filter((item) => item.level === 'FAIL')
  return { ok: failures.length === 0, results, failures }
}

export function parseArguments(argv) {
  const args = [...argv]
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--resources') options.resourcesPath = args[++index]
    else if (arg.startsWith('--resources=')) options.resourcesPath = arg.slice('--resources='.length)
    else if (arg === '--platform') options.platform = args[++index]
    else if (arg.startsWith('--platform=')) options.platform = arg.slice('--platform='.length)
    else if (arg === '--arch') options.arch = args[++index]
    else if (arg.startsWith('--arch=')) options.arch = arg.slice('--arch='.length)
    else if (arg === '--source-vsix') options.sourceVsixPath = args[++index]
    else if (arg.startsWith('--source-vsix=')) options.sourceVsixPath = arg.slice('--source-vsix='.length)
    else if (arg === '--packaged-vsix') options.packagedVsixPath = args[++index]
    else if (arg.startsWith('--packaged-vsix=')) options.packagedVsixPath = arg.slice('--packaged-vsix='.length)
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.help && (!options.resourcesPath || path.isAbsolute(options.resourcesPath))) {
    throw new Error('--resources must be an explicit repository-relative path')
  }
  if (options.platform) options.platform = normalizePlatform(options.platform)
  return options
}

async function main() {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    console.error('Usage: node scripts/validate-packaged-capabilities.mjs --resources <relative-unpacked-resources> [--platform win32|darwin|linux] [--arch x64]')
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log('Usage: node scripts/validate-packaged-capabilities.mjs --resources <relative-unpacked-resources> [--platform win32|darwin|linux] [--arch x64]')
    return
  }

  const result = await validatePackagedCapabilities({
    resourcesPath: path.resolve(repoRoot, options.resourcesPath),
    platform: options.platform || process.platform,
    arch: options.arch || process.arch,
    sourceVsixPath: options.sourceVsixPath ? path.resolve(repoRoot, options.sourceVsixPath) : undefined,
    packagedVsixPath: options.packagedVsixPath,
  })
  const width = Math.max(...result.results.map((item) => item.level.length))
  for (const item of result.results) {
    console.log(`${item.level.padEnd(width)} ${item.label}${item.detail ? ` - ${item.detail}` : ''}`)
  }
  console.log(`\nPackaged capability validation: ${result.ok ? 'PASS' : 'FAIL'}`)
  if (!result.ok) process.exitCode = 1
}

if (path.resolve(process.argv[1] || '') === scriptPath) await main()

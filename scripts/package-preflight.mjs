/**
 * Read-only Electron Builder packaging preflight.
 *
 * This script is deliberately evidence-only. It does not remove, rename,
 * truncate, unlock, or overwrite anything. It reports the conditions that
 * commonly surface as Electron Builder EPERM errors and recommends a fresh,
 * unique output directory under .work for the next packaging attempt.
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(import.meta.url)
export const repoRoot = path.resolve(path.dirname(scriptPath), '..')
const packageJsonPath = path.join(repoRoot, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

export const DEFAULT_PATH_WARNING = 220
export const DEFAULT_ACTIVE_WINDOW_MS = 30 * 60 * 1000
const PACKAGE_ARTIFACT = /\.(?:exe|msi|dmg|pkg|zip|appimage|deb|rpm|snap|blockmap)$/i
const METADATA_ARTIFACT = /^(?:latest(?:-.*)?\.yml|builder-(?:debug|effective-config)\.(?:yml|yaml))$/i
const PACKAGING_PROCESS = /(?:electron-builder|app-builder|makensis|7za|dmgbuild|productbuild)/i
const LOCK_CODES = new Set(['EACCES', 'EBUSY', 'EPERM', 'ETXTBSY'])

function result(level, label, detail = '') {
  return { level, label, detail }
}

function exists(target) {
  try {
    return fs.existsSync(target)
  } catch {
    return false
  }
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile()
  } catch {
    return false
  }
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function formatPath(repo, target) {
  const relative = path.relative(repo, target)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.replaceAll(path.sep, '/')
    : target
}

function safeVersion(value) {
  return String(value || '0.0.0').replace(/[^0-9A-Za-z.-]/g, '-')
}

function stamp(date = new Date()) {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return iso.replace('T', '-')
}

/** Return a unique recommendation without creating the directory. */
export function recommendedWorkOutput({
  root = repoRoot,
  version = packageJson.version,
  now = new Date(),
  pid = process.pid,
  nonce = crypto.randomBytes(4).toString('hex'),
} = {}) {
  return path.join(root, '.work', `package-${safeVersion(version)}-${stamp(now)}-${pid}-${nonce}`)
}

function configuredOutput(root, pkg) {
  const configured = pkg?.build?.directories?.output
  if (typeof configured !== 'string' || configured.trim() === '') return path.join(root, 'release')
  return path.resolve(root, configured)
}

function resourceForVsix(pkg) {
  const resources = Array.isArray(pkg?.build?.extraResources) ? pkg.build.extraResources : []
  return resources.find((resource) => (
    typeof resource?.from === 'string'
    && typeof resource?.to === 'string'
    && /\.vsix$/i.test(resource.to)
  ))
}

function resourceForEnglishOcr(pkg) {
  const resources = Array.isArray(pkg?.build?.extraResources) ? pkg.build.extraResources : []
  return resources.find((resource) => (
    typeof resource?.from === 'string'
    && typeof resource?.to === 'string'
    && /(?:^|[\\/])eng\.traineddata$/i.test(resource.to)
  ))
}

function resourceWithTarget(pkg, target) {
  const resources = Array.isArray(pkg?.build?.extraResources) ? pkg.build.extraResources : []
  return resources.find((resource) => (
    typeof resource?.from === 'string'
    && typeof resource?.to === 'string'
    && resource.to.replaceAll('\\', '/').toLowerCase() === target.toLowerCase()
  ))
}

function lockEvidence(target) {
  if (!isFile(target)) return null
  let handle
  try {
    // Opening read/write is non-mutating and gives Windows an opportunity to
    // report a sharing violation. Unix hosts generally report no lock here;
    // that limitation is recorded rather than guessed around.
    handle = fs.openSync(target, 'r+')
    return null
  } catch (error) {
    const code = error?.code || 'UNKNOWN'
    return LOCK_CODES.has(code) ? { path: target, code, message: error.message } : null
  } finally {
    if (handle !== undefined) {
      try { fs.closeSync(handle) } catch {}
    }
  }
}

function entryStat(target) {
  try {
    const stat = fs.statSync(target)
    return { isFile: stat.isFile(), isDirectory: stat.isDirectory(), mtimeMs: stat.mtimeMs, size: stat.size }
  } catch (error) {
    return { error: error?.code || 'UNKNOWN', message: error?.message || String(error) }
  }
}

function readEntries(target) {
  try {
    return fs.readdirSync(target, { withFileTypes: true })
  } catch (error) {
    return { error: error?.code || 'UNKNOWN', message: error?.message || String(error) }
  }
}

function pathCandidates(output, version) {
  return [
    output,
    path.join(output, `PIT Agent Setup ${version}.exe`),
    path.join(output, `PIT Agent ${version}.exe`),
    path.join(output, `PIT Agent-${version}.dmg`),
    path.join(output, `PIT Agent-${version}-mac.zip`),
    path.join(output, `PIT Agent-${version}.AppImage`),
    path.join(output, `vd-agent_${version}_amd64.deb`),
  ]
}

function inspectOutput({ root, output, version, nowMs, activeWindowMs, maxPathLength }) {
  const checks = []
  const activeArtifacts = []
  const staleArtifacts = []
  const lockedArtifacts = []
  const pathLengths = pathCandidates(output, version).map((target) => ({
    path: target,
    length: target.length,
  }))
  const maxLength = Math.max(...pathLengths.map((item) => item.length))

  if (maxLength > maxPathLength) {
    checks.push(result('FAIL', 'Windows path length', `${maxLength} characters exceeds the ${maxPathLength}-character safety limit; use the recommended .work path`))
  } else {
    checks.push(result('PASS', 'Windows path length', `${maxLength} characters across output and expected artifacts`))
  }

  if (!exists(output)) {
    checks.push(result('PASS', 'package output path', `${formatPath(root, output)} does not exist; no stale output was found`))
    checks.push(result('PASS', 'package output access', `${formatPath(root, output)} does not exist; no access lock was observed`))
    checks.push(result('PASS', 'active package artifacts', 'No output exists, so no active installer or unpacked artifact was found'))
    checks.push(result('PASS', 'stale package/temp entries', 'No output exists, so no stale package/temp entry was found'))
    checks.push(result('PASS', 'output lock evidence', 'No output exists, so no lock probe was needed'))
    return { checks, activeArtifacts, staleArtifacts, lockedArtifacts, pathLengths }
  }

  if (!isDirectory(output)) {
    checks.push(result('FAIL', 'package output path', `${formatPath(root, output)} exists but is not a directory`))
    return { checks, activeArtifacts, staleArtifacts, lockedArtifacts, pathLengths }
  }

  try {
    fs.accessSync(output, fs.constants.R_OK | fs.constants.W_OK)
    checks.push(result('PASS', 'package output access', `${formatPath(root, output)} is readable and writable`))
  } catch (error) {
    const code = error?.code || 'UNKNOWN'
    checks.push(result('FAIL', 'package output access', `${formatPath(root, output)} access failed with ${code}; this is direct EPERM evidence when code is EPERM`))
  }

  const entries = readEntries(output)
  if (!Array.isArray(entries)) {
    checks.push(result('FAIL', 'package output listing', `${formatPath(root, output)} could not be listed: ${entries.message}`))
    return { checks, activeArtifacts, staleArtifacts, lockedArtifacts, pathLengths }
  }

  for (const entry of entries) {
    const target = path.join(output, entry.name)
    const stat = entryStat(target)
    const packageArtifact = stat.isFile && (PACKAGE_ARTIFACT.test(entry.name) || METADATA_ARTIFACT.test(entry.name))
    const packageDirectory = stat.isDirectory && /(?:unpacked|electron-builder|app-builder|^tmp$|^temp$)/i.test(entry.name)
    if (!packageArtifact && !packageDirectory) continue

    const ageMs = Math.max(0, nowMs - (stat.mtimeMs || nowMs))
    const record = { path: target, name: entry.name, ageMs, isDirectory: Boolean(stat.isDirectory) }
    if (ageMs <= activeWindowMs) activeArtifacts.push(record)
    else staleArtifacts.push(record)
    if (packageArtifact) {
      const lock = lockEvidence(target)
      if (lock) lockedArtifacts.push(lock)
    }
  }

  if (activeArtifacts.length > 0) {
    checks.push(result('WARN', 'active package artifacts', activeArtifacts.map((item) => formatPath(root, item.path)).join(', ')))
  } else {
    checks.push(result('PASS', 'active package artifacts', 'No recently modified installer, metadata, blockmap, or unpacked output was found'))
  }
  if (staleArtifacts.length > 0) {
    checks.push(result('WARN', 'stale package/temp entries', staleArtifacts.map((item) => formatPath(root, item.path)).join(', ')))
  } else {
    checks.push(result('PASS', 'stale package/temp entries', 'No stale package/temp entry was found in the configured output'))
  }
  if (lockedArtifacts.length > 0) {
    checks.push(result('FAIL', 'output lock evidence', lockedArtifacts.map((item) => `${formatPath(root, item.path)} (${item.code})`).join(', ')))
  } else {
    checks.push(result('PASS', 'output lock evidence', 'No readable package artifact returned an EPERM/EACCES/EBUSY probe error'))
  }
  return { checks, activeArtifacts, staleArtifacts, lockedArtifacts, pathLengths }
}

function inspectWorkTempDirs({ root, nowMs, activeWindowMs }) {
  const workRoot = path.join(root, '.work')
  if (!isDirectory(workRoot)) return { checks: [result('PASS', 'stale temp directories', '.work/ does not exist')], stale: [], active: [] }
  const entries = readEntries(workRoot)
  if (!Array.isArray(entries)) return { checks: [result('WARN', 'stale temp directories', `Could not inspect .work/: ${entries.message}`)], stale: [], active: [] }

  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/(?:package|electron|builder|app-builder|tmp|temp|release|vm-qa|mac-test)/i.test(entry.name)) continue
    const target = path.join(workRoot, entry.name)
    const stat = entryStat(target)
    const ageMs = Math.max(0, nowMs - (stat.mtimeMs || nowMs))
    candidates.push({ path: target, ageMs })
  }
  const active = candidates.filter((item) => item.ageMs <= activeWindowMs)
  const stale = candidates.filter((item) => item.ageMs > activeWindowMs)
  const checks = []
  if (active.length) checks.push(result('WARN', 'active temp directories', active.map((item) => formatPath(root, item.path)).join(', ')))
  else checks.push(result('PASS', 'active temp directories', 'No recently modified packaging temp directory was found in .work/'))
  if (stale.length) checks.push(result('WARN', 'stale temp directories', stale.map((item) => formatPath(root, item.path)).join(', ')))
  else checks.push(result('PASS', 'stale temp directories', 'No stale packaging temp directory was found in .work/'))
  return { checks, stale, active }
}

function validateSourceVsix({ root, pkg }) {
  const resource = resourceForVsix(pkg)
  if (!resource) return { checks: [result('FAIL', 'source VSIX', 'No .vsix extraResource with an explicit from/to path is configured')] }
  const source = path.resolve(root, resource.from)
  const checks = []
  if (!isFile(source)) {
    checks.push(result('FAIL', 'source VSIX', `${formatPath(root, source)} is missing or not a file`))
    return { checks, source, resource }
  }
  let size = 0
  try { size = fs.statSync(source).size } catch {}
  if (size <= 0) checks.push(result('FAIL', 'source VSIX', `${formatPath(root, source)} is empty`))
  else checks.push(result('PASS', 'source VSIX', `${formatPath(root, source)} (${size} bytes)`))
  if (path.basename(source).toLowerCase() !== path.basename(resource.to).toLowerCase()) {
    checks.push(result('FAIL', 'VSIX resource name', `extraResources.to (${resource.to}) does not match source filename (${path.basename(source)})`))
  } else {
    checks.push(result('PASS', 'VSIX resource name', `${resource.from} -> ${resource.to}`))
  }
  return { checks, source, resource }
}

function validateSourceOcr({ root, pkg }) {
  const resource = resourceForEnglishOcr(pkg)
  if (!resource) return { checks: [result('FAIL', 'source English OCR data', 'No eng.traineddata extraResource with an explicit from/to path is configured')] }
  const source = path.resolve(root, resource.from)
  const checks = []
  if (!isFile(source)) return { checks: [result('FAIL', 'source English OCR data', `${formatPath(root, source)} is missing or not a file`)] }
  const size = fs.statSync(source).size
  if (size <= 0) return { checks: [result('FAIL', 'source English OCR data', `${formatPath(root, source)} is empty`)] }
  checks.push(result('PASS', 'source English OCR data', `${formatPath(root, source)} (${size} bytes) -> ${resource.to}`))

  const manifestResource = resourceWithTarget(pkg, 'tessdata/manifest.json')
  const licenseResource = resourceWithTarget(pkg, 'tessdata/LICENSE.apache-2.0.txt')
  if (!manifestResource) checks.push(result('FAIL', 'English OCR manifest resource', 'tessdata/manifest.json is not configured as an extraResource'))
  if (!licenseResource) checks.push(result('FAIL', 'English OCR license resource', 'tessdata/LICENSE.apache-2.0.txt is not configured as an extraResource'))

  const manifestPath = manifestResource ? path.resolve(root, manifestResource.from) : path.join(path.dirname(source), 'manifest.json')
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch (error) {
    checks.push(result('FAIL', 'English OCR manifest', `${formatPath(root, manifestPath)} is missing or invalid: ${error.message}`))
  }
  if (manifest) {
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')
    if (/^[a-f0-9]{64}$/i.test(manifest.sha256 || '') && actualHash === String(manifest.sha256).toLowerCase()) {
      checks.push(result('PASS', 'English OCR pinned SHA-256', actualHash))
    } else {
      checks.push(result('FAIL', 'English OCR pinned SHA-256', `expected ${manifest.sha256 || '(missing)'}; actual ${actualHash}`))
    }
    if (Number(manifest.size) !== size) checks.push(result('FAIL', 'English OCR pinned size', `expected ${manifest.size}; actual ${size}`))
    else checks.push(result('PASS', 'English OCR pinned size', `${size} bytes`))
  }

  const licensePath = licenseResource ? path.resolve(root, licenseResource.from) : path.join(path.dirname(source), 'LICENSE.apache-2.0.txt')
  if (isFile(licensePath) && fs.statSync(licensePath).size > 0) checks.push(result('PASS', 'English OCR Apache-2.0 license', formatPath(root, licensePath)))
  else checks.push(result('FAIL', 'English OCR Apache-2.0 license', `${formatPath(root, licensePath)} is missing or empty`))
  return { checks, source, resource }
}

function normalizeProcessName(value) {
  return path.basename(String(value).trim()).replace(/\.exe$/i, '')
}

/**
 * Collect process-name evidence without printing command lines or environment
 * values. The command is read-only and failure to run it is only a warning.
 */
export async function collectPackagingProcessEvidence({
  platform = process.platform,
  run = execFileAsync,
} = {}) {
  const windows = platform === 'win32'
  const command = windows ? 'tasklist.exe' : 'ps'
  const args = windows ? ['/fo', 'csv', '/nh'] : ['-axo', 'comm=']
  try {
    const response = await run(command, args, { timeout: 5000, windowsHide: true, maxBuffer: 256 * 1024 })
    const lines = String(response?.stdout || '').split(/\r?\n/).filter(Boolean)
    const names = lines.map((line) => normalizeProcessName(windows ? line.split(',')[0].replace(/^"|"$/g, '') : line))
    return {
      available: true,
      names: [...new Set(names)],
      packaging: [...new Set(names.filter((name) => PACKAGING_PROCESS.test(name)))],
    }
  } catch (error) {
    return { available: false, names: [], packaging: [], error: error?.code || error?.message || String(error) }
  }
}

export function parseArguments(argv) {
  const options = { output: null, json: false, strict: false, platform: process.platform }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output') options.output = argv[++index]
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg === '--platform') options.platform = argv[++index]
    else if (arg.startsWith('--platform=')) options.platform = arg.slice('--platform='.length)
    else if (arg === '--json') options.json = true
    else if (arg === '--strict') options.strict = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.help && options.output && path.isAbsolute(options.output)) {
    throw new Error('--output must be repository-relative; pass an explicit path such as .work/package-qa')
  }
  if (!options.help && options.output && options.output.split(/[\\/]/).includes('..')) {
    throw new Error('--output cannot contain parent traversal')
  }
  return options
}

export async function runPackagePreflight({
  root = repoRoot,
  pkg = packageJson,
  outputPath,
  now = new Date(),
  activeWindowMs = DEFAULT_ACTIVE_WINDOW_MS,
  maxPathLength = DEFAULT_PATH_WARNING,
  processEvidence,
  recommendedOutput,
} = {}) {
  const output = outputPath ? path.resolve(root, outputPath) : configuredOutput(root, pkg)
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  const checks = []
  const recommendation = recommendedOutput
    ? path.resolve(root, recommendedOutput)
    : recommendedWorkOutput({ root, version: pkg.version, now: now instanceof Date ? now : new Date(nowMs) })

  if (typeof pkg.version === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version)) {
    checks.push(result('PASS', 'package version', pkg.version))
  } else {
    checks.push(result('FAIL', 'package version', 'package.json version must be a semver-like x.y.z value'))
  }
  if (pkg?.build?.directories?.output) {
    checks.push(result('PASS', 'configured package output', `${pkg.build.directories.output} (preflight target: ${formatPath(root, output)})`))
  } else {
    checks.push(result('WARN', 'configured package output', `Electron Builder default is used; preflight target: ${formatPath(root, output)}`))
  }
  checks.push(...inspectOutput({ root, output, version: pkg.version, nowMs, activeWindowMs, maxPathLength }).checks)
  checks.push(...inspectWorkTempDirs({ root, nowMs, activeWindowMs }).checks)
  checks.push(...validateSourceVsix({ root, pkg }).checks)
  checks.push(...validateSourceOcr({ root, pkg }).checks)

  const evidence = processEvidence || await collectPackagingProcessEvidence({ platform: process.platform })
  if (!evidence.available) {
    checks.push(result('WARN', 'active packaging processes', `Process evidence unavailable (${evidence.error || 'unknown error'})`))
  } else if (evidence.packaging.length > 0) {
    checks.push(result('WARN', 'active packaging processes', evidence.packaging.join(', ')))
  } else {
    checks.push(result('PASS', 'active packaging processes', 'No electron-builder helper process was observed'))
  }
  checks.push(result('INFO', 'safe output recommendation', `${formatPath(root, recommendation)} (not created by this check)`))
  checks.push(result('INFO', 'EPERM diagnosis boundary', 'Evidence only: no files or directories were deleted, renamed, unlocked, or overwritten'))

  const failures = checks.filter((item) => item.level === 'FAIL')
  const warnings = checks.filter((item) => item.level === 'WARN')
  return {
    ok: failures.length === 0,
    checks,
    failures,
    warnings,
    output,
    recommendation,
    evidence,
  }
}

function printText(resultData) {
  console.log('PIT Agent package preflight (read-only)')
  console.log('======================================')
  for (const item of resultData.checks) {
    console.log(`${item.level.padEnd(5)} ${item.label}${item.detail ? ` - ${item.detail}` : ''}`)
  }
  console.log(`\nPackage preflight: ${resultData.ok ? 'PASS' : 'FAIL'} (${resultData.failures.length} fail, ${resultData.warnings.length} warn)`)
  console.log(`Recommended unique output: ${resultData.recommendation}`)
  if (resultData.warnings.length > 0) console.log('Warnings are evidence to review before retrying Electron Builder; this command does not clean them up.')
}

async function main() {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    console.error('Usage: node scripts/package-preflight.mjs [--output <repo-relative-path>] [--json] [--strict]')
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log('Usage: node scripts/package-preflight.mjs [--output <repo-relative-path>] [--json] [--strict]')
    console.log('Read-only. It never deletes or changes output, temp directories, installers, metadata, or VSIX files.')
    return
  }
  const report = await runPackagePreflight({
    root: repoRoot,
    pkg: packageJson,
    outputPath: options.output,
  })
  if (options.json) console.log(JSON.stringify(report, null, 2))
  else printText(report)
  if (!report.ok || (options.strict && report.warnings.length > 0)) process.exitCode = 1
}

if (path.resolve(process.argv[1] || '') === scriptPath) await main()

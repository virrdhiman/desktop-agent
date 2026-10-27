/**
 * Validate an electron-updater metadata fixture or an explicit local feed.
 *
 * The default fixture is metadata-only: no installer is required and this
 * command never downloads, uploads, launches, or deletes an artifact.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
export const repoRoot = path.resolve(path.dirname(scriptPath), '..')
const DEFAULT_FIXTURE = path.join(repoRoot, 'release-updater-qa', 'latest.yml')

function trimYamlValue(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '')
}

/** Parse the bounded latest.yml shape emitted by electron-builder. */
export function parseUpdateFeed(text) {
  const lines = String(text).split(/\r?\n/)
  const feed = { version: '', files: [], path: '', sha512: '', releaseDate: '' }
  let current = null
  for (const line of lines) {
    const version = /^version:\s*(.+)$/.exec(line)
    if (version && !feed.version) feed.version = trimYamlValue(version[1])
    const file = /^\s*-\s+url:\s*(.+)$/.exec(line)
    if (file) {
      current = { url: trimYamlValue(file[1]), sha512: '', size: null }
      feed.files.push(current)
      continue
    }
    const value = /^\s+(sha512|size):\s*(.+)$/.exec(line)
    if (value && current) {
      if (value[1] === 'sha512') current.sha512 = trimYamlValue(value[2])
      else current.size = Number(trimYamlValue(value[2]))
      continue
    }
    const topPath = /^path:\s*(.+)$/.exec(line)
    if (topPath) feed.path = trimYamlValue(topPath[1])
    const topSha = /^sha512:\s*(.+)$/.exec(line)
    if (topSha) feed.sha512 = trimYamlValue(topSha[1])
    const releaseDate = /^releaseDate:\s*(.+)$/.exec(line)
    if (releaseDate) feed.releaseDate = trimYamlValue(releaseDate[1])
  }
  return feed
}

function validVersion(value) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)
}

function safeRelativeUrl(value) {
  if (!value || path.isAbsolute(value) || value.startsWith('/') || value.includes('..')) return false
  return !/[\\\0]/.test(value)
}

function validSha512(value) {
  return /^[A-Za-z0-9+/]{80,90}={0,2}$/.test(value)
}

function artifactPath(feed, file) {
  const name = feed.path || file?.url || ''
  return name.replaceAll('\\', '/')
}

async function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512')
    const stream = fs.createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('base64')))
    stream.on('error', reject)
  })
}

export async function validateUpdateFeed({
  text,
  fixturePath = DEFAULT_FIXTURE,
  artifactsDir,
  expectedVersion,
} = {}) {
  const source = text === undefined ? fs.readFileSync(fixturePath, 'utf8') : text
  const feed = parseUpdateFeed(source)
  const checks = []
  const pass = (label, detail = '') => checks.push({ level: 'PASS', label, detail })
  const fail = (label, detail = '') => checks.push({ level: 'FAIL', label, detail })
  const warn = (label, detail = '') => checks.push({ level: 'WARN', label, detail })

  if (validVersion(feed.version)) pass('feed version', feed.version)
  else fail('feed version', 'version must be a semver-like x.y.z value')
  if (expectedVersion && feed.version !== expectedVersion) fail('expected feed version', `Expected ${expectedVersion}, found ${feed.version || 'missing'}`)
  if (feed.files.length === 0) fail('feed files', 'No update file entries were found')
  else pass('feed files', `${feed.files.length} file${feed.files.length === 1 ? '' : 's'}`)

  for (const [index, file] of feed.files.entries()) {
    const label = `feed file ${index + 1}`
    if (safeRelativeUrl(file.url)) pass(`${label} URL`, file.url)
    else fail(`${label} URL`, 'URL must be a relative, non-traversing artifact name')
    if (validSha512(file.sha512)) pass(`${label} sha512`, 'base64 digest is present')
    else fail(`${label} sha512`, 'Missing or malformed base64 sha512 digest')
    if (Number.isInteger(file.size) && file.size > 0) pass(`${label} size`, `${file.size} bytes`)
    else fail(`${label} size`, 'Size must be a positive integer')
  }

  if (safeRelativeUrl(feed.path)) pass('feed path', feed.path)
  else fail('feed path', 'path must be a relative, non-traversing artifact name')
  if (validSha512(feed.sha512)) pass('top-level sha512', 'base64 digest is present')
  else fail('top-level sha512', 'Missing or malformed top-level base64 sha512 digest')
  if (feed.releaseDate && !Number.isNaN(Date.parse(feed.releaseDate))) pass('release date', feed.releaseDate)
  else fail('release date', 'releaseDate must be an ISO-compatible date')

  if (artifactsDir) {
    const root = path.resolve(artifactsDir)
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      fail('local artifact directory', `${root} does not exist or is not a directory`)
    } else {
      for (const file of feed.files) {
        const target = path.resolve(root, file.url)
        const relative = path.relative(root, target)
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          fail('local artifact path', `${file.url} escapes the explicit artifact directory`)
          continue
        }
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          fail('local artifact', `${file.url} is missing from ${root}`)
          continue
        }
        const stat = fs.statSync(target)
        if (stat.size !== file.size) fail('local artifact size', `${file.url}: metadata ${file.size}, actual ${stat.size}`)
        else pass('local artifact size', `${file.url}: ${stat.size} bytes`)
        const digest = await hashFile(target)
        if (digest !== file.sha512) fail('local artifact sha512', `${file.url}: metadata digest differs`)
        else pass('local artifact sha512', `${file.url}: exact digest match`)
      }
    }
  } else {
    warn('installer verification', 'Skipped for metadata-only fixture; pass --artifacts <explicit-directory> to verify local bytes')
  }

  const failures = checks.filter((item) => item.level === 'FAIL')
  return { ok: failures.length === 0, feed, checks, failures, fixturePath, artifactsDir }
}

export function parseArguments(argv) {
  const options = { fixture: path.relative(repoRoot, DEFAULT_FIXTURE), artifacts: null, expectedVersion: undefined, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--fixture') options.fixture = argv[++index]
    else if (arg.startsWith('--fixture=')) options.fixture = arg.slice('--fixture='.length)
    else if (arg === '--artifacts') options.artifacts = argv[++index]
    else if (arg.startsWith('--artifacts=')) options.artifacts = arg.slice('--artifacts='.length)
    else if (arg === '--version') options.expectedVersion = argv[++index]
    else if (arg.startsWith('--version=')) options.expectedVersion = arg.slice('--version='.length)
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

async function main() {
  let options
  try { options = parseArguments(process.argv.slice(2)) } catch (error) {
    console.error(`ERROR: ${error.message}`)
    console.error('Usage: node scripts/update-feed-qa.mjs [--fixture <path>] [--artifacts <dir>] [--version <x.y.z>] [--json]')
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log('Usage: node scripts/update-feed-qa.mjs [--fixture <path>] [--artifacts <dir>] [--version <x.y.z>] [--json]')
    console.log('Read-only local feed validation; it never downloads, uploads, launches, or deletes installers.')
    return
  }
  const fixture = path.resolve(repoRoot, options.fixture)
  const artifacts = options.artifacts ? path.resolve(repoRoot, options.artifacts) : undefined
  let report
  try {
    report = await validateUpdateFeed({ fixturePath: fixture, artifactsDir: artifacts, expectedVersion: options.expectedVersion })
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    process.exitCode = 1
    return
  }
  if (options.json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log('PIT Agent local update-feed QA (read-only)')
    console.log('=========================================')
    for (const item of report.checks) console.log(`${item.level.padEnd(4)} ${item.label}${item.detail ? ` - ${item.detail}` : ''}`)
    console.log(`\nUpdate feed QA: ${report.ok ? 'PASS' : 'FAIL'} (${report.failures.length} fail)`)
  }
  if (!report.ok) process.exitCode = 1
}

if (path.resolve(process.argv[1] || '') === scriptPath) await main()

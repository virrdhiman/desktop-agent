/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Source-level release QA preflight.
 *
 * This intentionally does not build installers. It checks the repository shape,
 * packaging config, release docs, generated icons, and optional release artifacts
 * so local/private development can catch release blockers before a paid signing
 * or clean-machine QA step.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const requireSigning = args.has('--require-signing')
const checkArtifacts = args.has('--artifacts')

const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
const results = []

function rel(file) {
  return path.relative(repo, file).replaceAll(path.sep, '/')
}

function add(level, label, detail = '') {
  results.push({ level, label, detail })
}

function pass(label, detail = '') {
  add('PASS', label, detail)
}

function warn(label, detail = '') {
  add('WARN', label, detail)
}

function fail(label, detail = '') {
  add('FAIL', label, detail)
}

function exists(file) {
  return fs.existsSync(path.join(repo, file))
}

function nonEmpty(file) {
  const target = path.join(repo, file)
  return fs.existsSync(target) && fs.statSync(target).size > 0
}

function requiredFile(file, label = file) {
  if (nonEmpty(file)) pass(label)
  else fail(label, `${file} is missing or empty`)
}

function requiredScript(name) {
  if (pkg.scripts?.[name]) pass(`npm script: ${name}`, pkg.scripts[name])
  else fail(`npm script: ${name}`, 'Missing from package.json scripts')
}

function hasTarget(platform, target) {
  const values = pkg.build?.[platform]?.target
  return Array.isArray(values) && values.includes(target)
}

function vscodeBridgeResource() {
  const resources = Array.isArray(pkg.build?.extraResources) ? pkg.build.extraResources : []
  return resources.find((item) => typeof item?.to === 'string' && /^vd-agent-vscode-bridge-.*\.vsix$/i.test(item.to))
}

function envSet(name) {
  return Boolean(process.env[name])
}

function reportSigning(label, names) {
  const missing = names.filter((name) => !envSet(name))
  if (missing.length === 0) {
    pass(label, names.join(', '))
    return
  }
  const detail = `Missing ${missing.join(', ')}`
  if (requireSigning) fail(label, detail)
  else warn(label, `${detail}. Unsigned private builds can still be tested locally.`)
}

function checkPackageConfig() {
  if (pkg.private === true) pass('package is private')
  else warn('package is private', 'Set package.json private:true for private/internal builds')

  if (pkg.build?.appId === 'com.vd.agent') pass('Electron appId', pkg.build.appId)
  else fail('Electron appId', 'Expected com.vd.agent')

  if (pkg.productName === 'VD Agent' && pkg.build?.productName === 'VD Agent') {
    pass('Product name', 'VD Agent')
  } else {
    fail('Product name', 'package.json and build.productName should both be VD Agent')
  }

  if (pkg.build?.directories?.output === 'release') pass('release output directory', 'release/')
  else fail('release output directory', 'Expected build.directories.output to be release')

  if (pkg.build?.directories?.buildResources === 'build') pass('build resources directory', 'build/')
  else fail('build resources directory', 'Expected build.directories.buildResources to be build')

  for (const pattern of ['dist/**/*', 'dist-electron/**/*', 'node_modules/typescript/**/*']) {
    if (pkg.build?.files?.includes(pattern)) pass(`packaged file pattern: ${pattern}`)
    else fail(`packaged file pattern: ${pattern}`, 'Missing from build.files')
  }

  for (const [platform, target] of [['win', 'nsis'], ['win', 'portable'], ['mac', 'dmg'], ['mac', 'zip'], ['linux', 'AppImage'], ['linux', 'deb']]) {
    if (hasTarget(platform, target)) pass(`${platform} target: ${target}`)
    else fail(`${platform} target: ${target}`, 'Missing from package.json build targets')
  }

  const bridge = vscodeBridgeResource()
  if (bridge?.from && bridge?.to && nonEmpty(bridge.from)) {
    pass('VS Code bridge packaged resource', `${bridge.from} -> ${bridge.to}`)
  } else {
    fail('VS Code bridge packaged resource', 'extraResources must include a non-empty vd-agent-vscode-bridge VSIX')
  }
}

function checkScriptsAndDocs() {
  for (const script of [
    'build',
    'test',
    'lint',
    'smoke',
    'agent:evals',
    'checksums',
    'release:notes',
    'release:qa',
    'electron:build',
  ]) {
    requiredScript(script)
  }

  for (const file of ['Win/build.bat', 'Mac/build.sh', 'Linux/build.sh']) {
    requiredFile(file, `platform build script: ${file}`)
  }

  for (const file of ['README.md', 'docs/INSTALL.md', 'docs/RELEASE_CHECKLIST.md', 'CHANGELOG.md', 'LICENSE']) {
    requiredFile(file, `release doc: ${file}`)
  }

  const changelog = fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf8')
  if (/^## \[Unreleased\]/m.test(changelog)) pass('CHANGELOG has Unreleased section')
  else fail('CHANGELOG has Unreleased section', 'release-notes.mjs depends on this heading')

  if (new RegExp(`^## \\[${pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'm').test(changelog)) {
    pass(`CHANGELOG has version ${pkg.version}`)
  } else {
    warn(`CHANGELOG has version ${pkg.version}`, 'Add this before tagging an official release')
  }
}

function checkIcons() {
  requiredFile('build/icon.ico', 'Windows icon')
  requiredFile('build/icon.icns', 'macOS icon')
  requiredFile('build/icon.png', 'Linux icon')
  requiredFile('build/icon.svg', 'source icon')
}

function checkSigning() {
  reportSigning('Windows signing env', ['CSC_LINK', 'CSC_KEY_PASSWORD'])
  reportSigning('macOS signing env', ['CSC_LINK', 'CSC_KEY_PASSWORD'])
  reportSigning('macOS notarization env', ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'])
}

function validateChecksumLine(line) {
  const match = /^([a-f0-9]{64})  (.+)$/i.exec(line)
  if (!match) return { ok: false, reason: 'Invalid sha256sum format' }
  const file = path.join(repo, 'release', match[2])
  if (!fs.existsSync(file)) return { ok: false, reason: `Missing artifact ${match[2]}` }
  return { ok: true }
}

function checkReleaseArtifacts() {
  if (!checkArtifacts) {
    warn('release artifacts', 'Skipped. Run npm run release:qa -- --artifacts after packaging installers.')
    return
  }

  const releaseDir = path.join(repo, 'release')
  if (!fs.existsSync(releaseDir)) {
    fail('release artifacts', 'release/ does not exist')
    return
  }

  const files = fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
  const downloadable = files.filter((name) => /\.(exe|msi|dmg|zip|appimage|deb|rpm|tar\.gz|snap)$/i.test(name))
  const versioned = downloadable.filter((name) => name.includes(pkg.version))
  if (versioned.length > 0) pass('versioned release artifacts', versioned.join(', '))
  else fail('versioned release artifacts', `No downloadable files for ${pkg.version} in release/`)

  const checksumPath = path.join(releaseDir, 'SHA256SUMS.txt')
  if (!fs.existsSync(checksumPath)) {
    fail('release checksums', 'release/SHA256SUMS.txt is missing')
    return
  }

  const lines = fs.readFileSync(checksumPath, 'utf8').split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) {
    fail('release checksums', 'SHA256SUMS.txt is empty')
    return
  }

  const invalid = lines.map((line) => [line, validateChecksumLine(line)]).filter(([, result]) => !result.ok)
  if (invalid.length === 0) pass('release checksums', `${lines.length} file${lines.length === 1 ? '' : 's'} listed`)
  else fail('release checksums', invalid.map(([line, result]) => `${result.reason}: ${line}`).join('; '))

  const bridge = vscodeBridgeResource()
  if (bridge?.to) {
    const packagedBridge = path.join(releaseDir, 'win-unpacked', 'resources', bridge.to)
    if (fs.existsSync(packagedBridge) && fs.statSync(packagedBridge).size > 0) {
      pass('packaged VS Code bridge resource', rel(packagedBridge))
    } else {
      fail('packaged VS Code bridge resource', `${rel(packagedBridge)} is missing or empty`)
    }
  }
}

checkPackageConfig()
checkScriptsAndDocs()
checkIcons()
checkSigning()
checkReleaseArtifacts()

const width = Math.max(...results.map((item) => item.level.length))
for (const item of results) {
  const detail = item.detail ? ` - ${item.detail}` : ''
  console.log(`${item.level.padEnd(width)} ${item.label}${detail}`)
}

const failures = results.filter((item) => item.level === 'FAIL')
const warnings = results.filter((item) => item.level === 'WARN')
console.log(`\nRelease QA: ${results.length - failures.length - warnings.length} pass, ${warnings.length} warn, ${failures.length} fail`)
if (warnings.length > 0) {
  console.log('Warnings are expected for unsigned private builds and clean-device checks.')
}
if (failures.length > 0) process.exit(1)


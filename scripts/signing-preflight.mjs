/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Validate code-signing and notarization inputs before an official release.
 *
 * Private unsigned builds are allowed by default. Pass --require-signing or
 * --require-official to fail when Windows/macOS release credentials are absent.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)

function valueAfter(flag) {
  const index = args.indexOf(flag)
  if (index === -1) return ''
  return args[index + 1] || ''
}

function normalPlatform(input) {
  const value = String(input || '').toLowerCase()
  if (value.includes('win')) return 'Windows'
  if (value.includes('mac') || value.includes('darwin')) return 'macOS'
  if (value.includes('linux')) return 'Linux'
  if (process.platform === 'win32') return 'Windows'
  if (process.platform === 'darwin') return 'macOS'
  return 'Linux'
}

function isPathLike(value) {
  return /^[a-z]:[\\/]/i.test(value)
    || value.startsWith('/')
    || value.startsWith('~/')
    || value.startsWith('./')
    || value.startsWith('../')
    || /\.(pfx|p12|cer|crt)$/i.test(path.basename(value))
}

function certLinkStatus(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return { ok: false, detail: 'missing' }
  if (!isPathLike(trimmed)) return { ok: true, detail: 'provided as secret/base64' }

  const resolved = path.resolve(trimmed)
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return { ok: true, detail: `file exists: ${resolved}` }
  }
  return { ok: false, detail: `file not found: ${resolved}` }
}

function hasValue(env, name) {
  return Boolean(String(env[name] || '').trim())
}

export function signingPreflight({ platform, env = {}, requireSigning = false, requireNotarization = false }) {
  const os = normalPlatform(platform)
  const checks = []

  function add(level, label, detail = '') {
    checks.push({ level, label, detail })
  }

  function pass(label, detail = '') {
    add('PASS', label, detail)
  }

  function warnOrFail(label, detail = '') {
    add(requireSigning ? 'FAIL' : 'WARN', label, detail)
  }

  if (os === 'Linux') {
    pass('Linux release signing', 'AppImage/deb use checksums; no platform code-signing certificate is required.')
    return { platform: os, checks }
  }

  const cert = certLinkStatus(env.CSC_LINK)
  const hasPassword = hasValue(env, 'CSC_KEY_PASSWORD')
  const hasKeychainIdentity = os === 'macOS' && hasValue(env, 'CSC_NAME')
  const certificateReady = (cert.ok && hasPassword) || hasKeychainIdentity

  if (certificateReady) {
    pass(`${os} code-signing certificate`, hasKeychainIdentity ? `keychain identity: ${env.CSC_NAME}` : cert.detail)
  } else if (hasKeychainIdentity) {
    pass('macOS code-signing identity', `keychain identity: ${env.CSC_NAME}`)
  } else {
    const missing = []
    if (!cert.ok) missing.push(`CSC_LINK (${cert.detail})`)
    if (!hasPassword) missing.push('CSC_KEY_PASSWORD')
    warnOrFail(`${os} code-signing certificate`, `Missing ${missing.join(', ')}`)
  }

  if (os === 'Windows') {
    return { platform: os, checks }
  }

  const appleMissing = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'].filter((name) => !hasValue(env, name))
  if (appleMissing.length === 0) {
    pass('macOS notarization credentials', 'APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID')
  } else {
    add(requireNotarization ? 'FAIL' : 'WARN', 'macOS notarization credentials', `Missing ${appleMissing.join(', ')}`)
  }

  return { platform: os, checks }
}

function printReport(result) {
  console.log(`VD Agent signing preflight (${result.platform})`)
  console.log('================================')
  const width = Math.max(...result.checks.map((item) => item.level.length))
  for (const item of result.checks) {
    console.log(`${item.level.padEnd(width)} ${item.label}${item.detail ? ` - ${item.detail}` : ''}`)
  }
  const failures = result.checks.filter((item) => item.level === 'FAIL')
  const warnings = result.checks.filter((item) => item.level === 'WARN')
  console.log(`\nSigning preflight: ${result.checks.length - failures.length - warnings.length} pass, ${warnings.length} warn, ${failures.length} fail`)
  if (warnings.length > 0) {
    console.log('Unsigned private builds are okay for local QA, but public users may see SmartScreen/Gatekeeper warnings.')
  }
  return failures.length === 0
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invoked === fileURLToPath(import.meta.url)) {
  const requireOfficial = args.includes('--require-official')
  const result = signingPreflight({
    platform: valueAfter('--platform') || process.env.RUNNER_OS || process.platform,
    env: process.env,
    requireSigning: args.includes('--require-signing') || requireOfficial,
    requireNotarization: args.includes('--require-notarization') || requireOfficial,
  })
  if (!printReport(result)) process.exit(1)
}

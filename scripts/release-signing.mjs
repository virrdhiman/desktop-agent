/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Decide whether a release build should sign.
 * Missing signing secrets still produce installers.
 *
 *   node scripts/release-signing.mjs >> "$GITHUB_ENV"
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function releaseSigningPlan({ os, env = {} }) {
  const link = String(env.CSC_LINK || '').trim()
  const password = String(env.CSC_KEY_PASSWORD || '').trim()
  const hasCert = Boolean(link && password)
  const notarize = Boolean(
    String(env.APPLE_ID || '').trim()
    && String(env.APPLE_APP_SPECIFIC_PASSWORD || '').trim()
    && String(env.APPLE_TEAM_ID || '').trim(),
  )

  if (os === 'Windows') {
    if (hasCert) {
      return { signed: true, builderArgs: '--win --config.win.signAndEditExecutable=true', env: {} }
    }
    return {
      signed: false,
      builderArgs: '--win --config.win.signAndEditExecutable=false',
      env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    }
  }

  if (os === 'macOS') {
    const clearApple = {
      APPLE_ID: '',
      APPLE_APP_SPECIFIC_PASSWORD: '',
      APPLE_TEAM_ID: '',
    }
    if (hasCert) {
      return { signed: true, notarize, builderArgs: '--mac', env: notarize ? {} : clearApple }
    }
    return {
      signed: false,
      notarize: false,
      builderArgs: '--mac',
      env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false', ...clearApple },
    }
  }

  return { signed: false, builderArgs: '--linux', env: {} }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invoked === fileURLToPath(import.meta.url)) {
  const plan = releaseSigningPlan({ os: process.env.RUNNER_OS || '', env: process.env })
  const lines = [`BUILDER_ARGS=${plan.builderArgs}`]
  for (const [key, value] of Object.entries(plan.env)) lines.push(`${key}=${value}`)
  process.stdout.write(`${lines.join('\n')}\n`)
}

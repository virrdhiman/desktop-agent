// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { releaseSigningPlan } = createRequire(import.meta.url)('../../scripts/release-signing.mjs') as {
  releaseSigningPlan: (input: { os: string; env?: Record<string, string> }) => {
    signed: boolean
    notarize?: boolean
    builderArgs: string
    env: Record<string, string>
  }
}

const cert = { CSC_LINK: 'base64-cert', CSC_KEY_PASSWORD: 'secret' }
const apple = {
  APPLE_ID: 'dev@example.com',
  APPLE_APP_SPECIFIC_PASSWORD: 'app-password',
  APPLE_TEAM_ID: 'TEAMID',
}

describe('release signing plan', () => {
  it('signs Windows and macOS only when the certificate secrets are set', () => {
    expect(releaseSigningPlan({ os: 'Windows', env: cert })).toMatchObject({
      signed: true,
      builderArgs: '--win --config.win.signAndEditExecutable=true',
    })
    expect(releaseSigningPlan({ os: 'Windows', env: {} })).toMatchObject({
      signed: false,
      builderArgs: '--win --config.win.signAndEditExecutable=false',
      env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    })

    expect(releaseSigningPlan({ os: 'macOS', env: { ...cert, ...apple } })).toMatchObject({
      signed: true,
      notarize: true,
      builderArgs: '--mac',
      env: {},
    })
    const signedOnly = releaseSigningPlan({ os: 'macOS', env: cert })
    expect(signedOnly.signed).toBe(true)
    expect(signedOnly.notarize).toBe(false)
    expect(signedOnly.env.APPLE_ID).toBe('')

    expect(releaseSigningPlan({ os: 'macOS', env: {} }).signed).toBe(false)
    expect(releaseSigningPlan({ os: 'macOS', env: {} }).env.CSC_IDENTITY_AUTO_DISCOVERY).toBe('false')
  })

  it('always builds Linux unsigned', () => {
    expect(releaseSigningPlan({ os: 'Linux', env: cert })).toEqual({
      signed: false,
      builderArgs: '--linux',
      env: {},
    })
  })
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'
import path from 'path'
import { privateEnvCandidatePaths } from '../privateEnv'

describe('private env paths', () => {
  it('reads user data, and the app directory only while unpackaged', () => {
    const dev = privateEnvCandidatePaths({
      userData: '/home/me/data',
      appPath: '/src/app',
      packaged: false,
    })
    expect(dev).toEqual([
      path.join('/home/me/data', '.env.local'),
      path.join('/src/app', '.env.local'),
    ])

    const packaged = privateEnvCandidatePaths({
      userData: '/home/me/data',
      appPath: '/installed/app',
      packaged: true,
      envFile: ' /opt/secrets.env ',
    })
    expect(packaged).toEqual([
      path.join('/home/me/data', '.env.local'),
      '/opt/secrets.env',
    ])
    expect(packaged.some((file) => file.includes('resources'))).toBe(false)
  })

  it('returns nothing when import is disabled', () => {
    expect(privateEnvCandidatePaths({
      userData: '/data',
      appPath: '/app',
      packaged: false,
      disabled: true,
    })).toEqual([])
  })
})

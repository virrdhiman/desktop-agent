// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf-8'))

describe('runtime requirements', () => {
  it('requires Node 22.19 so the undici 8 pin can install', () => {
    expect(pkg.engines.node).toBe('>=22.19.0')
    expect(pkg.overrides.undici).toMatch(/^\^8\./)
  })

  it('allows the node-pty install script that selects a prebuild or compiles with node-gyp', () => {
    expect(pkg.allowScripts['node-pty']).toBe(true)
    expect(pkg.dependencies['node-pty']).toBeTruthy()
  })
})

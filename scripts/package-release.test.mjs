import { describe, expect, it } from 'vitest'
import { parseArguments, relativeOutput } from './package-release.mjs'

describe('safe package command', () => {
  it('defaults to an ignored unique work output and rejects release reuse', () => {
    const options = parseArguments(['--platform', 'linux'])
    expect(options.output.output.replaceAll('\\', '/')).toContain('.work/package-1.1.0-')
    expect(() => relativeOutput('release')).toThrow('.work')
  })

  it('keeps platform and output explicit', () => {
    const options = parseArguments(['--platform', 'windows', '--output', '.work/package-test'])
    expect(options.platform).toBe('windows')
    expect(options.output.output).toBe('.work/package-test')
  })
})

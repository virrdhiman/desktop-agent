import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateChecklist, parseArguments } from './generate-mac-test-checklist.mjs'

describe('macOS checklist generator', () => {
  it('defaults to a unique ignored .work destination', () => {
    const options = parseArguments([], new Date('2026-10-11T12:34:56.000Z'))
    expect(options.output.replaceAll(path.sep, '/')).toContain('.work/mac-test/macos-1.1.0-')
  })

  it('writes once and refuses to overwrite an explicit checklist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-agent-mac-template-'))
    const output = path.join(root, 'checklist.md')
    const options = { output, artifactRoot: 'release', appPath: 'release/app', resourcesPath: 'release/resources' }
    const generated = generateChecklist({ options, template: 'version={{VERSION}} root={{ARTIFACT_ROOT}} app={{APP_PATH}} resources={{RESOURCES_PATH}}' })
    expect(generated).toBe(output)
    expect(fs.readFileSync(output, 'utf8')).toContain('version=1.1.0')
    expect(() => generateChecklist({ options, template: 'replacement' })).toThrow('Refusing to overwrite')
    expect(fs.readFileSync(output, 'utf8')).toContain('version=1.1.0')
  })
})

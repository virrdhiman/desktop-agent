// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { tsDefinition, tsDiagnostics, tsReferences, tsRename } from '../tsLanguageService'

let root: string
let mainFile: string
let helperFile: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-ts-ls-'))
  mainFile = path.join(root, 'main.ts')
  helperFile = path.join(root, 'helper.ts')
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'ESNext', strict: true } }))
  fs.writeFileSync(helperFile, 'export function makeAgent() { return 1 }\n')
  fs.writeFileSync(mainFile, "import { makeAgent } from './helper'\nconst value: string = makeAgent()\nmakeAgent()\n")
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('tsLanguageService', () => {
  it('returns diagnostics, definitions, references, and exact rename locations', async () => {
    const diagnostics = await tsDiagnostics(root, mainFile)
    expect(Array.isArray(diagnostics) && diagnostics.some((d) => d.message.includes("number"))).toBe(true)

    const definition = await tsDefinition(root, mainFile, 1, 11)
    expect(definition && !('error' in definition) && definition.path).toBe(path.resolve(helperFile))

    const refs = await tsReferences(root, mainFile, 1, 11)
    expect(Array.isArray(refs) && refs.length).toBeGreaterThanOrEqual(3)

    const renamed = await tsRename(root, mainFile, 1, 11, 'buildAgent')
    expect('replacements' in renamed && renamed.replacements).toBeGreaterThanOrEqual(3)
    expect(fs.readFileSync(helperFile, 'utf8')).toContain('buildAgent')
    expect(fs.readFileSync(mainFile, 'utf8')).toContain('buildAgent()')
  })
})

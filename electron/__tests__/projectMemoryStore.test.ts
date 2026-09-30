// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadProjectMemory } from '../projectMemoryStore'

let root: string
let store: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-memory-'))
  store = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-memory-store-'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'vitest' }, dependencies: { react: '1' } }))
  fs.writeFileSync(path.join(root, 'README.md'), '# Demo\nLocal project.')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(store, { recursive: true, force: true })
})

describe('project memory', () => {
  it('builds and caches a local repository summary', async () => {
    const first = await loadProjectMemory(store, root)
    const second = await loadProjectMemory(store, root)
    expect(first.content).toContain('Package: demo')
    expect(first.content).toContain('test=vitest')
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(second.updatedAt).toBe(first.updatedAt)
  })
})

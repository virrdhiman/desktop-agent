// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { previewEdits } from '../patchPreview'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-patch-preview-'))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'message.ts'), 'export const msg = "old"\n')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('previewEdits', () => {
  it('returns a unified diff without changing files', async () => {
    const file = path.join(root, 'src', 'message.ts')
    const preview = await previewEdits(root, [{ path: file, old_string: '"old"', new_string: '"new"' }])
    expect(preview).toContain('Patch preview: 1 file would change; no files were written.')
    expect(preview).toContain('diff --git a/src/message.ts b/src/message.ts')
    expect(preview).toContain('-export const msg = "old"')
    expect(preview).toContain('+export const msg = "new"')
    expect(fs.readFileSync(file, 'utf-8')).toBe('export const msg = "old"\n')
  })

  it('reports missing old strings clearly', async () => {
    const preview = await previewEdits(root, [{ path: path.join(root, 'src', 'message.ts'), old_string: 'missing', new_string: 'x' }])
    expect(preview).toContain('old_string not found')
    expect(preview).toContain('No diff generated')
  })
})


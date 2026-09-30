// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  createCheckpoint, listCheckpoints, MAX_CHECKPOINT_FILE_BYTES, MAX_CHECKPOINTS_PER_SESSION, restoreCheckpoint,
} from '../checkpointStore'

let root: string
let checkpoints: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-checkpoint-'))
  checkpoints = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-checkpoint-store-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(checkpoints, { recursive: true, force: true })
})

describe('checkpointStore', () => {
  it('restores edited files and removes files created after the checkpoint', async () => {
    const existing = path.join(root, 'existing.txt')
    const created = path.join(root, 'created.txt')
    fs.writeFileSync(existing, 'before')
    const checkpoint = await createCheckpoint(checkpoints, {
      sessionId: 'session-one', workspace: root, label: 'edit files', paths: [existing, created],
    })
    expect(checkpoint).not.toBeNull()
    fs.writeFileSync(existing, 'after')
    fs.writeFileSync(created, 'new')

    const result = await restoreCheckpoint(checkpoints, 'session-one', checkpoint!.id)
    expect(fs.readFileSync(existing, 'utf-8')).toBe('before')
    expect(fs.existsSync(created)).toBe(false)
    expect(result.restored).toEqual(['existing.txt'])
    expect(result.removed).toEqual(['created.txt'])
  })

  it('lists newest checkpoints and ignores paths outside the workspace', async () => {
    const file = path.join(root, 'a.txt')
    fs.writeFileSync(file, 'a')
    await createCheckpoint(checkpoints, { sessionId: 'session-two', workspace: root, label: 'one', paths: [file, path.join(root, '..', 'outside')] })
    expect(await listCheckpoints(checkpoints, 'session-two')).toHaveLength(1)
    expect((await listCheckpoints(checkpoints, 'session-two'))[0].files).toHaveLength(1)
  })

  it('records oversized files as skipped instead of copying them', async () => {
    const file = path.join(root, 'large.bin')
    fs.writeFileSync(file, Buffer.alloc(MAX_CHECKPOINT_FILE_BYTES + 1))
    const checkpoint = await createCheckpoint(checkpoints, { sessionId: 'large', workspace: root, label: 'large', paths: [file] })
    expect(checkpoint?.files[0].skipped).toContain('size limit')
  })

  it('keeps only the newest bounded set per session', async () => {
    const file = path.join(root, 'bounded.txt')
    fs.writeFileSync(file, 'x')
    for (let index = 0; index < MAX_CHECKPOINTS_PER_SESSION + 2; index++) {
      await createCheckpoint(checkpoints, { sessionId: 'bounded', workspace: root, label: `edit ${index}`, paths: [file] })
    }
    expect(await listCheckpoints(checkpoints, 'bounded')).toHaveLength(MAX_CHECKPOINTS_PER_SESSION)
  })
})

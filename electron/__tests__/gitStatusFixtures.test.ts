// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { simpleGit, type SimpleGit } from 'simple-git'

let root = ''
let git: SimpleGit
let baseBranch = ''

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-git-status-'))
  git = simpleGit(root)
  await git.init()
  baseBranch = (await git.branchLocal()).current
  await git.addConfig('user.name', 'VD QA')
  await git.addConfig('user.email', 'vd-qa@example.test')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

async function commitFile(content: string) {
  fs.writeFileSync(path.join(root, 'conflict.txt'), content)
  await git.add('conflict.txt')
  await git.commit(content)
}

describe('git status fixtures used by the Git panel', () => {
  it('distinguishes a non-git folder from a clean repository', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-not-git-'))
    try {
      await expect(simpleGit(empty).status()).rejects.toThrow()
      await commitFile('clean')
      const status = await git.status()
      expect(status.isClean()).toBe(true)
      expect(status.conflicted).toEqual([])
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })

  it('reports a detached HEAD without inventing a branch', async () => {
    await commitFile('detached')
    await git.checkout(['--detach', 'HEAD'])
    const status = await git.status()
    expect(status.detached).toBe(true)
    expect(status.current === null || status.current === 'HEAD').toBe(true)
  })

  it('reports conflicted paths for the Git panel', async () => {
    await commitFile('base')
    baseBranch = (await git.branchLocal()).current
    await git.checkoutLocalBranch('feature')
    await commitFile('feature change')
    await git.checkout(baseBranch)
    await commitFile('main change')
    await expect(git.merge(['feature'])).rejects.toThrow()
    const status = await git.status()
    expect(status.conflicted).toContain('conflict.txt')
    await git.merge(['--abort'])
  })
})

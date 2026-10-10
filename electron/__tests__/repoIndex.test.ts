// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildRepoIndex, buildRepoMap, searchRepo, startRepoIndexWatcher, stopRepoIndexWatchers } from '../repoIndex'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-repo-index-'))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'node_modules', 'ignored'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'AgentChat.tsx'), [
    "import { runAgent } from './agentLoop'",
    'export function AgentChat() {',
    '  const queryQueue = []',
    '  return queryQueue.length',
    '}',
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'src', 'AgentChat.test.tsx'), 'import { AgentChat } from "./AgentChat"\n')
  fs.writeFileSync(path.join(root, 'src', 'GitPanel.tsx'), 'export const ReviewBundle = () => null\n')
  fs.writeFileSync(path.join(root, 'node_modules', 'ignored', 'bad.ts'), 'queryQueue should not be indexed\n')
  fs.writeFileSync(path.join(root, '.env'), 'SECRET_TOKEN=must_not_index\n')
})

afterEach(() => {
  stopRepoIndexWatchers()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('repoIndex', () => {
  it('builds a symbol-oriented repo map without ignored folders', async () => {
    const map = await buildRepoMap(root)
    expect(map.map((entry) => entry.path)).toContain('src/AgentChat.tsx')
    expect(map.map((entry) => entry.path)).not.toContain('node_modules/ignored/bad.ts')
    expect(map.map((entry) => entry.path)).not.toContain('.env')
    const agentChat = map.find((entry) => entry.path === 'src/AgentChat.tsx')
    expect(agentChat?.symbols).toContain('AgentChat')
    expect(agentChat?.imports).toContain('./agentLoop')
    expect(map.find((entry) => entry.path === 'src/AgentChat.test.tsx')?.testLike).toBe(true)
  })

  it('ranks path, symbol, and content matches with snippets', async () => {
    const hits = await searchRepo(root, 'query queue agent chat')
    expect(hits[0].path).toBe('src/AgentChat.tsx')
    expect(hits[0].reason).toContain('semantic')
    expect(hits[0].snippet).toContain('queryQueue')
    expect(hits[0].line).toBeGreaterThan(0)
  })

  it('reuses the semantic cache until files change', async () => {
    const first = await buildRepoIndex(root)
    expect(first.cached).toBe(false)
    const second = await buildRepoIndex(root)
    expect(second.cached).toBe(true)
    fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'export const NewSymbol = 1\n')
    const third = await buildRepoIndex(root)
    expect(third.cached).toBe(false)
    expect(third.files).toBeGreaterThan(first.files)
    expect(third.updatedFiles).toBe(1)
    expect(third.reusedFiles).toBe(first.files)
    fs.writeFileSync(path.join(root, 'src', 'GitPanel.tsx'), 'export const ChangedSymbol = () => null\n')
    const fourth = await buildRepoIndex(root)
    expect(fourth.updatedFiles).toBe(1)
    expect(fourth.reusedFiles).toBe(third.files - 1)
    expect((await searchRepo(root, 'ChangedSymbol'))[0].path).toBe('src/GitPanel.tsx')
    fs.unlinkSync(path.join(root, 'src', 'new.ts'))
    const fifth = await buildRepoIndex(root)
    expect(fifth.updatedFiles).toBe(0)
    expect(fifth.files).toBe(third.files - 1)
    const forced = await buildRepoIndex(root, true)
    expect(forced.updatedFiles).toBe(forced.files)
    expect(forced.reusedFiles).toBe(0)
  })

  it('starts a background watcher for the repo index', async () => {
    const stats = await startRepoIndexWatcher(root)
    expect(stats.watching).toBe(true)
    const second = await buildRepoIndex(root)
    expect(second.watching).toBe(true)
  })
})

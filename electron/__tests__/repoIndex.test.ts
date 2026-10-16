// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildRepoIndex, buildRepoMap, buildRepoSymbolGraph, findRepoUsages, goToRepoDefinition, onRepoIndexStatus, searchCode, searchRepo, startRepoIndexWatcher, stopRepoIndexWatchers } from '../repoIndex'

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
  fs.writeFileSync(path.join(root, 'src', 'agentLoop.ts'), 'export function runAgent() { return true }\n')
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

  it('resolves local imports to definitions and records bounded references', async () => {
    const graph = await buildRepoSymbolGraph(root)
    const definition = graph.definitions.find((item) => item.symbol === 'runAgent')
    expect(definition?.path).toBe('src/agentLoop.ts')
    expect(graph.edges).toContainEqual({
      from: 'src/AgentChat.tsx',
      to: 'src/agentLoop.ts',
      kind: 'import',
      symbols: ['runAgent'],
    })
    expect(graph.references.filter((item) => item.symbol === 'runAgent')).toContainEqual({
      path: 'src/AgentChat.tsx',
      line: 1,
      symbol: 'runAgent',
      definition: 'src/agentLoop.ts',
    })
    const agentLoop = (await buildRepoMap(root)).find((entry) => entry.path === 'src/agentLoop.ts')
    expect(agentLoop?.referencedBy).toContain('src/AgentChat.tsx')
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

  it('honors gitignore patterns, skips binary and oversized files, and stays bounded', async () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n*.secret\n')
    fs.mkdirSync(path.join(root, 'ignored'), { recursive: true })
    fs.writeFileSync(path.join(root, 'ignored', 'hidden.ts'), 'export const Hidden = true\n')
    fs.writeFileSync(path.join(root, 'src', 'ignored.secret'), 'should not be indexed\n')
    fs.writeFileSync(path.join(root, 'src', 'binary.json'), Buffer.from('x\0y'))
    fs.writeFileSync(path.join(root, 'src', 'oversized.ts'), 'x'.repeat(500_001))

    const stats = await buildRepoIndex(root, true)
    const map = await buildRepoMap(root)
    const paths = map.map((entry) => entry.path)
    expect(paths).not.toContain('ignored/hidden.ts')
    expect(paths).not.toContain('src/ignored.secret')
    expect(paths).not.toContain('src/binary.json')
    expect(paths).not.toContain('src/oversized.ts')
    expect(stats.files).toBeLessThanOrEqual(2_500)
  })

  it('searches code and resolves bounded definition/usages from the same index', async () => {
    const hits = await searchCode(root, 'queryQueue')
    expect(hits[0]).toMatchObject({ path: 'src/AgentChat.tsx', line: 3 })

    const definition = await goToRepoDefinition(root, 'src/AgentChat.tsx', 1, 11)
    expect(definition).toEqual({ symbol: 'runAgent', path: 'src/agentLoop.ts', line: 1 })

    const usages = await findRepoUsages(root, 'src/AgentChat.tsx', 1, 11)
    expect(usages).toContainEqual({ path: 'src/AgentChat.tsx', line: 1, symbol: 'runAgent', definition: 'src/agentLoop.ts' })
    expect(usages.length).toBeLessThanOrEqual(250)
  })

  it('reports indexing progress and completion timing', async () => {
    const events: string[] = []
    const unsubscribe = onRepoIndexStatus((status) => events.push(status.state))
    try {
      await buildRepoIndex(root, true)
      expect(events[0]).toBe('indexing')
      expect(events).toContain('idle')
      expect((await buildRepoIndex(root)).durationMs).toBeGreaterThanOrEqual(0)
    } finally {
      unsubscribe()
    }
  })
})

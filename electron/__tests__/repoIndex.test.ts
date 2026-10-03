// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildRepoMap, searchRepo } from '../repoIndex'

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
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('repoIndex', () => {
  it('builds a symbol-oriented repo map without ignored folders', async () => {
    const map = await buildRepoMap(root)
    expect(map.map((entry) => entry.path)).toContain('src/AgentChat.tsx')
    expect(map.map((entry) => entry.path)).not.toContain('node_modules/ignored/bad.ts')
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
})

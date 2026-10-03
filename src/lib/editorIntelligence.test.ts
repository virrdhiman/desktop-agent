import { describe, expect, it, vi } from 'vitest'
import {
  findWorkspaceReferences,
  identifierPattern,
  isValidIdentifier,
  pickLikelyDefinition,
  renameWorkspaceIdentifier,
  type WorkspaceFile,
} from './editorIntelligence'

const files: WorkspaceFile[] = [
  { name: 'a.ts', path: '/repo/a.ts', isDirectory: false },
  { name: 'b.tsx', path: '/repo/b.tsx', isDirectory: false },
  { name: 'image.png', path: '/repo/image.png', isDirectory: false },
]

describe('editorIntelligence', () => {
  it('matches whole identifiers only', () => {
    const pattern = identifierPattern('agent')
    expect('agent agentQueue myagent'.match(pattern)).toEqual(['agent'])
    expect(isValidIdentifier('agent_1')).toBe(true)
    expect(isValidIdentifier('1agent')).toBe(false)
  })

  it('finds workspace references in text files', async () => {
    const readFile = vi.fn(async (path: string) => ({
      content: path.endsWith('a.ts') ? 'const agent = 1\nagent + 1' : 'export function run(agent) { return agent }',
    }))
    const refs = await findWorkspaceReferences(files, readFile, 'agent')
    expect(refs.map((ref) => `${ref.path}:${ref.line}:${ref.column}`)).toEqual([
      '/repo/a.ts:1:7',
      '/repo/a.ts:2:1',
      '/repo/b.tsx:1:21',
      '/repo/b.tsx:1:37',
    ])
  })

  it('renames exact identifiers across workspace files', async () => {
    const content = new Map([
      ['/repo/a.ts', 'const agent = 1\nconst agentQueue = []\nagent + 1'],
      ['/repo/b.tsx', 'function run(agent) { return agent }'],
    ])
    const readFile = vi.fn(async (path: string) => ({ content: content.get(path) || '' }))
    const writeFile = vi.fn(async (path: string, next: string) => {
      content.set(path, next)
      return { success: true }
    })

    const result = await renameWorkspaceIdentifier(files, readFile, writeFile, 'agent', 'worker')
    expect(result.replacements).toBe(4)
    expect(content.get('/repo/a.ts')).toContain('const worker = 1')
    expect(content.get('/repo/a.ts')).toContain('agentQueue')
    expect(content.get('/repo/b.tsx')).toContain('return worker')
  })

  it('prefers likely declarations for definition fallback', () => {
    const refs = [
      { path: '/repo/use.ts', line: 4, column: 10, preview: 'return agent + 1' },
      { path: '/repo/def.ts', line: 1, column: 7, preview: 'const agent = createAgent()' },
    ]
    expect(pickLikelyDefinition(refs, 'agent')?.path).toBe('/repo/def.ts')
  })

  it('prefers Python declarations for definition fallback', () => {
    const refs = [
      { path: '/repo/use.py', line: 5, column: 12, preview: 'return agent.run()' },
      { path: '/repo/agent.py', line: 2, column: 5, preview: 'def agent(task):' },
    ]
    expect(pickLikelyDefinition(refs, 'agent')?.path).toBe('/repo/agent.py')
  })

  it('prefers Rust-style declarations for definition fallback', () => {
    const refs = [
      { path: '/repo/use.rs', line: 8, column: 18, preview: 'let next = agent(input);' },
      { path: '/repo/lib.rs', line: 3, column: 4, preview: 'fn agent(input: Task) -> Result {' },
    ]
    expect(pickLikelyDefinition(refs, 'agent')?.path).toBe('/repo/lib.rs')
  })
})

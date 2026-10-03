// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { planRepoChange } from '../repoPlanner'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-repo-plan-'))
  fs.mkdirSync(path.join(root, 'src', '__tests__'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { lint: 'tsc --noEmit', test: 'vitest run', build: 'vite build', smoke: 'node scripts/smoke.mjs' },
  }))
  fs.writeFileSync(path.join(root, 'src', 'agentLoop.ts'), [
    'export function runAgentLoop() {',
    '  return "agent loop"',
    '}',
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'src', '__tests__', 'agentLoop.test.ts'), 'test("agent loop", () => {})\n')
  fs.writeFileSync(path.join(root, 'README.md'), 'Agent loop docs\n')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('repoPlanner', () => {
  it('builds a concrete plan with files and verification commands', async () => {
    const plan = await planRepoChange(root, 'improve agent loop execution')
    expect(plan).toContain('Repo plan for: improve agent loop execution')
    expect(plan).toContain('src/agentLoop.ts')
    expect(plan).toContain('src/__tests__/agentLoop.test.ts')
    expect(plan).toContain('npm run lint')
    expect(plan).toContain('npm run build')
  })
})


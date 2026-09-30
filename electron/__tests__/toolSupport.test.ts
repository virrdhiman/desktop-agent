// @vitest-environment node
import path from 'path'
import { describe, it, expect } from 'vitest'
import { formatCommandResult, resolveToolArgs } from '../toolSupport'

const ws = path.resolve('/tmp/vd-workspace')

describe('resolveToolArgs', () => {
  it('resolves relative file paths against the workspace', () => {
    expect(resolveToolArgs('read_file', { path: 'src/App.tsx' }, ws).path).toBe(path.join(ws, 'src', 'App.tsx'))
  })

  it('keeps absolute paths as they are', () => {
    const abs = path.resolve('/etc/hosts')
    expect(resolveToolArgs('read_file', { path: abs }, ws).path).toBe(abs)
  })

  it('defaults directory tools and run_command to the workspace', () => {
    expect(resolveToolArgs('list_files', {}, ws).path).toBe(ws)
    expect(resolveToolArgs('git_status', {}, ws).path).toBe(ws)
    expect(resolveToolArgs('run_command', { command: 'npm test' }, ws).cwd).toBe(ws)
    expect(resolveToolArgs('run_command', { command: 'ls', cwd: 'packages/app' }, ws).cwd).toBe(path.join(ws, 'packages', 'app'))
  })

  it('resolves every path in multi_file_edit', () => {
    const out = resolveToolArgs('multi_file_edit', { edits: [{ path: 'a.ts', old_string: 'x', new_string: 'y' }] }, ws)
    expect(out.edits[0]).toEqual({ path: path.join(ws, 'a.ts'), old_string: 'x', new_string: 'y' })
  })

  it('leaves URLs and non-path tools alone', () => {
    expect(resolveToolArgs('image_analysis', { image_url: 'https://x.test/a.png' }, ws).image_url).toBe('https://x.test/a.png')
    expect(resolveToolArgs('web_search', { query: 'vitest' }, ws)).toEqual({ query: 'vitest' })
  })

  it('changes nothing without a workspace', () => {
    expect(resolveToolArgs('read_file', { path: 'a.ts' })).toEqual({ path: 'a.ts' })
    expect(resolveToolArgs('run_command', { command: 'ls' }, '')).toEqual({ command: 'ls' })
  })
})

describe('formatCommandResult', () => {
  it('returns stdout and stderr on success', () => {
    const r = formatCommandResult('npm test', null, 'ok\n', 'warn\n')
    expect(r).toEqual({ result: '--- stdout ---\nok\n--- stderr ---\nwarn' })
  })

  it('says so when a successful command prints nothing', () => {
    expect(formatCommandResult('true', null, '', '')).toEqual({ result: 'Command completed with exit code 0 and no output.' })
  })

  it('reports a non-zero exit as an error with the exit code and both streams', () => {
    const r = formatCommandResult('npm test', { code: 1 }, '3 passed\n', '1 failed\n')
    expect('error' in r && r.error).toContain('Command failed with exit code 1: npm test')
    expect('error' in r && r.error).toContain('3 passed')
    expect('error' in r && r.error).toContain('1 failed')
  })

  it('reports a timeout clearly', () => {
    const r = formatCommandResult('npm run dev', { killed: true, signal: 'SIGTERM', code: null }, 'partial', '', 30_000)
    expect('error' in r && r.error).toMatch(/^Command timed out after 30 s and was stopped: npm run dev/)
  })

  it('reports a command that could not start', () => {
    const r = formatCommandResult('nope', { code: 'ENOENT', message: 'spawn nope ENOENT' }, '', '')
    expect('error' in r && r.error).toContain('Command could not run: nope')
    expect('error' in r && r.error).toContain('ENOENT')
  })

  it('keeps the end of very long output, where errors usually are', () => {
    const long = 'x'.repeat(30_000) + 'THE-ERROR'
    const r = formatCommandResult('build', { code: 2 }, long, '')
    expect('error' in r && r.error).toContain('THE-ERROR')
    expect('error' in r && r.error.length).toBeLessThan(21_000)
  })
})

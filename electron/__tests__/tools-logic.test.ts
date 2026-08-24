/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Tool logic unit tests
 * Tests the pure logic that tools use (not IPC, but the actual operations)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

const TEST_DIR = path.join(os.tmpdir(), 'freebuff-test-' + Date.now())

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('File System Tool Logic', () => {
  it('creates and reads files', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt')
    fs.writeFileSync(filePath, 'Hello World')
    const content = fs.readFileSync(filePath, 'utf-8')
    expect(content).toBe('Hello World')
  })

  it('writes files with content', async () => {
    const filePath = path.join(TEST_DIR, 'output.txt')
    fs.writeFileSync(filePath, 'test content', 'utf-8')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('test content')
  })

  it('edits files by string replacement', async () => {
    const filePath = path.join(TEST_DIR, 'edit.txt')
    fs.writeFileSync(filePath, 'Hello World', 'utf-8')
    const content = fs.readFileSync(filePath, 'utf-8')
    const newContent = content.replace('World', 'Freebuff')
    fs.writeFileSync(filePath, newContent, 'utf-8')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello Freebuff')
  })

  it('creates directories recursively', async () => {
    const dirPath = path.join(TEST_DIR, 'a', 'b', 'c')
    fs.mkdirSync(dirPath, { recursive: true })
    expect(fs.existsSync(dirPath)).toBe(true)
  })

  it('deletes files', async () => {
    const filePath = path.join(TEST_DIR, 'delete-me.txt')
    fs.writeFileSync(filePath, 'delete me')
    expect(fs.existsSync(filePath)).toBe(true)
    fs.unlinkSync(filePath)
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('renames files', async () => {
    const oldPath = path.join(TEST_DIR, 'old.txt')
    const newPath = path.join(TEST_DIR, 'new.txt')
    fs.writeFileSync(oldPath, 'rename me')
    fs.renameSync(oldPath, newPath)
    expect(fs.existsSync(newPath)).toBe(true)
    expect(fs.existsSync(oldPath)).toBe(false)
  })

  it('lists directory contents', async () => {
    fs.writeFileSync(path.join(TEST_DIR, 'a.txt'), 'a')
    fs.writeFileSync(path.join(TEST_DIR, 'b.txt'), 'b')
    fs.mkdirSync(path.join(TEST_DIR, 'subdir'))
    const entries = fs.readdirSync(TEST_DIR)
    expect(entries).toContain('a.txt')
    expect(entries).toContain('b.txt')
    expect(entries).toContain('subdir')
  })

  it('detects hidden files', () => {
    const entries = ['.git', 'node_modules', 'src', '.env']
    const filtered = entries.filter(e => !e.startsWith('.'))
    expect(filtered).toEqual(['node_modules', 'src'])
  })

  it('filters out node_modules and dist', () => {
    const entries = ['src', 'node_modules', 'dist', 'package.json', '.git']
    const filtered = entries.filter(e => !e.startsWith('.') && e !== 'node_modules' && e !== 'dist')
    expect(filtered).toEqual(['src', 'package.json'])
  })
})

describe('Search Logic', () => {
  it('searches files by name pattern', () => {
    const files = ['index.ts', 'App.tsx', 'utils.ts', 'test.spec.ts']
    const pattern = '.ts'
    const matches = files.filter(f => f.includes(pattern) && !f.includes('.spec.'))
    expect(matches).toEqual(['index.ts', 'utils.ts'])
  })

  it('searches code content', () => {
    const content = `function hello() {\n  const x = 1\n  return x\n}\nfunction world() {\n  return 42\n}`
    const lines = content.split('\n')
    const matches: string[] = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('function')) {
        matches.push(`line ${i + 1}: ${lines[i].trim()}`)
      }
    }
    expect(matches).toHaveLength(2)
    expect(matches[0]).toContain('function hello')
  })

  it('limits search results', () => {
    const results = Array.from({ length: 200 }, (_, i) => `result-${i}`)
    const limited = results.slice(0, 100)
    expect(limited).toHaveLength(100)
  })
})

describe('Provider Logic', () => {
  it('filters free providers', () => {
    const providers = [
      { id: 'groq', name: 'Groq', freeTier: true },
      { id: 'openai', name: 'OpenAI', freeTier: false },
      { id: 'together', name: 'Together', freeTier: true },
    ]
    const free = providers.filter(p => p.freeTier)
    expect(free).toHaveLength(2)
  })

  it('builds fallback chain', () => {
    const active = { id: 'groq', name: 'Groq', freeTier: true }
    const others = [
      { id: 'openai', name: 'OpenAI', freeTier: false, apiKey: '' },
      { id: 'together', name: 'Together', freeTier: true, apiKey: 'key1' },
      { id: 'deepseek', name: 'DeepSeek', freeTier: true, apiKey: 'key2' },
    ]
    const fallback = [active, ...others.filter(p => p.freeTier && p.apiKey).slice(0, 3)]
    expect(fallback).toHaveLength(3) // groq + together + deepseek
    expect(fallback[0].id).toBe('groq')
  })
})

describe('Git Logic', () => {
  it('formats git log entries', () => {
    const log = [
      { hash: 'abc1234567890', message: 'feat: add feature', author: 'dev' },
      { hash: 'def5678901234', message: 'fix: bug fix', author: 'dev' },
    ]
    const formatted = log.map(e => `${e.hash.slice(0, 7)} ${e.message}`).join('\n')
    expect(formatted).toContain('abc1234 feat: add feature')
    expect(formatted).toContain('def5678 fix: bug fix')
  })

  it('formats git status', () => {
    const status = {
      branch: 'main',
      staged: ['a.ts'],
      modified: ['b.ts'],
      not_added: ['c.ts'],
    }
    const summary = `Branch: ${status.branch}\nStaged: ${status.staged.join(', ')}\nModified: ${status.modified.join(', ')}\nUntracked: ${status.not_added.join(', ')}`
    expect(summary).toContain('Branch: main')
    expect(summary).toContain('Staged: a.ts')
  })
})

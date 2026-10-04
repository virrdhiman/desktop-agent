// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'fs'

describe('ollama default', () => {
  it('suggests a small coding model', () => {
    const settings = fs.readFileSync(new URL('../handlers/settings.ts', import.meta.url), 'utf8')
    const ollama = settings.split('\n').find((line) => line.includes("id: 'ollama'")) || ''
    expect(ollama).toContain("model: 'qwen2.5-coder:7b'")
    expect(ollama).not.toContain('llama3.3')
  })
})

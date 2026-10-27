import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const appSource = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../App.tsx'), 'utf8')

describe('application shortcut regressions', () => {
  it('keeps the previously supported global shortcuts wired', () => {
    expect(appSource).toContain('isTerminalPanelShortcut(event)')
    expect(appSource).toContain("event.key === ','")
    expect(appSource).toContain("event.key.toLowerCase() === 'e'")
    expect(appSource).toContain("event.key === 'g'")
    expect(appSource).toContain("event.key === 'b'")
    expect(appSource).toContain("event.key === 'n'")
  })
})

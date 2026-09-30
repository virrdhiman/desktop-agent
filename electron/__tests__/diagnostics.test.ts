// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildDiagnosticsReport } from '../diagnostics'

let userData: string

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-diagnostics-'))
  fs.mkdirSync(path.join(userData, 'conversations'), { recursive: true })
  fs.mkdirSync(path.join(userData, 'checkpoints', 'session-one'), { recursive: true })
  fs.mkdirSync(path.join(userData, 'project-memory'), { recursive: true })
})
afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('diagnostics', () => {
  it('reports useful health metadata without chats, code, paths, filenames, or API keys', async () => {
    const apiKey = 'custom-provider-secret-123456789'
    const workspace = path.join(userData, 'private-client-project')
    fs.writeFileSync(path.join(userData, 'conversations', 'private-session.json'), JSON.stringify({
      version: 2,
      title: 'Secret acquisition discussion',
      messages: [{ role: 'user', content: `private message ${apiKey}` }, { role: 'assistant', content: 'private answer' }],
    }))
    fs.writeFileSync(path.join(userData, 'conversations', 'private-session.json.bak'), '{}')
    fs.writeFileSync(path.join(userData, 'checkpoints', 'session-one', 'cp.json'), 'checkpoint bytes')
    fs.writeFileSync(path.join(userData, 'project-memory', 'memory.json'), 'source tree details')

    const report = await buildDiagnosticsReport({
      userDataDir: userData,
      appVersion: '1.2.3',
      packaged: true,
      now: 1_800_000_000_000,
      settings: {
        workspacePath: workspace,
        activeProvider: `groq-${workspace}`,
        permissionMode: 'ask-risky',
        providers: [{
          id: `groq-${workspace}`, apiKey, model: `model-${workspace}`, models: ['model-a', 'model-b'], modelsUpdatedAt: 123,
          performance: { successes: 4, failures: 1, consecutiveFailures: 0, cooldownUntil: 1 },
        }],
      },
    })
    const serialized = JSON.stringify(report)

    expect(report.application).toMatchObject({ name: 'VD Agent', version: '1.2.3', packaged: true })
    expect(report.settings.providers[0]).toMatchObject({
      position: 1, active: true, configured: true, selectedModelConfigured: true, discoveredModels: 2, successes: 4, failures: 1,
    })
    expect(report.storage.conversations).toMatchObject({ primaryFiles: 1, backupFiles: 1, storedMessages: 2, schemaVersions: [2] })
    expect(report.storage.checkpoints.files).toBe(1)
    expect(report.storage.projectMemory.files).toBe(1)
    expect(serialized).not.toContain(apiKey)
    expect(serialized).not.toContain(workspace)
    expect(serialized).not.toContain('private-session')
    expect(serialized).not.toContain('Secret acquisition discussion')
    expect(serialized).not.toContain('private message')
    expect(serialized).not.toContain('source tree details')
  })

  it('counts unreadable primary conversations without including their bytes', async () => {
    fs.writeFileSync(path.join(userData, 'conversations', 'broken.json'), '{broken')
    const report = await buildDiagnosticsReport({ userDataDir: userData, settings: {}, appVersion: '1.0.0', packaged: false })
    expect(report.storage.conversations).toMatchObject({ primaryFiles: 1, unreadablePrimaryFiles: 1, storedMessages: 0 })
  })
})

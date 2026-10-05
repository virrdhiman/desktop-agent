// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { formatVsCodeContext, loadVsCodeBridgeState, readVsCodeBridgeStatus, sendVsCodeBridgeCommand } from '../vscodeBridge'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-vscode-bridge-'))
  fs.mkdirSync(path.join(root, '.vd-agent'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export const app = 1\n')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('vscodeBridge', () => {
  it('loads exported VS Code editor context as workspace-relative state', async () => {
    fs.writeFileSync(path.join(root, '.vd-agent', 'vscode-bridge.json'), JSON.stringify({
      version: 1,
      workspacePath: root,
      updatedAt: 123,
      activeFile: path.join(root, 'src', 'app.ts'),
      activeLanguage: 'typescript',
      selection: { text: 'const app', startLine: 1, startColumn: 8, endLine: 1, endColumn: 11 },
      visibleFiles: [path.join(root, 'src', 'app.ts')],
      openFiles: [path.join(root, 'src', 'app.ts'), path.join(root, '..', 'outside.ts')],
      index: { updatedAt: 789, files: 12, symbols: 34, bytes: 1000 },
    }))

    const state = await loadVsCodeBridgeState(root)
    expect(state?.activeFile).toBe('src/app.ts')
    expect(state?.visibleFiles).toEqual(['src/app.ts'])
    expect(state?.openFiles).toEqual(['src/app.ts'])

    const formatted = await formatVsCodeContext(root)
    expect(formatted).toContain('Active file: src/app.ts')
    expect(formatted).toContain('Selection 1:8-1:11')
    expect(formatted).toContain('VS Code local index: 12 files, 34 symbols')
  })

  it('returns setup guidance when no bridge file exists', async () => {
    fs.rmSync(path.join(root, '.vd-agent'), { recursive: true, force: true })
    await expect(formatVsCodeContext(root)).resolves.toContain('No VS Code bridge state found')
  })

  it('reports bridge status and last command result', async () => {
    fs.writeFileSync(path.join(root, '.vd-agent', 'vscode-bridge.json'), JSON.stringify({
      version: 1,
      workspacePath: root,
      updatedAt: Date.now(),
      activeFile: path.join(root, 'src', 'app.ts'),
      activeLanguage: 'typescript',
      visibleFiles: [path.join(root, 'src', 'app.ts')],
      openFiles: [path.join(root, 'src', 'app.ts')],
    }))
    fs.mkdirSync(path.join(root, '.vd-agent', 'commands'), { recursive: true })
    fs.writeFileSync(path.join(root, '.vd-agent', 'commands', 'pending.json'), '{}')
    fs.writeFileSync(path.join(root, '.vd-agent', 'vscode-last-command.json'), JSON.stringify({
      id: '1',
      updatedAt: 456,
      ok: true,
      action: 'open_file',
      message: 'Opened src/app.ts',
    }))

    const status = await readVsCodeBridgeStatus(root)
    expect(status.connected).toBe(true)
    expect(status.commandsPending).toBe(1)
    expect(status.state?.activeFile).toBe('src/app.ts')
    expect(status.lastResult?.action).toBe('open_file')
  })

  it('queues a VS Code command and reads the bridge result', async () => {
    const commandPromise = sendVsCodeBridgeCommand(root, {
      action: 'open_file',
      args: { path: path.join(root, 'src', 'app.ts'), line: 1 },
    }, 2_000)

    const commandDir = path.join(root, '.vd-agent', 'commands')
    let commandFile = ''
    for (let i = 0; i < 20; i++) {
      const files = fs.existsSync(commandDir) ? fs.readdirSync(commandDir).filter((file) => file.endsWith('.json')) : []
      if (files[0]) {
        commandFile = path.join(commandDir, files[0])
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(commandFile).toBeTruthy()
    const command = JSON.parse(fs.readFileSync(commandFile, 'utf8'))
    expect(command.action).toBe('open_file')
    expect(command.args.path).toBe(path.join(root, 'src', 'app.ts'))

    const resultDir = path.join(root, '.vd-agent', 'command-results')
    fs.mkdirSync(resultDir, { recursive: true })
    fs.writeFileSync(path.join(resultDir, `${command.id}.json`), JSON.stringify({
      id: command.id,
      updatedAt: Date.now(),
      ok: true,
      message: 'Opened src/app.ts',
    }))

    await expect(commandPromise).resolves.toBe('Opened src/app.ts')
    expect(fs.existsSync(path.join(resultDir, `${command.id}.json`))).toBe(false)
  })

  it('returns guidance when the VS Code bridge does not answer', async () => {
    await expect(sendVsCodeBridgeCommand(root, {
      action: 'open_file',
      args: { path: path.join(root, 'src', 'app.ts') },
    }, 50)).resolves.toContain('VS Code bridge command queued but no result arrived')
  })
})

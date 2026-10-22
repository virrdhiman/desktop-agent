const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const vscode = require('vscode')

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function bridgeCommand(root, id, action, args) {
  const commands = path.join(root, '.vd-agent', 'commands')
  await fs.promises.mkdir(commands, { recursive: true })
  await fs.promises.writeFile(path.join(commands, `${id}.json`), JSON.stringify({ id, action, args }))
  await vscode.commands.executeCommand('vdAgent.processCommands')
  const resultPath = path.join(root, '.vd-agent', 'command-results', `${id}.json`)
  for (let i = 0; i < 30; i++) {
    const result = await fs.promises.readFile(resultPath, 'utf8').then(JSON.parse).catch(() => null)
    if (result) {
      assert.equal(result.ok, true, result.message)
      return result
    }
    await pause(100)
  }
  throw new Error(`Bridge command ${id} did not return a result.`)
}

async function run() {
  const steps = []
  const output = process.env.VD_VSCODE_QA_RESULT
  try {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    assert.ok(root, 'VS Code test workspace is missing')
    assert.equal(vscode.workspace.isTrusted, true, 'VS Code test workspace is not trusted')
    const extension = vscode.extensions.getExtension('virender-dhiman.vd-agent-vscode-bridge')
    assert.ok(extension, 'VD Agent extension is not loaded')
    await extension.activate()

    const config = vscode.workspace.getConfiguration('vdAgentBridge')
    await config.update('aiProvider', 'ollama', vscode.ConfigurationTarget.Workspace)
    await config.update('aiBaseUrl', 'http://127.0.0.1:11434', vscode.ConfigurationTarget.Workspace)
    await config.update('aiModel', 'qwen2.5-coder:1.5b', vscode.ConfigurationTarget.Workspace)
    assert.equal(vscode.workspace.getConfiguration('editor').get('inlineSuggest.enabled'), true, 'VS Code inline suggestions are disabled')
    const file = path.join(root, 'qa.ts')
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
    const editor = await vscode.window.showTextDocument(document)
    editor.selection = new vscode.Selection(document.positionAt(document.getText().length), document.positionAt(document.getText().length))
    await vscode.commands.executeCommand('vdAgent.exportContext')
    const bridgePath = path.join(root, '.vd-agent', 'vscode-bridge.json')
    const state = JSON.parse(await fs.promises.readFile(bridgePath, 'utf8'))
    assert.equal(state.activeFile, file)
    steps.push('active editor export')

    await vscode.commands.executeCommand('vdAgent.rebuildIndex')
    const index = JSON.parse(await fs.promises.readFile(path.join(root, '.vd-agent', 'vscode-index.json'), 'utf8'))
    assert.ok(index.files.some((entry) => entry.path === 'qa.ts'))
    steps.push('workspace index')

    await vscode.commands.executeCommand('vdAgent.runAutocompleteSmoke')
    await vscode.commands.executeCommand('vdAgent.exportContext')
    const localState = JSON.parse(await fs.promises.readFile(bridgePath, 'utf8'))
    assert.ok(localState.ai?.inline?.local > 0, 'Local inline suggestion was not produced')
    steps.push('local inline completion')

    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
    let aiInlineObserved = false
    for (let i = 0; i < 20; i++) {
      await pause(1000)
      await vscode.commands.executeCommand('vdAgent.exportContext')
      const current = JSON.parse(await fs.promises.readFile(bridgePath, 'utf8'))
      if (current.ai?.inline?.ai > 0) {
        aiInlineObserved = true
        break
      }
    }
    steps.push(aiInlineObserved ? 'AI inline completion' : 'AI inline completion not observed')

    await bridgeCommand(root, 'stale-preview', 'show_diff', { path: 'qa.ts', old_string: 'customerTotal = 7', new_string: 'customerTotal = 8' })
    const edit = new vscode.WorkspaceEdit()
    const current = document.getText()
    const start = current.indexOf('customerTotal = 7')
    assert.ok(start >= 0)
    edit.replace(document.uri, new vscode.Range(document.positionAt(start), document.positionAt(start + 'customerTotal = 7'.length)), 'customerTotal = 9')
    assert.equal(await vscode.workspace.applyEdit(edit), true)
    await document.save()
    await vscode.commands.executeCommand('vdAgent.acceptLastPreview')
    assert.ok((await fs.promises.readFile(file, 'utf8')).includes('customerTotal = 9'), 'Stale preview overwrote a newer edit')
    await vscode.commands.executeCommand('vdAgent.rejectLastPreview')
    steps.push('stale patch blocked')

    await bridgeCommand(root, 'fresh-preview', 'show_diff', { path: 'qa.ts', old_string: 'customerTotal = 9', new_string: 'customerTotal = 10' })
    await vscode.commands.executeCommand('vdAgent.acceptLastPreview')
    assert.ok((await fs.promises.readFile(file, 'utf8')).includes('customerTotal = 10'), 'Fresh preview was not applied')
    steps.push('fresh patch accepted')

    const liveDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
    const liveEditor = await vscode.window.showTextDocument(liveDocument)
    const code = liveDocument.getText()
    const selectionStart = code.indexOf('return a - b')
    assert.ok(selectionStart >= 0)
    liveEditor.selection = new vscode.Selection(liveDocument.positionAt(selectionStart), liveDocument.positionAt(selectionStart + 'return a - b'.length))
    await vscode.commands.executeCommand('vdAgent.fixWithVD')
    const tasks = JSON.parse(await fs.promises.readFile(path.join(root, '.vd-agent', 'vscode-agent-tasks.json'), 'utf8'))
    const latest = tasks.tasks.find((task) => task.kind === 'fix')
    assert.equal(latest?.status, 'done', latest?.error || 'Native edit task did not complete')
    assert.ok(fs.existsSync(path.join(root, '.vd-agent', 'vscode-last-preview.json')), 'Native edit did not open a preview')
    await vscode.commands.executeCommand('vdAgent.rejectLastPreview')
    steps.push('native AI edit preview')

    await fs.promises.writeFile(output, JSON.stringify({ ok: true, steps, aiInlineObserved }))
  } catch (error) {
    await fs.promises.writeFile(output, JSON.stringify({ ok: false, steps, error: String(error?.stack || error) }))
    throw error
  }
}

module.exports = { run }

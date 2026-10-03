// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { externalDefinition, externalDiagnostics, externalReferences, externalRename } from '../externalLanguageService'

let root: string
let sourceFile: string
let serverFile: string
let previousPythonLsp: string | undefined

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-external-ls-'))
  sourceFile = path.join(root, 'agent.py')
  serverFile = path.join(root, 'fake-lsp.cjs')
  fs.writeFileSync(sourceFile, 'def agent():\n    return 1\n\nagent()\n')
  fs.writeFileSync(serverFile, fakeServerSource())
  previousPythonLsp = process.env.VD_AGENT_LSP_PYTHON
  process.env.VD_AGENT_LSP_PYTHON = `"${process.execPath}" "${serverFile}"`
})

afterEach(() => {
  if (previousPythonLsp == null) delete process.env.VD_AGENT_LSP_PYTHON
  else process.env.VD_AGENT_LSP_PYTHON = previousPythonLsp
  fs.rmSync(root, { recursive: true, force: true })
})

describe('externalLanguageService', () => {
  it('uses a stdio language server for diagnostics, definition, references, and rename', async () => {
    const diagnostics = await externalDiagnostics(root, sourceFile)
    expect(Array.isArray(diagnostics) && diagnostics[0]?.message).toContain('fake warning')

    const definition = await externalDefinition(root, sourceFile, 4, 1)
    expect(definition && !('error' in definition) ? definition : null).toMatchObject({ path: path.resolve(sourceFile), line: 1, column: 5 })

    const references = await externalReferences(root, sourceFile, 4, 1)
    expect(Array.isArray(references) && references.map((ref) => ref.line)).toEqual([1, 4])

    const renamed = await externalRename(root, sourceFile, 4, 1, 'worker')
    expect('replacements' in renamed && renamed.replacements).toBe(2)
    expect(fs.readFileSync(sourceFile, 'utf8')).toContain('def worker():')
    expect(fs.readFileSync(sourceFile, 'utf8')).toContain('worker()')
  })
})

function fakeServerSource() {
  return `
let buffer = Buffer.alloc(0)
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n')
    if (headerEnd < 0) return
    const header = buffer.slice(0, headerEnd).toString('utf8')
    const length = Number((header.match(/Content-Length:\\s*(\\d+)/i) || [])[1] || 0)
    if (!length || buffer.length < headerEnd + 4 + length) return
    const body = buffer.slice(headerEnd + 4, headerEnd + 4 + length).toString('utf8')
    buffer = buffer.slice(headerEnd + 4 + length)
    handle(JSON.parse(body))
  }
})
function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n')
  process.stdout.write(body)
}
function handle(message) {
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: { capabilities: {
      textDocumentSync: 1,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
    } } })
    return
  }
  if (message.method === 'textDocument/didOpen') {
    send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: {
      uri: message.params.textDocument.uri,
      diagnostics: [{ range: { start: { line: 1, character: 4 }, end: { line: 1, character: 10 } }, severity: 2, message: 'fake warning' }],
    } })
    return
  }
  if (message.method === 'textDocument/definition') {
    send({ jsonrpc: '2.0', id: message.id, result: { uri: message.params.textDocument.uri, range: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } } } })
    return
  }
  if (message.method === 'textDocument/references') {
    send({ jsonrpc: '2.0', id: message.id, result: [
      { uri: message.params.textDocument.uri, range: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } } },
      { uri: message.params.textDocument.uri, range: { start: { line: 3, character: 0 }, end: { line: 3, character: 5 } } },
    ] })
    return
  }
  if (message.method === 'textDocument/rename') {
    send({ jsonrpc: '2.0', id: message.id, result: { changes: {
      [message.params.textDocument.uri]: [
        { range: { start: { line: 3, character: 0 }, end: { line: 3, character: 5 } }, newText: message.params.newName },
        { range: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } }, newText: message.params.newName },
      ],
    } } })
  }
}
`
}

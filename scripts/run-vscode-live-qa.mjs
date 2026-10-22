import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const code = process.env.VD_VSCODE_EXE || path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-vscode-live-qa-'))
const workspace = path.join(root, 'workspace')
const result = path.join(root, 'result.json')
fs.mkdirSync(workspace)
fs.writeFileSync(path.join(workspace, 'qa.ts'), 'const customerTotal = 7\nfunction add(a: number, b: number) { return a - b }\nconst result = customerT')

const args = [
  workspace,
  `--extensionDevelopmentPath=${path.join(repo, 'vscode-extension')}`,
  `--extensionTestsPath=${path.join(repo, 'scripts', 'vscode-live-qa.cjs')}`,
  `--user-data-dir=${path.join(root, 'user-data')}`,
  `--extensions-dir=${path.join(root, 'extensions')}`,
  '--disable-workspace-trust',
  '--new-window',
]
const child = spawn(code, args, {
  env: { ...process.env, VD_VSCODE_QA_RESULT: result },
  windowsHide: true,
})
let logs = ''
child.stdout.on('data', (chunk) => { logs += String(chunk) })
child.stderr.on('data', (chunk) => { logs += String(chunk) })
const exited = new Promise((resolve) => child.on('exit', resolve))
let status = null
for (let i = 0; i < 120; i++) {
  if (fs.existsSync(result)) {
    try { status = JSON.parse(fs.readFileSync(result, 'utf8')); break } catch {}
  }
  if (child.exitCode !== null) break
  await new Promise((resolve) => setTimeout(resolve, 1000))
}
if (child.exitCode === null) {
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
  else child.kill('SIGTERM')
}
await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))])
console.log(JSON.stringify(status || { ok: false, error: logs.slice(-2500) || 'VS Code test timed out or exited without a result.' }, null, 2))
if (status?.ok) {
  const target = path.resolve(root)
  if (target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('vd-vscode-live-qa-')) {
    fs.rmSync(target, { recursive: true, force: true })
  }
} else {
  console.log(`QA workspace retained for inspection: ${root}`)
  process.exitCode = 1
}

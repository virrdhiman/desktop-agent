import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const exe = path.resolve(process.argv[2] || 'release/VD Agent 1.1.0.exe')
const root = path.resolve(process.argv[3] || '.work/vm-results/portable-diagnostic')
const userData = path.join(root, 'userdata')
fs.mkdirSync(root, { recursive: true })
fs.mkdirSync(userData, { recursive: true })
const stdoutPath = path.join(root, 'stdout.log')
const stderrPath = path.join(root, 'stderr.log')
const logPath = path.join(root, 'electron.log')
const stdoutFd = fs.openSync(stdoutPath, 'w')
const stderrFd = fs.openSync(stderrPath, 'w')
const startedAt = new Date().toISOString()
const child = spawn(exe, [
  `--user-data-dir=${userData}`,
  '--enable-logging',
  '--disable-gpu',
  '--remote-debugging-port=0',
  `--log-file=${logPath}`,
], {
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', VD_AGENT_DISABLE_ENV_IMPORT: '1' },
  stdio: ['ignore', stdoutFd, stderrFd],
})
let exit = null
child.on('exit', (code, signal) => { exit = { code, signal } })
const deadline = Date.now() + 45_000
while (Date.now() < deadline && !exit) await new Promise((resolve) => setTimeout(resolve, 500))
const portFile = path.join(userData, 'DevToolsActivePort')
const portText = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8') : ''
if (!exit) child.kill()
await new Promise((resolve) => child.once('close', resolve))
fs.closeSync(stdoutFd); fs.closeSync(stderrFd)
console.log(JSON.stringify({
  exe, startedAt, pid: child.pid, exit, userData,
  devToolsActivePort: portText,
  stdout: fs.readFileSync(stdoutPath, 'utf8'),
  stderr: fs.readFileSync(stderrPath, 'utf8'),
  electronLog: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '',
}, null, 2))

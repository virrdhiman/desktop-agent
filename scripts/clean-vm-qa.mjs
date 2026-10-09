import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)
const root = process.cwd()
const releaseDir = path.join(root, 'release')
const requireVm = process.argv.includes('--require-vm')

async function exists(file) {
  return fs.promises.access(file).then(() => true, () => false)
}

async function commandAvailable(command, args = ['--version']) {
  try {
    const result = await exec(command, args, { timeout: 10_000, windowsHide: true })
    return { ok: true, output: `${result.stdout || ''}${result.stderr || ''}`.trim() }
  } catch (err) {
    return { ok: false, output: err.message || String(err) }
  }
}

async function firstWorkingCommand(candidates, args = ['--version']) {
  for (const candidate of candidates.filter(Boolean)) {
    const result = await commandAvailable(candidate, args)
    if (result.ok) return { ...result, command: candidate }
  }
  return { ok: false, output: 'not found' }
}

async function powershell(script) {
  return commandAvailable('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script])
}

function line(ok, label, detail = '') {
  const icon = ok ? 'PASS' : 'WARN'
  console.log(`${icon} ${label}${detail ? ` - ${detail}` : ''}`)
}

console.log('VD Agent clean VM QA preflight')
console.log('================================')

const installer = path.join(releaseDir, 'VD Agent Setup 1.1.0.exe')
const portable = path.join(releaseDir, 'VD Agent 1.1.0.exe')
const vsix = path.join(releaseDir, 'vd-agent-vscode-bridge-0.4.3.vsix')

line(await exists(installer), 'Windows installer artifact', installer)
line(await exists(portable), 'Windows portable artifact', portable)
line(await exists(vsix), 'VS Code bridge VSIX artifact', vsix)

const vboxCandidates = [
  'VBoxManage',
  path.join(process.env.ProgramFiles || '', 'Oracle', 'VirtualBox', 'VBoxManage.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Oracle', 'VirtualBox', 'VBoxManage.exe'),
]
const vbox = await firstWorkingCommand(vboxCandidates, ['--version'])
line(vbox.ok, 'VirtualBox CLI', vbox.ok ? `${vbox.output} (${vbox.command})` : 'not found')

const hyperv = await powershell('(Get-Command New-VM -ErrorAction SilentlyContinue) -ne $null')
line(hyperv.ok && /true/i.test(hyperv.output), 'Hyper-V PowerShell module', (hyperv.output || '').trim() || 'not found')

const vmName = process.env.VD_AGENT_QA_VM || ''
const vmUser = process.env.VD_AGENT_QA_VM_USER || ''
const vmPass = process.env.VD_AGENT_QA_VM_PASS || ''
const hasVmConfig = !!(vmName && vmUser && vmPass)
line(hasVmConfig, 'Configured QA VM', hasVmConfig ? vmName : 'set VD_AGENT_QA_VM, VD_AGENT_QA_VM_USER, VD_AGENT_QA_VM_PASS')

if (!hasVmConfig) {
  console.log('')
  console.log('Manual clean-machine QA path:')
  console.log('1. Create or start a clean Windows VM with VS Code installed.')
  console.log('2. Copy release artifacts into the VM.')
  console.log('3. Install VD Agent Setup 1.1.0.exe.')
  console.log('4. Install the VSIX with: code --install-extension vd-agent-vscode-bridge-0.4.3.vsix')
  console.log('5. Open a repo in both apps, export VS Code context, run smoke prompts for file open, diff preview, and exact edit. Restricted Mode supports active-editor export/autocomplete; trust the workspace for indexing and edit/apply commands.')
  if (requireVm) process.exit(1)
  process.exit(0)
}

console.log('')
console.log('VM execution is configured, but this script intentionally avoids making destructive VM changes automatically.')
console.log('Next automation step: add provider-specific copy/run commands for your chosen VM manager after you confirm the VM name and snapshot policy.')

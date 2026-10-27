/**
 * Generate explicit-path Windows/Ubuntu QA instructions.
 *
 * This is a checklist/staging evidence harness only. It never creates or
 * starts a VM, downloads an ISO, copies artifacts, reads credentials, or
 * deletes anything. The caller chooses both the artifact directory and output
 * checklist path.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(scriptPath), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const bridge = (pkg.build?.extraResources || []).find((item) => /\.vsix$/i.test(item?.to || ''))

function valueAfter(args, flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required`)
  return value
}

function fileInfo(target) {
  try {
    const stat = fs.statSync(target)
    return { exists: true, file: stat.isFile(), size: stat.size }
  } catch (error) {
    return { exists: false, file: false, size: 0, error: error?.code || 'UNKNOWN' }
  }
}

function expectedArtifacts(platform, version) {
  if (platform === 'windows') return [`PIT Agent Setup ${version}.exe`, `PIT Agent ${version}.exe`]
  return [`PIT Agent-${version}.AppImage`, `vd-agent_${version}_amd64.deb`]
}

function relativeOrAbsolute(target) {
  const relative = path.relative(repoRoot, target)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.replaceAll(path.sep, '/')
    : target
}

export function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const platform = required(valueAfter(argv, '--platform'), '--platform')
  if (!['windows', 'ubuntu'].includes(platform)) throw new Error('--platform must be windows or ubuntu')
  const artifactRoot = path.resolve(required(valueAfter(argv, '--artifacts'), '--artifacts'))
  const output = path.resolve(required(valueAfter(argv, '--output'), '--output'))
  const iso = valueAfter(argv, '--iso') ? path.resolve(valueAfter(argv, '--iso')) : null
  return { platform, artifactRoot, output, iso }
}

export function inspectVmQaInputs({ platform, artifactRoot, iso = null, version = pkg.version }) {
  const expected = expectedArtifacts(platform, version)
  const artifacts = expected.map((name) => {
    const target = path.join(artifactRoot, name)
    const info = fileInfo(target)
    return { name, path: target, ...info }
  })
  const vsixPath = path.resolve(repoRoot, bridge?.from || '')
  const vsix = { path: vsixPath, ...fileInfo(vsixPath) }
  const isoEvidence = iso ? { path: iso, ...fileInfo(iso) } : null
  return { platform, version, artifacts, vsix, iso: isoEvidence }
}

function checklist({ evidence, output }) {
  const artifactLines = evidence.artifacts.map((item) => `- [${item.file && item.size > 0 ? 'x' : ' '}] ${item.name} — \`${item.path}\``).join('\n')
  const platformName = evidence.platform === 'windows' ? 'Windows 10/11' : 'Ubuntu 22.04 or later'
  const resourcesHint = evidence.platform === 'windows'
    ? `${evidence.artifacts[0]?.path || '<installer>'} unpacked resources`
    : `${evidence.artifacts[0]?.path || '<AppImage>'} extracted resources`
  return `# PIT Agent ${evidence.platform} clean-machine QA harness

Generated for package version **${evidence.version}**.

This file is a test plan, not a VM controller. It does not create/start/delete
VMs, install operating systems, download ISOs, copy files, or handle secrets.
Run each step manually with the explicit paths below.

## Evidence before the VM

- Platform target: **${platformName}**
- Artifact directory: \`${evidence.artifacts[0] ? path.dirname(evidence.artifacts[0].path) : '<missing>'}\`
- Checklist output: \`${output}\`
- Source VSIX: \`${evidence.vsix.path}\` (${evidence.vsix.file && evidence.vsix.size > 0 ? `${evidence.vsix.size} bytes` : 'missing or empty'})
${evidence.iso ? `- ISO evidence (not downloaded or modified): \`${evidence.iso.path}\` (${evidence.iso.file && evidence.iso.size > 0 ? `${evidence.iso.size} bytes` : 'missing or empty'})` : '- ISO: not supplied; provide one manually to the VM manager if your test plan requires it.'}

### Expected package artifacts

${artifactLines}

## Required gates

1. Run \`npm run release:preflight\` and review any EPERM, active-artifact,
   stale-temp, path-length, or source-VSIX warning. Use its unique \`.work\`
   recommendation for a retry rather than deleting an existing output.
2. Run \`npm run release:update-fixture\` to validate the local metadata-only
   update fixture. It does not need an installer.
3. Run the packaged capability validator against the unpacked resources at an
   explicit path after packaging:

   \`node scripts/validate-packaged-capabilities.mjs --platform ${evidence.platform === 'windows' ? 'win32' : 'linux'} --resources <explicit-resources-path>\`

   Expected resources hint: \`${resourcesHint}\`.

## Manual ${platformName} checks

- [ ] Finish OS setup in a clean VM or approved clean machine.
- [ ] Install the package from the explicit artifact path above.
- [ ] Launch from the installed shortcut/menu where applicable.
- [ ] Open a workspace, verify renderer, terminal, settings persistence, and
      restart/history behavior.
- [ ] Verify the VS Code bridge only after installing VS Code separately and
      loading the explicit source VSIX path.
- [ ] Exercise one small bridge export/status flow and one packaged capability
      gate result.
- [ ] Uninstall the app and confirm user data remains unless manually removed.

## Safety record

- No VM manager was invoked by this harness.
- No ISO was downloaded or mounted by this harness.
- No credentials are accepted or read by this harness.
- No user data, artifacts, or directories are deleted or overwritten.
`
}

export function generateVmChecklist({ evidence, output }) {
  const parent = path.dirname(output)
  fs.mkdirSync(parent, { recursive: true })
  let handle
  try {
    handle = fs.openSync(output, 'wx')
    fs.writeFileSync(handle, checklist({ evidence, output }), 'utf8')
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Refusing to overwrite existing VM checklist: ${output}`)
    throw error
  } finally {
    if (handle !== undefined) {
      try { fs.closeSync(handle) } catch {}
    }
  }
  return output
}

async function main() {
  let options
  try { options = parseArguments(process.argv.slice(2)) } catch (error) {
    console.error(`ERROR: ${error.message}`)
    console.error('Usage: node scripts/vm-qa-harness.mjs --platform windows|ubuntu --artifacts <explicit-dir> --output <explicit-checklist> [--iso <explicit-existing-iso>]')
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log('Usage: node scripts/vm-qa-harness.mjs --platform windows|ubuntu --artifacts <explicit-dir> --output <explicit-checklist> [--iso <explicit-existing-iso>]')
    console.log('Evidence-only harness: never creates VMs, downloads ISOs, reads credentials, deletes, or overwrites.')
    return
  }
  const evidence = inspectVmQaInputs(options)
  try {
    const output = generateVmChecklist({ evidence, output: options.output })
    console.log(`Generated ${options.platform} VM QA checklist: ${relativeOrAbsolute(output)}`)
    const missing = [...evidence.artifacts.filter((item) => !item.file || item.size <= 0), ...(evidence.vsix.file && evidence.vsix.size > 0 ? [] : [evidence.vsix])]
    if (missing.length > 0) process.exitCode = 1
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    process.exitCode = 1
  }
}

if (path.resolve(process.argv[1] || '') === scriptPath) await main()

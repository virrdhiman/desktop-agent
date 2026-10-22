/**
 * Package an already-built app into a fresh, unique .work output directory.
 *
 * This is the safe Node-only alternative to retrying Electron Builder in a
 * possibly locked release/ directory. It never cleans or deletes output.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { repoRoot, recommendedWorkOutput, runPackagePreflight } from './package-preflight.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const builderCli = path.join(repoRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')

function valueAfter(args, flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function platformFlag(value) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'win' || normalized === 'win32' || normalized === 'windows') return '--win'
  if (normalized === 'mac' || normalized === 'darwin' || normalized === 'macos') return '--mac'
  if (normalized === 'linux' || normalized === 'ubuntu') return '--linux'
  throw new Error('--platform must be win32, darwin, or linux')
}

function relativeOutput(value) {
  const output = value || path.relative(repoRoot, recommendedWorkOutput({ root: repoRoot, version: pkg.version }))
  if (path.isAbsolute(output) || output.split(/[\\/]/).includes('..')) throw new Error('--output must be a repository-relative path')
  const resolved = path.resolve(repoRoot, output)
  const relative = path.relative(repoRoot, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('--output must stay inside the repository')
  if (!relative.replaceAll(path.sep, '/').startsWith('.work/')) throw new Error('--output must be under .work/ so packaging never reuses release/')
  return { output, resolved }
}

function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  return {
    platform: valueAfter(argv, '--platform') || process.platform,
    output: relativeOutput(valueAfter(argv, '--output')),
    extra: argv.filter((arg, index) => !['--platform', '--output'].includes(arg) && argv[index - 1] !== '--platform' && argv[index - 1] !== '--output'),
  }
}

function packageArtifacts(output) {
  if (!fs.existsSync(output)) return []
  return fs.readdirSync(output, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(exe|msi|dmg|pkg|zip|appimage|deb|rpm|snap)$/i.test(entry.name))
    .map((entry) => entry.name)
}

function runBuilder({ platform, output, extra }) {
  return new Promise((resolve, reject) => {
    const args = [builderCli, platformFlag(platform), `--config.directories.output=${path.relative(repoRoot, output).replaceAll(path.sep, '/')}`, '--publish', 'never', ...extra]
    const child = spawn(process.execPath, args, { cwd: repoRoot, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`electron-builder exited with ${code ?? `signal ${signal}`}`))
    })
  })
}

export { parseArguments, relativeOutput }

async function main() {
  let options
  try { options = parseArguments(process.argv.slice(2)) } catch (error) {
    console.error(`ERROR: ${error.message}`)
    console.error('Usage: node scripts/package-release.mjs --platform win32|darwin|linux [--output .work/package-...]')
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log('Usage: node scripts/package-release.mjs --platform win32|darwin|linux [--output .work/package-...]')
    console.log('Runs read-only preflight first and never cleans or deletes an output directory.')
    return
  }
  const preflight = await runPackagePreflight({ root: repoRoot, pkg, outputPath: options.output.output, recommendedOutput: options.output.output })
  for (const item of preflight.checks) console.log(`${item.level.padEnd(5)} ${item.label}${item.detail ? ` - ${item.detail}` : ''}`)
  if (!preflight.ok) {
    console.error('Package stopped: fix the preflight failures before invoking Electron Builder.')
    process.exitCode = 1
    return
  }
  if (!fs.existsSync(builderCli)) {
    console.error(`Package stopped: electron-builder CLI is missing at ${builderCli}`)
    process.exitCode = 1
    return
  }
  try {
    await runBuilder({ platform: options.platform, output: options.output.resolved, extra: options.extra })
    const artifacts = packageArtifacts(options.output.resolved)
    if (options.extra.includes('--dir')) {
      const unpacked = path.join(options.output.resolved, 'win-unpacked')
      if (!fs.existsSync(unpacked)) throw new Error(`No unpacked application directory was produced in ${options.output.output}`)
      console.log(`Packaged unpacked application in ${options.output.output}`)
    } else {
      const versioned = artifacts.filter((name) => name.includes(pkg.version))
      if (!versioned.length) throw new Error(`No versioned package artifact containing ${pkg.version} was found in ${options.output.output}`)
      console.log(`Packaged ${versioned.join(', ')} in ${options.output.output}`)
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    process.exitCode = 1
  }
}

if (path.resolve(process.argv[1] || '') === scriptPath) await main()

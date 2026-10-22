/** Generate a non-destructive macOS QA checklist in ignored .work/. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(scriptPath), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const templatePath = path.join(root, 'docs', 'mac-test-template.md')

function valueAfter(args, flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function fileStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-')
}

function insideRoot(target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function repoRelative(value, label) {
  if (!value || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    throw new Error(`${label} must be repository-relative and explicit`)
  }
  return path.resolve(root, value)
}

export function parseArguments(argv, now = new Date()) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const outputArg = valueAfter(argv, '--output') || `.work/mac-test/macos-${pkg.version}-${fileStamp(now)}-${process.pid}.md`
  const artifactRoot = valueAfter(argv, '--artifact-root') || 'release'
  const appPath = valueAfter(argv, '--app-path') || `${artifactRoot}/mac/VD Agent.app/Contents/MacOS/VD Agent`
  const resourcesPath = valueAfter(argv, '--resources') || `${artifactRoot}/mac/VD Agent.app/Contents/Resources`
  const output = repoRelative(outputArg, '--output')
  if (!insideRoot(output)) throw new Error('--output must remain inside the repository')
  if (!outputArg.replaceAll('\\', '/').startsWith('.work/')) throw new Error('--output must be under .work/')
  return { output, outputArg, artifactRoot, appPath, resourcesPath }
}

function render(template, options) {
  return template
    .replaceAll('{{VERSION}}', pkg.version)
    .replaceAll('{{ARTIFACT_ROOT}}', options.artifactRoot)
    .replaceAll('{{APP_PATH}}', options.appPath)
    .replaceAll('{{RESOURCES_PATH}}', options.resourcesPath)
}

export function generateChecklist({ options, template = fs.readFileSync(templatePath, 'utf8') }) {
  const parent = path.dirname(options.output)
  fs.mkdirSync(parent, { recursive: true })
  let handle
  try {
    handle = fs.openSync(options.output, 'wx')
    fs.writeFileSync(handle, render(template, options), 'utf8')
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Refusing to overwrite existing checklist: ${options.output}`)
    throw error
  } finally {
    if (handle !== undefined) {
      try { fs.closeSync(handle) } catch {}
    }
  }
  return options.output
}

async function main() {
  let options
  try { options = parseArguments(process.argv.slice(2)) } catch (error) {
    console.error(`ERROR: ${error.message}`)
    console.error('Usage: node scripts/generate-mac-test-checklist.mjs [--output .work/mac-test/checklist.md] [--artifact-root release] [--app-path <path>] [--resources <path>]')
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log('Usage: node scripts/generate-mac-test-checklist.mjs [--output .work/mac-test/checklist.md] [--artifact-root release] [--app-path <path>] [--resources <path>]')
    console.log('Writes one new checklist under .work/ and never overwrites or deletes an existing file.')
    return
  }
  try {
    const output = generateChecklist({ options })
    console.log(`Generated macOS QA checklist: ${path.relative(root, output).replaceAll(path.sep, '/')}`)
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    process.exitCode = 1
  }
}

if (path.resolve(process.argv[1] || '') === scriptPath) await main()

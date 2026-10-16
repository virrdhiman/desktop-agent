/** Validate that packaged builds have a usable electron-updater publication path. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const checkArtifacts = args.has('--artifacts')
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
const results = []
const add = (level, label, detail = '') => results.push({ level, label, detail })
const pass = (label, detail = '') => add('PASS', label, detail)
const fail = (label, detail = '') => add('FAIL', label, detail)
const text = (file) => fs.readFileSync(path.join(repo, file), 'utf8')

const publish = pkg.build?.publish
if (publish?.provider === 'github' && publish.owner && publish.repo) {
  pass('updater publish target', `${publish.owner}/${publish.repo}`)
} else {
  fail('updater publish target', 'build.publish must define a GitHub owner and repo')
}
if (typeof pkg.build?.electronUpdaterCompatibility === 'string') {
  pass('electron-updater compatibility', pkg.build.electronUpdaterCompatibility)
} else {
  fail('electron-updater compatibility', 'Missing build.electronUpdaterCompatibility')
}

const updateHandler = text('electron/handlers/updates.ts')
if (/app\.isPackaged/.test(updateHandler) && /checkForUpdates\(\)/.test(updateHandler)) {
  pass('packaged update guard', 'Update checks are restricted to packaged builds')
} else {
  fail('packaged update guard', 'Update handler must guard checkForUpdates with app.isPackaged')
}
const workflow = text('.github/workflows/release.yml')
if (/release\/\*/.test(workflow) && /--publish never/.test(workflow)) {
  pass('release metadata upload', 'electron-builder metadata is retained and uploaded')
} else {
  fail('release metadata upload', 'Workflow must retain latest*.yml metadata and avoid implicit publishing')
}
if (/latest\*?\.yml|latest.*yml/i.test(text('docs/RELEASE_CHECKLIST.md'))) {
  pass('update QA documentation')
} else {
  fail('update QA documentation', 'Release checklist must mention latest update metadata')
}
if (pkg.scripts?.['release:update-fixture'] && /release:update-fixture|update-feed-qa/i.test(text('docs/RELEASE_CHECKLIST.md'))) {
  pass('local update-feed fixture harness', 'Metadata-only feed QA is available without an installer')
} else {
  fail('local update-feed fixture harness', 'Add release:update-fixture and document the metadata-only fixture')
}

if (checkArtifacts) {
  const releaseDir = path.join(repo, 'release')
  const metadata = fs.existsSync(releaseDir)
    ? fs.readdirSync(releaseDir).filter((name) => /^latest(?:-.*)?\.yml$/i.test(name))
    : []
  if (metadata.length === 0) {
    fail('update metadata artifacts', 'No latest*.yml found in release/')
  } else {
    const invalid = metadata.filter((name) => !/^version:\s*['"]?\d+\.\d+\.\d+/m.test(fs.readFileSync(path.join(releaseDir, name), 'utf8')))
    if (invalid.length) fail('update metadata artifacts', `Missing version in ${invalid.join(', ')}`)
    else pass('update metadata artifacts', metadata.join(', '))
  }
}

const width = Math.max(...results.map((item) => item.level.length))
for (const item of results) console.log(`${item.level.padEnd(width)} ${item.label}${item.detail ? ` - ${item.detail}` : ''}`)
const failures = results.filter((item) => item.level === 'FAIL')
console.log(`\nUpdate preflight: ${results.length - failures.length} pass, ${failures.length} fail`)
if (failures.length) process.exit(1)

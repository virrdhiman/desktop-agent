/** Deterministic local project memory. No repository content is uploaded to build this summary. */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export type ProjectMemory = {
  version: 1
  workspace: string
  updatedAt: number
  fingerprint: string
  content: string
}

const MEMORY_FILES = ['package.json', 'README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'pyproject.toml', 'Cargo.toml', 'go.mod']

function memoryFile(baseDir: string, workspace: string) {
  const id = crypto.createHash('sha256').update(path.resolve(workspace)).digest('hex').slice(0, 24)
  return path.join(baseDir, `${id}.json`)
}

async function readText(file: string, max = 3000) {
  try { return (await fs.promises.readFile(file, 'utf-8')).slice(0, max) } catch { return '' }
}

async function fingerprint(workspace: string) {
  const parts: string[] = [path.resolve(workspace)]
  for (const name of MEMORY_FILES) {
    try {
      const stat = await fs.promises.stat(path.join(workspace, name))
      parts.push(`${name}:${stat.size}:${stat.mtimeMs}`)
    } catch {}
  }
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex')
}

export async function buildProjectMemory(workspace: string): Promise<ProjectMemory> {
  const root = path.resolve(workspace)
  const entries = await fs.promises.readdir(root, { withFileTypes: true })
  const visible = entries.filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
  const sections: string[] = [`Project root: ${root}`]

  const packageText = await readText(path.join(root, 'package.json'), 20_000)
  if (packageText) {
    try {
      const pkg = JSON.parse(packageText)
      const scripts = Object.entries(pkg.scripts || {}).map(([name, command]) => `${name}=${command}`).join(', ')
      const deps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})].slice(0, 30)
      sections.push(`Package: ${pkg.name || '(unnamed)'}${pkg.version ? ` v${pkg.version}` : ''}`)
      if (scripts) sections.push(`Commands: ${scripts}`)
      if (deps.length) sections.push(`Main dependencies: ${deps.join(', ')}`)
    } catch {}
  }

  const instructions = []
  for (const name of ['AGENTS.md', 'CONTRIBUTING.md']) {
    const text = await readText(path.join(root, name), 1800)
    if (text) instructions.push(`${name}:\n${text}`)
  }
  if (instructions.length) sections.push(`Repository instructions:\n${instructions.join('\n\n')}`)

  const readme = await readText(path.join(root, 'README.md'), 1800)
  if (readme) sections.push(`README excerpt:\n${readme}`)
  sections.push(`Top-level structure: ${visible.slice(0, 80).map((e) => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`).join(', ')}`)

  return {
    version: 1,
    workspace: root,
    updatedAt: Date.now(),
    fingerprint: await fingerprint(root),
    content: sections.join('\n\n').slice(0, 12_000),
  }
}

export async function loadProjectMemory(baseDir: string, workspace: string, force = false): Promise<ProjectMemory> {
  const target = memoryFile(baseDir, workspace)
  const currentFingerprint = await fingerprint(workspace)
  if (!force) {
    try {
      const stored = JSON.parse(await fs.promises.readFile(target, 'utf-8')) as ProjectMemory
      if (stored?.version === 1 && stored.workspace === path.resolve(workspace) && stored.fingerprint === currentFingerprint) return stored
    } catch {}
  }
  const memory = await buildProjectMemory(workspace)
  await fs.promises.mkdir(baseDir, { recursive: true })
  const tmp = `${target}.${process.pid}.tmp`
  await fs.promises.writeFile(tmp, JSON.stringify(memory, null, 2), 'utf-8')
  await fs.promises.rename(tmp, target)
  return memory
}

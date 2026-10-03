import fs from 'fs'
import path from 'path'
import { buildRepoMap, searchRepo, type RepoMapEntry, type RepoSearchHit } from './repoIndex'

type PlanFile = {
  path: string
  why: string
  score: number
  role: 'primary' | 'test' | 'doc' | 'config'
}

function roleFor(file: string, entry?: RepoMapEntry): PlanFile['role'] {
  const lower = file.toLowerCase()
  if (entry?.testLike || /\.(test|spec)\.[a-z0-9]+$/.test(lower) || /(^|\/)(__tests__|tests?)\//.test(lower)) return 'test'
  if (lower.endsWith('.md') || lower.includes('/docs/')) return 'doc'
  if (/(^|\/)(package\.json|tsconfig|vite\.config|electron-builder|\.github|eslint|vitest)/.test(lower)) return 'config'
  return 'primary'
}

function formatHit(hit: RepoSearchHit): string {
  return `${hit.path}:${hit.line} score=${hit.score} (${hit.reason})`
}

async function packageScripts(root: string): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await fs.promises.readFile(path.join(root, 'package.json'), 'utf-8'))
    return pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {}
  } catch {
    return {}
  }
}

function verificationCommands(scripts: Record<string, string>, files: PlanFile[]): string[] {
  const commands: string[] = []
  if (scripts.lint) commands.push('npm run lint')
  if (scripts.test) {
    const focused = files.find((file) => file.role === 'test')
    commands.push(focused ? `npx vitest run ${focused.path}` : 'npm test')
  }
  if (scripts.build) commands.push('npm run build')
  if (scripts.smoke && files.some((file) => file.path.includes('electron') || file.path.includes('src/'))) commands.push('npm run smoke')
  return [...new Set(commands)].slice(0, 4)
}

function compactImports(entry?: RepoMapEntry): string {
  if (!entry?.imports.length) return ''
  const shown = entry.imports.slice(0, 4).join(', ')
  return ` imports: ${shown}${entry.imports.length > 4 ? ', ...' : ''}`
}

export async function planRepoChange(root: string, query: string, limit = 12): Promise<string> {
  const workspace = path.resolve(root)
  const trimmed = query.trim()
  if (!trimmed) return 'repo_plan requires a query.'

  const [map, hits, scripts] = await Promise.all([
    buildRepoMap(workspace, 600),
    searchRepo(workspace, trimmed, Math.max(20, limit * 3)),
    packageScripts(workspace),
  ])
  const entries = new Map(map.map((entry) => [entry.path, entry]))
  const files = new Map<string, PlanFile>()

  for (const hit of hits) {
    const entry = entries.get(hit.path)
    const role = roleFor(hit.path, entry)
    const prev = files.get(hit.path)
    const why = `${formatHit(hit)}${compactImports(entry)}`
    if (!prev || hit.score > prev.score) files.set(hit.path, { path: hit.path, why, score: hit.score, role })
  }

  const tokenHits = trimmed.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3)
  for (const entry of map) {
    if (files.size >= limit * 2) break
    const haystack = `${entry.path} ${entry.symbols.join(' ')} ${entry.imports.join(' ')}`.toLowerCase()
    const matched = tokenHits.filter((token) => haystack.includes(token)).length
    if (matched === 0 || files.has(entry.path)) continue
    files.set(entry.path, {
      path: entry.path,
      why: `symbol/path/import match (${matched} token${matched === 1 ? '' : 's'}): ${entry.symbols.slice(0, 6).join(', ') || 'no exported symbols'}${compactImports(entry)}`,
      score: matched * 10,
      role: roleFor(entry.path, entry),
    })
  }

  const ranked = [...files.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit)
  const byRole = (role: PlanFile['role']) => ranked.filter((file) => file.role === role)
  const commands = verificationCommands(scripts, ranked)
  const areas = [...new Set(ranked.map((file) => file.path.split('/')[0]).filter(Boolean))].slice(0, 8)

  return [
    `Repo plan for: ${trimmed}`,
    '',
    `Likely areas: ${areas.length ? areas.join(', ') : 'No strong area found'}`,
    '',
    'Primary files to inspect/change:',
    ...(byRole('primary').length ? byRole('primary').map((file, i) => `${i + 1}. ${file.path} - ${file.why}`) : ['- No primary implementation files ranked. Use repo_search with a narrower query.']),
    '',
    'Tests and verification files:',
    ...(byRole('test').length ? byRole('test').map((file, i) => `${i + 1}. ${file.path} - ${file.why}`) : ['- No direct test file found yet. Add or update one near the changed module when behavior changes.']),
    '',
    'Docs/config likely affected:',
    ...(byRole('doc').concat(byRole('config')).length ? byRole('doc').concat(byRole('config')).map((file, i) => `${i + 1}. ${file.path} - ${file.why}`) : ['- No obvious docs/config files ranked.']),
    '',
    'Suggested workflow:',
    '1. Read the top primary files and any matching tests before editing.',
    '2. Use preview_edits for multi-file or risky replacements, then apply exact edits only after the preview matches intent.',
    '3. Run the narrowest test first, then the broader commands below.',
    '',
    'Verification commands:',
    ...(commands.length ? commands.map((command) => `- ${command}`) : ['- No npm verification scripts found. Inspect project docs for the right checks.']),
  ].join('\n')
}


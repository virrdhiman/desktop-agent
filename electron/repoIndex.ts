import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export type RepoSearchHit = {
  path: string
  line: number
  score: number
  reason: string
  snippet: string
}

export type RepoMapEntry = {
  path: string
  bytes: number
  language: string
  symbols: string[]
  imports: string[]
  testLike: boolean
}

export type RepoIndexStats = {
  root: string
  files: number
  bytes: number
  fingerprint: string
  updatedAt: number
  cached: boolean
  watching?: boolean
  reusedFiles?: number
  updatedFiles?: number
}

type IndexedFile = RepoMapEntry & {
  absPath: string
  modifiedMs: number
  sourceBytes: number
  text: string
  tokens: string[]
  vector: Map<string, number>
}

type RepoIndexCache = {
  fingerprint: string
  updatedAt: number
  files: IndexedFile[]
  reusedFiles: number
  updatedFiles: number
}

type RepoIndexWatcher = {
  root: string
  close: () => void
  timer?: NodeJS.Timeout
  lastEventAt: number
}

const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.scss', '.html',
  '.py', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.rb', '.php', '.sh', '.ps1', '.sql', '.yaml', '.yml', '.toml', '.ini', '.env',
])
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release', 'coverage', '.vite', '.next', 'out', 'build', 'target'])
const MAX_FILE_BYTES = 500_000
const MAX_FILES = 2500
const repoCaches = new Map<string, RepoIndexCache>()
const repoWatchers = new Map<string, RepoIndexWatcher>()

function languageFor(file: string): string {
  const ext = path.extname(file).slice(1).toLowerCase()
  return ext || 'text'
}

function isTextFile(file: string): boolean {
  const ext = path.extname(file).toLowerCase()
  return TEXT_EXTS.has(ext)
}

function normalizeText(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.$/-]+/g, ' ')
    .toLowerCase()
}

function tokenize(text: string): string[] {
  return [...new Set(normalizeText(text).split(/[^a-z0-9]+/).filter((token) => token.length >= 2))]
}

function vector(tokens: string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const token of tokens) out.set(token, (out.get(token) || 0) + 1)
  return out
}

function cosine(query: Map<string, number>, doc: Map<string, number>): number {
  let dot = 0
  let qNorm = 0
  let dNorm = 0
  for (const value of query.values()) qNorm += value * value
  for (const value of doc.values()) dNorm += value * value
  for (const [token, q] of query) dot += q * (doc.get(token) || 0)
  return qNorm > 0 && dNorm > 0 ? dot / (Math.sqrt(qNorm) * Math.sqrt(dNorm)) : 0
}

function relative(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, '/')
}

function extractSymbols(text: string, max = 20): string[] {
  const symbols = new Set<string>()
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g,
    /^\s*([A-Za-z_$][\w$-]+)\s*:/gm,
    /^\s*def\s+([A-Za-z_][\w]*)/gm,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) && symbols.size < max) symbols.add(match[1])
  }
  return [...symbols]
}

function extractImports(text: string, max = 12): string[] {
  const imports = new Set<string>()
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\(['"]([^'"]+)['"]\)/g,
    /^\s*from\s+([A-Za-z0-9_./-]+)\s+import\b/gm,
    /^\s*import\s+([A-Za-z0-9_./-]+)/gm,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) && imports.size < max) imports.add(match[1])
  }
  return [...imports]
}

function isTestLike(file: string): boolean {
  const normalized = file.replace(/\\/g, '/').toLowerCase()
  return /(^|\/)(__tests__|tests?|specs?)\//.test(normalized) || /\.(test|spec)\.[a-z0-9]+$/.test(normalized)
}

async function walkTextFiles(root: string): Promise<{ file: string; size: number; modifiedMs: number }[]> {
  const files: { file: string; size: number; modifiedMs: number }[] = []
  async function walk(dir: string, depth: number) {
    if (files.length >= MAX_FILES || depth > 10) return
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path.join(dir, entry.name), depth + 1)
        continue
      }
      const file = path.join(dir, entry.name)
      if (!isTextFile(file)) continue
      const stat = await fs.promises.stat(file).catch(() => null)
      if (stat && stat.size <= MAX_FILE_BYTES) files.push({ file, size: stat.size, modifiedMs: Math.round(stat.mtimeMs) })
      if (files.length >= MAX_FILES) break
    }
  }
  await walk(path.resolve(root), 0)
  return files
}

function fingerprintFiles(workspace: string, files: { file: string; size: number; modifiedMs: number }[]): string {
  const hash = crypto.createHash('sha1')
  for (const item of files) hash.update(`${relative(workspace, item.file)}:${item.size}:${item.modifiedMs}\n`)
  return hash.digest('hex')
}

export async function buildRepoIndex(root: string, force = false): Promise<RepoIndexStats> {
  const workspace = path.resolve(root)
  const candidates = await walkTextFiles(workspace)
  const fingerprint = fingerprintFiles(workspace, candidates)
  const existing = repoCaches.get(workspace)
  if (!force && existing?.fingerprint === fingerprint) {
    return indexStats(workspace, existing, true)
  }

  const files: IndexedFile[] = []
  const previous = new Map(existing?.files.map((file) => [file.absPath, file]) || [])
  let reusedFiles = 0
  for (const item of candidates) {
    const cachedFile = previous.get(item.file)
    if (!force && cachedFile && cachedFile.sourceBytes === item.size && cachedFile.modifiedMs === item.modifiedMs) {
      files.push(cachedFile)
      reusedFiles += 1
      continue
    }
    const text = await fs.promises.readFile(item.file, 'utf-8').catch(() => '')
    const symbols = extractSymbols(text, 20)
    const imports = extractImports(text, 12)
    const tokens = tokenize(`${relative(workspace, item.file)} ${symbols.join(' ')} ${imports.join(' ')} ${text.slice(0, 80_000)}`)
    files.push({
      path: relative(workspace, item.file),
      absPath: item.file,
      bytes: Buffer.byteLength(text),
      language: languageFor(item.file),
      symbols,
      imports,
      testLike: isTestLike(item.file),
      modifiedMs: item.modifiedMs,
      sourceBytes: item.size,
      text,
      tokens,
      vector: vector(tokens),
    })
  }

  const cache: RepoIndexCache = { fingerprint, updatedAt: Date.now(), files, reusedFiles, updatedFiles: files.length - reusedFiles }
  repoCaches.set(workspace, cache)
  return indexStats(workspace, cache, false)
}

export async function repoIndexStats(root: string): Promise<RepoIndexStats> {
  return buildRepoIndex(root)
}

export async function startRepoIndexWatcher(root: string): Promise<RepoIndexStats> {
  const workspace = path.resolve(root)
  if (repoWatchers.has(workspace)) {
    const stats = await buildRepoIndex(workspace)
    return { ...stats, watching: true }
  }

  const schedule = () => {
    const watcher = repoWatchers.get(workspace)
    if (!watcher) return
    watcher.lastEventAt = Date.now()
    if (watcher.timer) clearTimeout(watcher.timer)
    watcher.timer = setTimeout(() => {
      void buildRepoIndex(workspace).catch(() => {})
    }, 750)
  }

  let close = () => {}
  try {
    const watcher = fs.watch(workspace, { recursive: true }, (_event, filename) => {
      const name = String(filename || '')
      if (!name || shouldIgnoreWatchEvent(name)) return
      schedule()
    })
    close = () => watcher.close()
  } catch {
    const interval = setInterval(schedule, 30_000)
    close = () => clearInterval(interval)
  }

  repoWatchers.set(workspace, { root: workspace, close, lastEventAt: Date.now() })
  const stats = await buildRepoIndex(workspace)
  return { ...stats, watching: true }
}

export function stopRepoIndexWatchers(): void {
  for (const watcher of repoWatchers.values()) {
    if (watcher.timer) clearTimeout(watcher.timer)
    watcher.close()
  }
  repoWatchers.clear()
}

function indexStats(workspace: string, cache: RepoIndexCache, cached: boolean): RepoIndexStats {
  return {
    root: workspace,
    files: cache.files.length,
    bytes: cache.files.reduce((sum, file) => sum + file.bytes, 0),
    fingerprint: cache.fingerprint,
    updatedAt: cache.updatedAt,
    cached,
    watching: repoWatchers.has(workspace),
    reusedFiles: cache.reusedFiles,
    updatedFiles: cache.updatedFiles,
  }
}

function shouldIgnoreWatchEvent(file: string): boolean {
  const normalized = file.replace(/\\/g, '/')
  if (normalized.includes('/')) {
    const parts = normalized.split('/')
    if (parts.some((part) => SKIP_DIRS.has(part))) return true
  }
  const base = path.basename(normalized)
  return base.startsWith('.') || !isTextFile(base)
}

async function indexedFiles(root: string): Promise<IndexedFile[]> {
  const workspace = path.resolve(root)
  await buildRepoIndex(workspace)
  return repoCaches.get(workspace)?.files || []
}

export async function buildRepoMap(root: string, limit = 200): Promise<RepoMapEntry[]> {
  const files = await indexedFiles(root)
  return files.slice(0, Math.max(1, limit)).map(({ path, bytes, language, symbols, imports, testLike }) => ({
    path,
    bytes,
    language,
    symbols: symbols.slice(0, 12),
    imports: imports.slice(0, 8),
    testLike,
  }))
}

export async function searchRepo(root: string, query: string, limit = 30): Promise<RepoSearchHit[]> {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []
  const queryVector = vector(tokens)
  const hits: RepoSearchHit[] = []
  for (const file of await indexedFiles(root)) {
    const relLower = normalizeText(file.path)
    const symbolText = normalizeText(file.symbols.join(' '))
    const semanticScore = Math.round(cosine(queryVector, file.vector) * 25)
    const pathScore = tokens.filter((token) => relLower.includes(token)).length * 12
    const symbolScore = tokens.filter((token) => symbolText.includes(token)).length * 10
    const lines = file.text.split(/\r?\n/)
    let bestLine = 1
    let bestScore = pathScore + symbolScore + semanticScore
    let bestReason = [pathScore ? 'path' : '', symbolScore ? 'symbol' : '', semanticScore ? 'semantic' : ''].filter(Boolean).join('+')
    for (let i = 0; i < lines.length; i++) {
      const lineLower = normalizeText(lines[i])
      const matched = tokens.filter((token) => lineLower.includes(token)).length
      if (matched === 0) continue
      const score = pathScore + symbolScore + semanticScore + matched * 5 + Math.max(0, 4 - Math.floor(lines[i].length / 80))
      if (score > bestScore) {
        bestScore = score
        bestLine = i + 1
        bestReason = [pathScore ? 'path' : '', symbolScore ? 'symbol' : '', semanticScore ? 'semantic' : '', 'content'].filter(Boolean).join('+')
      }
    }
    if (bestScore > 0) {
      const from = Math.max(0, bestLine - 2)
      const to = Math.min(lines.length, bestLine + 1)
      const snippet = lines.slice(from, to).map((line, index) => `${from + index + 1}: ${line}`).join('\n')
      hits.push({ path: file.path, line: bestLine, score: bestScore, reason: bestReason || 'match', snippet })
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, Math.max(1, limit))
}

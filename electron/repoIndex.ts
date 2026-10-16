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
  referencedBy?: string[]
}

export type RepoCodeHit = { path: string; line: number; column: number; snippet: string }
export type RepoIndexStatus = {
  state: 'idle' | 'indexing' | 'failed'
  root: string
  files: number
  total?: number
  bytes?: number
  durationMs?: number
  error?: string
}

export type RepoSymbolDefinition = { symbol: string; path: string; line: number }
export type RepoSymbolReference = { path: string; line: number; symbol: string; definition: string }
export type RepoSymbolEdge = { from: string; to: string; kind: 'import'; symbols: string[] }
export type RepoSymbolGraph = { definitions: RepoSymbolDefinition[]; references: RepoSymbolReference[]; edges: RepoSymbolEdge[] }

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
  durationMs?: number
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
const MAX_FILES = 5000
const MAX_TOKEN_BYTES = 80_000
const repoCaches = new Map<string, RepoIndexCache>()
const repoWatchers = new Map<string, RepoIndexWatcher>()
const indexStatusListeners = new Set<(status: RepoIndexStatus) => void>()

export function onRepoIndexStatus(listener: (status: RepoIndexStatus) => void): () => void {
  indexStatusListeners.add(listener)
  return () => indexStatusListeners.delete(listener)
}

function emitIndexStatus(status: RepoIndexStatus): void {
  for (const listener of indexStatusListeners) {
    try { listener(status) } catch { /* status reporting must not break indexing */ }
  }
}

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

type IgnoreRule = { pattern: string; negated: boolean; directory: boolean }

function globRegExp(pattern: string): RegExp {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          source += '(?:.*/)?'
          i += 2
        } else {
          source += '.*'
          i++
        }
      } else source += '[^/]*'
    } else if (char === '?') source += '[^/]'
    else source += /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char
  }
  return new RegExp(`^${source}$`, 'i')
}

function ignoredByGitignore(relativePath: string, isDirectory: boolean, rules: IgnoreRule[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '')
  let ignored = false
  for (const rule of rules) {
    if (rule.directory && !isDirectory && !normalized.startsWith(`${rule.pattern}/`)) continue
    const parts = normalized.split('/')
    const target = rule.pattern.includes('/') ? normalized : parts[parts.length - 1] || normalized
    if (globRegExp(rule.pattern).test(target) || (rule.directory && normalized.startsWith(`${rule.pattern}/`))) ignored = !rule.negated
  }
  return ignored
}

async function readGitignore(root: string): Promise<IgnoreRule[]> {
  const content = await fs.promises.readFile(path.join(root, '.gitignore'), 'utf8').catch(() => '')
  return content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const negated = line.startsWith('!')
    let pattern = (negated ? line.slice(1) : line).replace(/^\//, '').replace(/\/$/, '')
    return { pattern, negated, directory: /\/$/.test(negated ? line.slice(1) : line) }
  }).filter((rule) => rule.pattern && !rule.pattern.startsWith('['))
}

function importedSymbols(text: string, module: string): string[] {
  const escaped = module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`import\\s+(.+?)\\s+from\\s+['"]${escaped}['"]`))
  if (!match) return []
  return [...match[1].matchAll(/\b[A-Za-z_$][\w$]*\b/g)].map((item) => item[0]).filter((name) => !['as', 'type'].includes(name)).slice(0, 20)
}

function isTestLike(file: string): boolean {
  const normalized = file.replace(/\\/g, '/').toLowerCase()
  return /(^|\/)(__tests__|tests?|specs?)\//.test(normalized) || /\.(test|spec)\.[a-z0-9]+$/.test(normalized)
}

function insideRoot(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

async function walkTextFiles(root: string): Promise<{ file: string; size: number; modifiedMs: number }[]> {
  const files: { file: string; size: number; modifiedMs: number }[] = []
  const workspace = path.resolve(root)
  const rules = await readGitignore(workspace)
  const realRoot = await fs.promises.realpath(workspace).catch(() => workspace)
  async function walk(dir: string, depth: number) {
    if (files.length >= MAX_FILES || depth > 10) return
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const file = path.join(dir, entry.name)
      const relativePath = relative(workspace, file)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !ignoredByGitignore(relativePath, true, rules)) {
          const realDir = await fs.promises.realpath(file).catch(() => '')
          if (realDir && insideRoot(realRoot, realDir)) await walk(file, depth + 1)
        }
        continue
      }
      if (!isTextFile(file)) continue
      if (ignoredByGitignore(relativePath, false, rules)) continue
      const stat = await fs.promises.stat(file).catch(() => null)
      if (!stat || stat.size > MAX_FILE_BYTES) continue
      const realFile = await fs.promises.realpath(file).catch(() => '')
      if (!realFile || !insideRoot(realRoot, realFile)) continue
      files.push({ file, size: stat.size, modifiedMs: Math.round(stat.mtimeMs) })
      if (files.length >= MAX_FILES) break
    }
  }
  await walk(workspace, 0)
  return files.sort((a, b) => relative(workspace, a.file).localeCompare(relative(workspace, b.file)))
}

function fingerprintFiles(workspace: string, files: { file: string; size: number; modifiedMs: number }[]): string {
  const hash = crypto.createHash('sha1')
  for (const item of files) hash.update(`${relative(workspace, item.file)}:${item.size}:${item.modifiedMs}\n`)
  return hash.digest('hex')
}

function resolveImport(workspace: string, from: IndexedFile, specifier: string, files: IndexedFile[]): IndexedFile | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = path.resolve(path.dirname(from.absPath), specifier)
  const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].map((ext) => `${base}${ext}`), ...['index.ts', 'index.tsx', 'index.js'].map((name) => path.join(base, name))]
  return files.find((file) => candidates.some((candidate) => path.normalize(candidate) === path.normalize(file.absPath)))
}

export async function buildRepoSymbolGraph(root: string): Promise<RepoSymbolGraph> {
  const files = await indexedFiles(root)
  const definitions: RepoSymbolDefinition[] = []
  const bySymbol = new Map<string, RepoSymbolDefinition>()
  for (const file of files) {
    const lines = file.text.split(/\r?\n/)
    for (const symbol of file.symbols) {
      const line = Math.max(1, lines.findIndex((value) => new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(value)) + 1)
      const definition = { symbol, path: file.path, line }
      definitions.push(definition)
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, definition)
    }
  }
  const references: RepoSymbolReference[] = []
  const edges: RepoSymbolEdge[] = []
  for (const file of files) {
    for (const specifier of file.imports) {
      const target = resolveImport(path.resolve(root), file, specifier, files)
      if (!target) continue
      const symbols = importedSymbols(file.text, specifier).filter((symbol) => target.symbols.includes(symbol))
      if (symbols.length) edges.push({ from: file.path, to: target.path, kind: 'import', symbols })
      for (const symbol of symbols) {
        const definition = bySymbol.get(symbol)
        if (!definition || definition.path !== target.path) continue
        const line = file.text.split(/\r?\n/).findIndex((value) => value.includes(specifier)) + 1
        references.push({ path: file.path, line: Math.max(1, line), symbol, definition: definition.path })
        target.referencedBy = [...new Set([...(target.referencedBy || []), file.path])].slice(0, 50)
      }
    }
  }
  return { definitions, references, edges }
}

export async function buildRepoIndex(root: string, force = false): Promise<RepoIndexStats> {
  const workspace = path.resolve(root)
  const startedAt = Date.now()
  emitIndexStatus({ state: 'indexing', root: workspace, files: 0 })
  try {
    const candidates = await walkTextFiles(workspace)
    const fingerprint = fingerprintFiles(workspace, candidates)
    const existing = repoCaches.get(workspace)
    if (!force && existing?.fingerprint === fingerprint) {
      const stats = indexStats(workspace, existing, true)
      stats.durationMs = Date.now() - startedAt
      emitIndexStatus({ state: 'idle', root: workspace, files: stats.files, bytes: stats.bytes, durationMs: stats.durationMs })
      return stats
    }

    const files: IndexedFile[] = []
    const previous = new Map(existing?.files.map((file) => [file.absPath, file]) || [])
    let reusedFiles = 0
    for (const [index, item] of candidates.entries()) {
      const cachedFile = previous.get(item.file)
      if (!force && cachedFile && cachedFile.sourceBytes === item.size && cachedFile.modifiedMs === item.modifiedMs) {
        files.push(cachedFile)
        reusedFiles += 1
        emitIndexStatus({ state: 'indexing', root: workspace, files: index + 1, total: candidates.length, bytes: item.size })
        continue
      }
      const buffer = await fs.promises.readFile(item.file).catch(() => null)
      if (!buffer || buffer.includes(0)) continue
      const text = buffer.toString('utf-8')
      const symbols = extractSymbols(text, 20)
      const imports = extractImports(text, 12)
      const tokens = tokenize(`${relative(workspace, item.file)} ${symbols.join(' ')} ${imports.join(' ')} ${text.slice(0, MAX_TOKEN_BYTES)}`)
      files.push({
        path: relative(workspace, item.file),
        absPath: item.file,
        bytes: buffer.byteLength,
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
      emitIndexStatus({ state: 'indexing', root: workspace, files: index + 1, total: candidates.length, bytes: buffer.byteLength })
    }

    const cache: RepoIndexCache = { fingerprint, updatedAt: Date.now(), files, reusedFiles, updatedFiles: files.length - reusedFiles }
    repoCaches.set(workspace, cache)
    const stats = indexStats(workspace, cache, false)
    stats.durationMs = Date.now() - startedAt
    emitIndexStatus({ state: 'idle', root: workspace, files: stats.files, bytes: stats.bytes, durationMs: stats.durationMs })
    return stats
  } catch (error: any) {
    emitIndexStatus({ state: 'failed', root: workspace, files: 0, durationMs: Date.now() - startedAt, error: error?.message || String(error) })
    throw error
  }
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
    reusedFiles: cached ? cache.files.length : cache.reusedFiles,
    updatedFiles: cached ? 0 : cache.updatedFiles,
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
  await buildRepoSymbolGraph(root)
  return files.slice(0, Math.max(1, limit)).map(({ path, bytes, language, symbols, imports, testLike, referencedBy }) => ({
    path,
    bytes,
    language,
    symbols: symbols.slice(0, 12),
    imports: imports.slice(0, 8),
    testLike,
    ...(referencedBy?.length ? { referencedBy: referencedBy.slice(0, 50) } : {}),
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

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function symbolAt(text: string, line: number, column: number): string {
  const sourceLine = text.split(/\r?\n/)[Math.max(0, line - 1)] || ''
  const offset = Math.max(0, Math.min(sourceLine.length, column - 1))
  const left = sourceLine.slice(0, offset).match(/[A-Za-z_$][\w$]*$/)?.[0] || ''
  const right = sourceLine.slice(offset).match(/^[A-Za-z_$][\w$]*/)?.[0] || ''
  return `${left}${right}`
}

export async function searchCode(root: string, pattern: string, limit = 100): Promise<RepoCodeHit[]> {
  const query = String(pattern || '')
  if (!query) return []
  const matcher = (() => {
    try { return new RegExp(query, 'i') } catch { return null }
  })()
  const hits: RepoCodeHit[] = []
  for (const file of await indexedFiles(root)) {
    const lines = file.text.split(/\r?\n/)
    for (let index = 0; index < lines.length && hits.length < Math.max(1, limit); index++) {
      const line = lines[index]
      const match = matcher?.exec(line) || (line.toLowerCase().includes(query.toLowerCase()) ? { index: line.toLowerCase().indexOf(query.toLowerCase()) } : null)
      if (match) hits.push({ path: file.path, line: index + 1, column: match.index + 1, snippet: line.trim().slice(0, 500) })
    }
    if (hits.length >= Math.max(1, limit)) break
  }
  return hits
}

export async function goToRepoDefinition(root: string, filePath: string, line: number, column: number, requestedSymbol?: string): Promise<RepoSymbolDefinition | null> {
  const files = await indexedFiles(root)
  const absolute = path.resolve(root, filePath)
  const source = files.find((file) => path.normalize(file.absPath) === path.normalize(absolute))
  if (!source) return null
  const symbol = requestedSymbol || symbolAt(source.text, line, column)
  if (!symbol) return null
  const graph = await buildRepoSymbolGraph(root)
  return graph.definitions.find((definition) => definition.symbol === symbol) || null
}

export async function findRepoUsages(root: string, filePath: string, line: number, column: number, requestedSymbol?: string, limit = 250): Promise<RepoSymbolReference[]> {
  const files = await indexedFiles(root)
  const absolute = path.resolve(root, filePath)
  const source = files.find((file) => path.normalize(file.absPath) === path.normalize(absolute))
  if (!source) return []
  const symbol = requestedSymbol || symbolAt(source.text, line, column)
  if (!symbol) return []
  const graph = await buildRepoSymbolGraph(root)
  const definition = graph.definitions.find((item) => item.symbol === symbol)
  if (!definition) return []
  const pattern = new RegExp(`\\b${escaped(symbol)}\\b`, 'g')
  const usages: RepoSymbolReference[] = []
  for (const file of files) {
    const lines = file.text.split(/\r?\n/)
    for (let index = 0; index < lines.length && usages.length < Math.max(1, limit); index++) {
      if (!pattern.test(lines[index])) { pattern.lastIndex = 0; continue }
      pattern.lastIndex = 0
      usages.push({ path: file.path, line: index + 1, symbol, definition: definition.path })
    }
    if (usages.length >= Math.max(1, limit)) break
  }
  return usages
}

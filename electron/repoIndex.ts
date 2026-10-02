import fs from 'fs'
import path from 'path'

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
}

const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.scss', '.html',
  '.py', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.rb', '.php', '.sh', '.ps1', '.sql', '.yaml', '.yml', '.toml', '.ini', '.env',
])
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release', 'coverage', '.vite', '.next', 'out', 'build', 'target'])
const MAX_FILE_BYTES = 500_000
const MAX_FILES = 2500

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

async function walkTextFiles(root: string): Promise<string[]> {
  const files: string[] = []
  async function walk(dir: string, depth: number) {
    if (files.length >= MAX_FILES || depth > 10) return
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path.join(dir, entry.name), depth + 1)
        continue
      }
      const file = path.join(dir, entry.name)
      if (!isTextFile(file)) continue
      const stat = await fs.promises.stat(file).catch(() => null)
      if (stat && stat.size <= MAX_FILE_BYTES) files.push(file)
      if (files.length >= MAX_FILES) break
    }
  }
  await walk(path.resolve(root), 0)
  return files
}

export async function buildRepoMap(root: string, limit = 200): Promise<RepoMapEntry[]> {
  const workspace = path.resolve(root)
  const files = await walkTextFiles(workspace)
  const entries: RepoMapEntry[] = []
  for (const file of files.slice(0, Math.max(1, limit))) {
    const text = await fs.promises.readFile(file, 'utf-8').catch(() => '')
    entries.push({
      path: relative(workspace, file),
      bytes: Buffer.byteLength(text),
      language: languageFor(file),
      symbols: extractSymbols(text, 12),
    })
  }
  return entries
}

export async function searchRepo(root: string, query: string, limit = 30): Promise<RepoSearchHit[]> {
  const workspace = path.resolve(root)
  const tokens = tokenize(query)
  if (tokens.length === 0) return []
  const queryVector = vector(tokens)
  const hits: RepoSearchHit[] = []
  for (const file of await walkTextFiles(workspace)) {
    const rel = relative(workspace, file)
    const relLower = normalizeText(rel)
    const text = await fs.promises.readFile(file, 'utf-8').catch(() => '')
    const symbols = extractSymbols(text)
    const symbolText = normalizeText(symbols.join(' '))
    const semanticScore = Math.round(cosine(queryVector, vector(tokenize(`${rel} ${symbols.join(' ')} ${text.slice(0, 40_000)}`))) * 25)
    const pathScore = tokens.filter((token) => relLower.includes(token)).length * 12
    const symbolScore = tokens.filter((token) => symbolText.includes(token)).length * 10
    const lines = text.split(/\r?\n/)
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
      hits.push({ path: rel, line: bestLine, score: bestScore, reason: bestReason || 'match', snippet })
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, Math.max(1, limit))
}

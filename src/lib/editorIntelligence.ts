/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */

export type WorkspaceFile = { name: string; path: string; isDirectory: boolean }

export type WorkspaceReference = {
  path: string
  line: number
  column: number
  preview: string
}

export type RenameResult = {
  replacements: number
  updatedFiles: string[]
  errors: { path: string; error: string }[]
}

const TEXT_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'md', 'css', 'scss', 'html',
  'py', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp', 'cs',
  'rb', 'php', 'sh', 'ps1', 'sql', 'yaml', 'yml', 'toml', 'ini', 'env',
])

export function isWorkspaceTextFile(file: WorkspaceFile): boolean {
  if (file.isDirectory) return false
  const name = file.name.toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop() || '' : name
  return TEXT_EXTS.has(ext) || ['dockerfile', 'makefile'].includes(name)
}

export function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value)
}

export function identifierPattern(identifier: string, flags = 'g'): RegExp {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, flags)
}

export async function findWorkspaceReferences(
  files: WorkspaceFile[],
  readFile: (path: string) => Promise<{ content: string } | { error: string }>,
  identifier: string,
  limit = 200,
): Promise<WorkspaceReference[]> {
  if (!isValidIdentifier(identifier)) return []
  const refs: WorkspaceReference[] = []
  const pattern = identifierPattern(identifier)
  for (const file of files.filter(isWorkspaceTextFile)) {
    if (refs.length >= limit) break
    const result = await readFile(file.path)
    if (!('content' in result)) continue
    const lines = result.content.split(/\r?\n/)
    for (let i = 0; i < lines.length && refs.length < limit; i++) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(lines[i])) && refs.length < limit) {
        refs.push({
          path: file.path,
          line: i + 1,
          column: match.index + 1,
          preview: lines[i].trim(),
        })
      }
    }
  }
  return refs
}

export async function renameWorkspaceIdentifier(
  files: WorkspaceFile[],
  readFile: (path: string) => Promise<{ content: string } | { error: string }>,
  writeFile: (path: string, content: string) => Promise<{ success: boolean } | { error: string }>,
  from: string,
  to: string,
): Promise<RenameResult> {
  if (!isValidIdentifier(from) || !isValidIdentifier(to)) {
    return { replacements: 0, updatedFiles: [], errors: [{ path: '', error: 'Invalid identifier' }] }
  }

  const pattern = identifierPattern(from)
  const updatedFiles: string[] = []
  const errors: RenameResult['errors'] = []
  let replacements = 0

  for (const file of files.filter(isWorkspaceTextFile)) {
    const result = await readFile(file.path)
    if (!('content' in result)) {
      errors.push({ path: file.path, error: result.error })
      continue
    }
    pattern.lastIndex = 0
    let count = 0
    const next = result.content.replace(pattern, () => {
      count++
      return to
    })
    if (count === 0) continue
    const write = await writeFile(file.path, next)
    if ('error' in write) errors.push({ path: file.path, error: write.error })
    else {
      replacements += count
      updatedFiles.push(file.path)
    }
  }

  return { replacements, updatedFiles, errors }
}

export function pickLikelyDefinition(refs: WorkspaceReference[], identifier: string): WorkspaceReference | undefined {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const declarationPatterns = [
    new RegExp(`\\b(function|class|interface|type|enum|const|let|var)\\s+${escaped}\\b`),
    new RegExp(`\\b(def|class)\\s+${escaped}\\b`),
    new RegExp(`\\b(func|type|var|const)\\s+${escaped}\\b`),
    new RegExp(`\\b(fn|struct|enum|trait|type|const|let)\\s+${escaped}\\b`),
    new RegExp(`\\b(class|interface|record|enum|fun|val|var)\\s+${escaped}\\b`),
    new RegExp(`\\bfunction\\s+${escaped}\\b`),
    new RegExp(`\\b${escaped}\\s*[:=]`),
  ]
  return refs.find((ref) => declarationPatterns.some((pattern) => pattern.test(ref.preview))) || refs[0]
}

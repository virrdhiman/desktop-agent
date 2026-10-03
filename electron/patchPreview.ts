import fs from 'fs'
import path from 'path'

export type PreviewEdit = {
  path: string
  old_string: string
  new_string: string
}

type FilePreview = {
  file: string
  before: string
  after: string
  applied: number
}

function toRepoPath(root: string, file: string): string {
  const rel = path.relative(root, path.resolve(file)).replace(/\\/g, '/')
  return rel || path.basename(file)
}

function splitLines(text: string): string[] {
  if (!text) return []
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function lcsTable(a: string[], b: string[]): number[][] {
  const table = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

function diffLines(before: string[], after: string[]): string[] {
  const table = lcsTable(before, after)
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      out.push(` ${before[i]}`)
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push(`-${before[i++]}`)
    } else {
      out.push(`+${after[j++]}`)
    }
  }
  while (i < before.length) out.push(`-${before[i++]}`)
  while (j < after.length) out.push(`+${after[j++]}`)
  return out
}

function trimContext(lines: string[], context = 3): string[] {
  const changed = lines.map((line, index) => line[0] === '+' || line[0] === '-' ? index : -1).filter((index) => index >= 0)
  if (changed.length === 0) return []
  const keep = new Set<number>()
  for (const index of changed) {
    for (let i = Math.max(0, index - context); i <= Math.min(lines.length - 1, index + context); i++) keep.add(i)
  }
  const out: string[] = []
  let previous = -2
  for (const index of [...keep].sort((a, b) => a - b)) {
    if (previous !== -2 && index > previous + 1) out.push(' ...')
    out.push(lines[index])
    previous = index
  }
  return out
}

function unifiedDiff(file: string, before: string, after: string): string {
  const beforeLines = splitLines(before)
  const afterLines = splitLines(after)
  const lines = trimContext(diffLines(beforeLines, afterLines))
  if (lines.length === 0) return ''
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ preview @@',
    ...lines,
  ].join('\n')
}

export async function previewEdits(root: string, edits: PreviewEdit[]): Promise<string> {
  const workspace = path.resolve(root)
  if (!Array.isArray(edits) || edits.length === 0) return 'preview_edits requires a non-empty edits array.'

  const previews = new Map<string, FilePreview>()
  const problems: string[] = []
  for (const edit of edits) {
    if (!edit || typeof edit.path !== 'string') {
      problems.push('Invalid edit: each item needs path, old_string, and new_string.')
      continue
    }
    if (typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') {
      problems.push(`${edit.path}: old_string and new_string must be strings.`)
      continue
    }
    const file = path.resolve(edit.path)
    let preview = previews.get(file)
    if (!preview) {
      let before = ''
      try {
        before = await fs.promises.readFile(file, 'utf-8')
      } catch (err: any) {
        problems.push(`${toRepoPath(workspace, file)}: ${err?.code === 'ENOENT' ? 'file not found' : err.message}`)
        continue
      }
      preview = { file, before, after: before, applied: 0 }
      previews.set(file, preview)
    }
    if (!preview.after.includes(edit.old_string)) {
      problems.push(`${toRepoPath(workspace, file)}: old_string not found in current preview content.`)
      continue
    }
    preview.after = preview.after.replace(edit.old_string, edit.new_string)
    preview.applied++
  }

  const diffs = [...previews.values()]
    .filter((preview) => preview.before !== preview.after)
    .map((preview) => unifiedDiff(toRepoPath(workspace, preview.file), preview.before, preview.after))
    .filter(Boolean)

  const summary = [
    `Patch preview: ${diffs.length} file${diffs.length === 1 ? '' : 's'} would change; no files were written.`,
    problems.length ? `Problems:\n${problems.map((problem) => `- ${problem}`).join('\n')}` : '',
    diffs.length ? `\n${diffs.join('\n\n')}` : 'No diff generated.',
  ].filter(Boolean).join('\n\n')

  return summary.length > 20_000 ? `${summary.slice(0, 20_000)}\n[... preview truncated]` : summary
}


/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */

export type InlineEditSummary = {
  changedLines: number
  addedLines: number
  removedLines: number
  firstChangedLine: number
}

export type InlineEditHunk = {
  id: string
  oldStart: number
  oldEnd: number
  newStart: number
  newEnd: number
  beforeLines: string[]
  afterLines: string[]
  preview: string
}

type DiffOp =
  | { type: 'equal'; line: string; oldIndex: number; newIndex: number }
  | { type: 'delete'; line: string; oldIndex: number }
  | { type: 'insert'; line: string; newIndex: number }

export function summarizeInlineEdit(before: string, after: string): InlineEditSummary {
  const oldLines = before.split(/\r?\n/)
  const newLines = after.split(/\r?\n/)
  const max = Math.max(oldLines.length, newLines.length)
  let changedLines = 0
  let addedLines = 0
  let removedLines = 0
  let firstChangedLine = 1
  for (let i = 0; i < max; i++) {
    if (oldLines[i] === newLines[i]) continue
    if (changedLines === 0) firstChangedLine = i + 1
    changedLines++
    if (oldLines[i] == null) addedLines++
    else if (newLines[i] == null) removedLines++
  }
  return { changedLines, addedLines, removedLines, firstChangedLine }
}

export function buildPreview(before: string, after: string, context = 2): string {
  const oldLines = before.split(/\r?\n/)
  const newLines = after.split(/\r?\n/)
  const summary = summarizeInlineEdit(before, after)
  const start = Math.max(0, summary.firstChangedLine - 1 - context)
  const end = Math.min(Math.max(oldLines.length, newLines.length), summary.firstChangedLine + context + Math.min(summary.changedLines, 12))
  const lines: string[] = []
  for (let i = start; i < end; i++) {
    if (oldLines[i] === newLines[i]) lines.push(`  ${i + 1}: ${oldLines[i] ?? ''}`)
    else {
      if (oldLines[i] != null) lines.push(`- ${i + 1}: ${oldLines[i]}`)
      if (newLines[i] != null) lines.push(`+ ${i + 1}: ${newLines[i]}`)
    }
  }
  return lines.join('\n')
}

export function buildInlineEditHunks(before: string, after: string, context = 2): InlineEditHunk[] {
  const oldLines = before.split(/\r?\n/)
  const newLines = after.split(/\r?\n/)
  const ops = buildLineDiff(oldLines, newLines)
  const hunks: InlineEditHunk[] = []
  let i = 0

  while (i < ops.length) {
    if (ops[i].type === 'equal') {
      i++
      continue
    }

    const changeStart = i
    while (i < ops.length && ops[i].type !== 'equal') i++
    const changeEnd = i - 1
    const previewStart = Math.max(0, changeStart - context)
    const previewEnd = Math.min(ops.length - 1, changeEnd + context)
    const changeOps = ops.slice(changeStart, changeEnd + 1)
    const previewLines: string[] = []
    const beforeLines = changeOps.filter((op) => op.type === 'delete').map((op) => op.line)
    const afterLines = changeOps.filter((op) => op.type === 'insert').map((op) => op.line)
    const oldIndexes = changeOps.flatMap((op) => op.type === 'delete' ? [op.oldIndex] : [])
    const newIndexes = changeOps.flatMap((op) => op.type === 'insert' ? [op.newIndex] : [])
    const anchorOld = previousOldIndex(ops, changeStart) + 1
    const anchorNew = previousNewIndex(ops, changeStart) + 1
    const oldStart = oldIndexes.length ? Math.min(...oldIndexes) + 1 : anchorOld + 1
    const oldEnd = oldIndexes.length ? Math.max(...oldIndexes) + 1 : oldStart - 1
    const newStart = newIndexes.length ? Math.min(...newIndexes) + 1 : anchorNew + 1
    const newEnd = newIndexes.length ? Math.max(...newIndexes) + 1 : newStart - 1

    for (let line = previewStart; line <= previewEnd; line++) {
      const op = ops[line]
      if (op.type === 'equal') previewLines.push(`  ${op.newIndex + 1}: ${op.line}`)
      if (op.type === 'delete') previewLines.push(`- ${op.oldIndex + 1}: ${op.line}`)
      if (op.type === 'insert') previewLines.push(`+ ${op.newIndex + 1}: ${op.line}`)
    }

    hunks.push({
      id: `${oldStart}-${oldEnd}-${newStart}-${newEnd}-${hunks.length}`,
      oldStart,
      oldEnd,
      newStart,
      newEnd,
      beforeLines,
      afterLines,
      preview: previewLines.join('\n'),
    })
  }

  return hunks
}

export function rejectInlineEditHunk(current: string, hunk: InlineEditHunk): string {
  const currentLines = current.split(/\r?\n/)
  const targetIndex = findCurrentHunkIndex(currentLines, hunk)
  currentLines.splice(targetIndex, hunk.afterLines.length, ...hunk.beforeLines)
  return currentLines.join('\n')
}

function findCurrentHunkIndex(currentLines: string[], hunk: InlineEditHunk): number {
  const proposedIndex = Math.max(0, hunk.newStart - 1)
  if (hunk.afterLines.length === 0) return proposedIndex
  if (linesMatch(currentLines, proposedIndex, hunk.afterLines)) return proposedIndex
  for (let i = 0; i <= currentLines.length - hunk.afterLines.length; i++) {
    if (linesMatch(currentLines, i, hunk.afterLines)) return i
  }
  return proposedIndex
}

function linesMatch(lines: string[], start: number, expected: string[]): boolean {
  return expected.every((line, offset) => lines[start + offset] === line)
}

function buildLineDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  if (oldLines.length * newLines.length > 250_000) return buildLinearLineDiff(oldLines, newLines)
  const dp = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0) as number[])
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex--) {
      dp[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? dp[oldIndex + 1][newIndex + 1] + 1
        : Math.max(dp[oldIndex + 1][newIndex], dp[oldIndex][newIndex + 1])
    }
  }

  const ops: DiffOp[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      ops.push({ type: 'equal', line: oldLines[oldIndex], oldIndex, newIndex })
      oldIndex++
      newIndex++
    } else if (dp[oldIndex + 1][newIndex] >= dp[oldIndex][newIndex + 1]) {
      ops.push({ type: 'delete', line: oldLines[oldIndex], oldIndex })
      oldIndex++
    } else {
      ops.push({ type: 'insert', line: newLines[newIndex], newIndex })
      newIndex++
    }
  }
  while (oldIndex < oldLines.length) {
    ops.push({ type: 'delete', line: oldLines[oldIndex], oldIndex })
    oldIndex++
  }
  while (newIndex < newLines.length) {
    ops.push({ type: 'insert', line: newLines[newIndex], newIndex })
    newIndex++
  }
  return ops
}

function buildLinearLineDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  const max = Math.max(oldLines.length, newLines.length)
  const ops: DiffOp[] = []
  for (let i = 0; i < max; i++) {
    if (oldLines[i] === newLines[i]) ops.push({ type: 'equal', line: oldLines[i] ?? '', oldIndex: i, newIndex: i })
    else {
      if (oldLines[i] != null) ops.push({ type: 'delete', line: oldLines[i], oldIndex: i })
      if (newLines[i] != null) ops.push({ type: 'insert', line: newLines[i], newIndex: i })
    }
  }
  return ops
}

function previousOldIndex(ops: DiffOp[], start: number): number {
  for (let i = start - 1; i >= 0; i--) {
    const op = ops[i]
    if (op.type === 'equal' || op.type === 'delete') return op.oldIndex
  }
  return -1
}

function previousNewIndex(ops: DiffOp[], start: number): number {
  for (let i = start - 1; i >= 0; i--) {
    const op = ops[i]
    if (op.type === 'equal' || op.type === 'insert') return op.newIndex
  }
  return -1
}

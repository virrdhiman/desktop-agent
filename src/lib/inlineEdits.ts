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

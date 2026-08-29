/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * DiffViewer — Inline diff viewer for file edits
 *
 * Shows before/after changes with color-coded additions and deletions.
 * Used to display agent file edits in a clear, readable format.
 */
import React, { memo, useState, useMemo } from 'react'

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'header'
  content: string
  oldLine?: number
  newLine?: number
}

function computeDiffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []

  // Simple LCS-based diff
  const lcs = buildLCS(oldLines, newLines)
  let oi = 0, ni = 0, li = 0

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li] && ni < newLines.length && newLines[ni] === lcs[li]) {
      result.push({ type: 'context', content: lcs[li], oldLine: oi + 1, newLine: ni + 1 })
      oi++; ni++; li++
    } else if (ni >= newLines.length || (oi < oldLines.length && (li >= lcs.length || oldLines[oi] !== lcs[li]))) {
      result.push({ type: 'removed', content: oldLines[oi], oldLine: oi + 1 })
      oi++
    } else {
      result.push({ type: 'added', content: newLines[ni], newLine: ni + 1 })
      ni++
    }
  }

  return result
}

function buildLCS(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length
  // Use patience diff for better results on code
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  // Backtrack
  const result: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j-- }
    else if (dp[i - 1][j] > dp[i][j - 1]) i--
    else j--
  }
  return result
}

interface DiffViewerProps {
  filePath: string
  oldContent: string
  newContent: string
  collapsed?: boolean
}

const DiffViewer: React.FC<DiffViewerProps> = memo(function DiffViewer({ filePath, oldContent, newContent, collapsed: initialCollapsed }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed ?? false)

  const diffLines = useMemo(() => computeDiffLines(oldContent, newContent), [oldContent, newContent])

  const added = diffLines.filter(l => l.type === 'added').length
  const removed = diffLines.filter(l => l.type === 'removed').length
  const visibleLines = collapsed ? diffLines.slice(0, 10) : diffLines

  return (
    <div style={{
      margin: '8px 0', borderRadius: 8, overflow: 'hidden',
      border: '1px solid var(--border)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 12px', background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border)', cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          📝 {filePath}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {added > 0 && <span style={{ color: '#4ade80', fontSize: 11 }}>+{added}</span>}
          {removed > 0 && <span style={{ color: '#f87171', fontSize: 11 }}>-{removed}</span>}
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {collapsed ? '▶ expand' : '▼ collapse'}
          </span>
        </div>
      </div>

      {/* Diff lines */}
      {!collapsed && (
        <div style={{ background: '#0d1117', overflow: 'auto', maxHeight: 400 }}>
          {visibleLines.map((line, i) => (
            <div
              key={i}
              style={{
                display: 'flex', padding: '1px 12px',
                background: line.type === 'added' ? 'rgba(74,222,128,0.12)' :
                  line.type === 'removed' ? 'rgba(248,113,113,0.12)' : 'transparent',
                borderLeft: line.type === 'added' ? '3px solid #4ade80' :
                  line.type === 'removed' ? '3px solid #f87171' : '3px solid transparent',
              }}
            >
              <span style={{ width: 35, textAlign: 'right', color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>
                {line.oldLine || ''}
              </span>
              <span style={{ width: 35, textAlign: 'right', color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>
                {line.newLine || ''}
              </span>
              <span style={{
                marginRight: 8, width: 14, textAlign: 'center', flexShrink: 0,
                color: line.type === 'added' ? '#4ade80' : line.type === 'removed' ? '#f87171' : 'var(--text-muted)',
              }}>
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span style={{ whiteSpace: 'pre', flex: 1 }}>{line.content}</span>
            </div>
          ))}
          {collapsed && diffLines.length > 10 && (
            <div style={{ padding: '4px 12px', color: 'var(--text-muted)', fontSize: 10, textAlign: 'center' }}>
              ... {diffLines.length - 10} more lines
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default DiffViewer

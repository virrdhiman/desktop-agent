/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * SearchResults — Dedicated panel for code search results
 *
 * Shows grep-like search results with file paths, line numbers,
 * and highlighted matching text. Click a result to open the file.
 */
import { useStore } from '../store'

export default function SearchResults() {
  const { workspacePath, searchResults, setSearchResults, setSelectedFile, addOpenFile } = useStore()

  const lines = searchResults ? searchResults.split('\n').filter(l => l.trim()) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <h2>🔍 Search Results</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lines.length} matches</span>
          <button className="btn btn-sm" onClick={() => setSearchResults(null)}>✕ Close</button>
        </div>
      </div>

      <div className="panel-body" style={{ flex: 1, overflowY: 'auto' }}>
        {lines.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-text">No results found</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lines.map((line, i) => {
              // Parse "filepath:lineNumber: content"
              const match = line.match(/^(.+?):(\d+):\s*(.*)$/)
              if (match) {
                const [, filePath, lineNum, content] = match
                const shortPath = workspacePath ? filePath.replace(workspacePath, '~') : filePath
                return (
                  <div
                    key={i}
                    onClick={() => {
                      setSelectedFile(filePath)
                      addOpenFile(filePath)
                    }}
                    style={{
                      padding: '6px 10px', borderRadius: 4, cursor: 'pointer',
                      fontSize: 12, fontFamily: 'monospace', lineHeight: 1.5,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{shortPath}</span>
                      <span style={{ color: 'var(--text-muted)' }}>:{lineNum}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', paddingLeft: 8 }}>{content}</div>
                  </div>
                )
              }
              return (
                <div key={i} style={{ padding: '4px 10px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {line}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

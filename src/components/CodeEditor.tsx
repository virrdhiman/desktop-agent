import { useCallback, useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useStore } from '../store'

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', scss: 'scss',
    html: 'html', py: 'python', rs: 'rust', go: 'go',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sh: 'shell', bash: 'shell',
    sql: 'sql', xml: 'xml', java: 'java', c: 'c', cpp: 'cpp',
    h: 'c', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php',
    swift: 'swift', kt: 'kotlin', r: 'r', dart: 'dart',
    vue: 'html', svelte: 'html', graphql: 'graphql',
  }
  return map[ext] || 'plaintext'
}

function getIcon(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: '🟦', tsx: '🟦', js: '🟨', jsx: '🟨', json: '📦',
    md: '📝', css: '🎨', html: '🌐', py: '🐍', rs: '🦀',
    go: '🔵', yaml: '⚙️', yml: '⚙️', sh: '⬛',
  }
  return map[ext] || '📄'
}

export default function CodeEditor() {
  const {
    selectedFile, setSelectedFile, fileContent, setFileContent,
    fileDirty, setFileDirty, openFiles, addOpenFile, closeOpenFile,
  } = useStore()

  const [editorContent, setEditorContent] = useState('')

  // Load file when selected changes
  useEffect(() => {
    if (!selectedFile) return
    window.api.readFile(selectedFile).then((result) => {
      if ('content' in result) {
        setEditorContent(result.content)
        setFileContent(result.content)
        addOpenFile(selectedFile)
      }
    })
  }, [selectedFile])

  const handleSave = useCallback(async () => {
    if (!selectedFile) return
    const result = await window.api.writeFile(selectedFile, editorContent)
    if ('success' in result) {
      setFileContent(editorContent)
    }
  }, [selectedFile, editorContent])

  // Ctrl+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      // Ctrl+W to close tab
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        if (selectedFile) {
          closeOpenFile(selectedFile)
          const remaining = openFiles.filter((f) => f !== selectedFile)
          setSelectedFile(remaining.length ? remaining[remaining.length - 1] : null)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, selectedFile, openFiles])

  const handleTabClick = useCallback(async (filePath: string) => {
    setSelectedFile(filePath)
  }, [])

  const handleCloseTab = useCallback((e: React.MouseEvent, filePath: string) => {
    e.stopPropagation()
    closeOpenFile(filePath)
    if (selectedFile === filePath) {
      const remaining = openFiles.filter((f) => f !== filePath)
      setSelectedFile(remaining.length ? remaining[remaining.length - 1] : null)
    }
  }, [selectedFile, openFiles])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      {openFiles.length > 0 && (
        <div style={{
          display: 'flex',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          overflow: 'auto',
          height: 36,
          flexShrink: 0,
        }}>
          {openFiles.map((filePath) => {
            const isActive = selectedFile === filePath
            return (
              <div
                key={filePath}
                onClick={() => handleTabClick(filePath)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  borderRight: '1px solid var(--border)',
                  background: isActive ? 'var(--bg-primary)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <span>{getIcon(filePath)}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {filePath.split(/[/\\]/).pop()}
                </span>
                <span
                  onClick={(e) => handleCloseTab(e, filePath)}
                  style={{
                    fontSize: 14, opacity: 0.5, padding: '0 2px', borderRadius: 3,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.background = 'transparent' }}
                >
                  ×
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Editor toolbar */}
      {selectedFile && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'monospace' }}>{selectedFile}</span>
            {fileDirty && (
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--warning)',
              }} title="Unsaved changes" />
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {fileDirty && (
              <button className="btn btn-sm btn-success" onClick={handleSave}>
                💾 Save
              </button>
            )}
            <button className="btn btn-sm" onClick={() => window.api.showItemInFolder(selectedFile)}>
              📁
            </button>
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      {selectedFile ? (
        <Editor
          language={getLanguage(selectedFile)}
          value={editorContent}
          onChange={(val) => {
            setEditorContent(val || '')
            if (val !== fileContent) setFileDirty(true)
          }}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            minimap: { enabled: true, maxColumn: 80 },
            padding: { top: 8 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: 'on',
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true },
            renderWhitespace: 'selection',
            tabSize: 2,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            folding: true,
            formatOnPaste: true,
            lineNumbers: 'on',
            glyphMargin: false,
            renderLineHighlight: 'all',
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
          loading={
            <div className="empty-state" style={{ height: '100%' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading editor...</div>
            </div>
          }
        />
      ) : (
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-text">Open a file to start editing</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
            Files open as tabs · <kbd>Ctrl+S</kbd> to save · <kbd>Ctrl+W</kbd> to close<br />
            Use the file browser or <kbd>Ctrl+P</kbd> to find files
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { useStore } from '../store'
import type { FileEntry } from '../types'

export default function FileBrowser() {
  const {
    workspacePath, setWorkspacePath,
    currentDirectory, setCurrentDirectory,
    files, setFiles,
    selectedFile, setSelectedFile,
    expandedDirs, toggleDir,
    addOpenFile, setGitStatus, setIsRepo,
  } = useStore()

  const [error, setError] = useState<string | null>(null)

  const openFolder = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (!dir) return
    setWorkspacePath(dir)
    setCurrentDirectory(dir)

    const isRepo = await window.api.gitIsRepo(dir)
    setIsRepo(isRepo)
    if (isRepo) {
      const status = await window.api.gitStatus(dir)
      if (!('error' in status)) setGitStatus(status)
    }
  }, [])

  const loadDir = useCallback(async (dirPath: string) => {
    const result = await window.api.readDirectory(dirPath)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setFiles(result as FileEntry[])
    setError(null)
  }, [])

  useEffect(() => {
    if (currentDirectory) loadDir(currentDirectory)
  }, [currentDirectory])

  const openFile = useCallback((filePath: string) => {
    setSelectedFile(filePath)
    addOpenFile(filePath)
  }, [])

  const navigateUp = useCallback(async () => {
    const parent = await window.api.getParentPath(currentDirectory)
    setCurrentDirectory(parent)
  }, [currentDirectory])

  const handleDirClick = useCallback((entry: FileEntry) => {
    toggleDir(entry.path)
    setCurrentDirectory(entry.path)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header" style={{ minHeight: 40, padding: '8px 12px' }}>
        <h2 style={{ fontSize: 13 }}>📂 Files</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm btn-primary" onClick={openFolder}>Open</button>
          {currentDirectory !== workspacePath && (
            <button className="btn btn-sm" onClick={navigateUp}>⬆</button>
          )}
        </div>
      </div>

      {/* Path breadcrumb */}
      {workspacePath && (
        <div style={{
          padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)',
          fontFamily: 'monospace', borderBottom: '1px solid var(--border)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentDirectory.replace(workspacePath, '~')}
        </div>
      )}

      <div className="panel-body" style={{ padding: 4, flex: 1, overflowY: 'auto' }}>
        {!workspacePath ? (
          <div className="empty-state">
            <div className="empty-state-icon">📂</div>
            <div className="empty-state-text">Open a folder to start</div>
            <button className="btn btn-primary" onClick={openFolder}>Open Folder</button>
          </div>
        ) : error ? (
          <div style={{ color: 'var(--error)', padding: 12, fontSize: 13 }}>{error}</div>
        ) : (
          files.map((f) => (
            <div
              key={f.path}
              onClick={() => f.isDirectory ? handleDirClick(f) : openFile(f.path)}
              className="file-tree-item"
              style={{
                color: selectedFile === f.path ? 'var(--accent)' : 'var(--text-primary)',
                background: selectedFile === f.path ? 'rgba(59,130,246,0.1)' : 'transparent',
              }}
            >
              <span style={{ width: 18, textAlign: 'center' }}>
                {f.isDirectory ? (expandedDirs.has(f.path) ? '📂' : '📁') : getFileIcon(f.name)}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: '🟦', tsx: '🟦', js: '🟨', jsx: '🟨', json: '📦',
    md: '📝', css: '🎨', html: '🌐', py: '🐍', rs: '🦀',
    go: '🔵', yaml: '⚙️', yml: '⚙️', toml: '⚙️', sh: '⬛',
    dockerfile: '🐳', gitignore: '👻',
  }
  return map[ext] || '📄'
}

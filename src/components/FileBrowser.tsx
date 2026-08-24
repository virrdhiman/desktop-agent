/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * FileBrowser — File tree navigation panel
 *
 * Features:
 * - Tree-view file navigation
 * - Click to open files in Monaco editor
 * - Breadcrumb path display
 * - Navigate up to parent directory
 * - File icons by extension
 * - Hidden files and node_modules filtered
 */
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
    addOpenFile, closeOpenFile, setGitStatus, setIsRepo,
  } = useStore()

  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileEntry } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [filterQuery, setFilterQuery] = useState('')

  const openFolder = useCallback(async () => {
    try {
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
    } catch (err) { console.error('Failed to open folder:', err) }
  }, [])

  const loadDir = useCallback(async (dirPath: string) => {
    try {
      const result = await window.api.readDirectory(dirPath)
      if ('error' in result) {
        setError(result.error)
        return
      }

      setFiles(result as FileEntry[])
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load directory')
    }
  }, [])

  useEffect(() => {
    if (currentDirectory) loadDir(currentDirectory)
  }, [currentDirectory])

  const openFile = useCallback((filePath: string) => {
    setSelectedFile(filePath)
    addOpenFile(filePath)
  }, [])

  const navigateUp = useCallback(async () => {
    try {
      const parent = await window.api.getParentPath(currentDirectory)
      setCurrentDirectory(parent)
    } catch (err) { console.error('Failed to navigate up:', err) }
  }, [currentDirectory])

  const handleDirClick = useCallback((entry: FileEntry) => {
    toggleDir(entry.path)
    setCurrentDirectory(entry.path)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }, [])

  const handleDelete = useCallback(async (file: FileEntry) => {
    if (!confirm(`Delete ${file.name}?`)) return
    try {
      await window.api.deleteFile(file.path)
      if (currentDirectory) loadDir(currentDirectory)
    } catch (err) { console.error('Failed to delete:', err) }
    setContextMenu(null)
  }, [currentDirectory])

  const handleRename = useCallback(async (file: FileEntry) => {
    setRenaming(file.path)
    setRenameValue(file.name)
    setContextMenu(null)
  }, [])

  const confirmRename = useCallback(async (oldPath: string) => {
    const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1)
    const newPath = dir + renameValue
    if (newPath !== oldPath) {
      await window.api.rename(oldPath, newPath)
      if (selectedFile === oldPath) {
        setSelectedFile(newPath)
        closeOpenFile(oldPath)
        addOpenFile(newPath)
      }
    }
    setRenaming(null)
    if (currentDirectory) loadDir(currentDirectory)
  }, [renameValue, currentDirectory, selectedFile])

  const handleNewFile = useCallback(async () => {
    const name = prompt('New file name:')
    if (!name) return
    try {
      const filePath = currentDirectory + '/' + name
      await window.api.createFile(filePath)
      if (currentDirectory) loadDir(currentDirectory)
    } catch (err) { console.error('Failed to create file:', err) }
  }, [currentDirectory])

  const handleNewFolder = useCallback(async () => {
    const name = prompt('New folder name:')
    if (!name) return
    try {
      const dirPath = currentDirectory + '/' + name
      await window.api.createDirectory(dirPath)
      if (currentDirectory) loadDir(currentDirectory)
    } catch (err) { console.error('Failed to create folder:', err) }
  }, [currentDirectory])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header" style={{ minHeight: 40, padding: '8px 12px' }}>
        <h2 style={{ fontSize: 13 }}>📂 Files</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" onClick={handleNewFile} title="New File">+</button>
          <button className="btn btn-sm" onClick={handleNewFolder} title="New Folder">📁+</button>
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

      {/* File filter */}
      {workspacePath && files.length > 5 && (
        <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
          <input
            className="input"
            placeholder="Filter files..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{ width: '100%', fontSize: 11, padding: '3px 6px' }}
          />
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
          files
            .filter(f => !filterQuery || f.name.toLowerCase().includes(filterQuery.toLowerCase()))
            .map((f) => (
            <div
              key={f.path}
              onClick={() => f.isDirectory ? handleDirClick(f) : openFile(f.path)}
              onContextMenu={(e) => handleContextMenu(e, f)}
              className="file-tree-item"
              style={{
                color: selectedFile === f.path ? 'var(--accent)' : 'var(--text-primary)',
                background: selectedFile === f.path ? 'rgba(59,130,246,0.1)' : 'transparent',
              }}
            >
              <span style={{ width: 18, textAlign: 'center' }}>
                {f.isDirectory ? (expandedDirs.has(f.path) ? '📂' : '📁') : getFileIcon(f.name)}
              </span>
              {renaming === f.path ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => confirmRename(f.path)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(f.path); if (e.key === 'Escape') setRenaming(null) }}
                  style={{ flex: 1, padding: '1px 4px', fontSize: 12, background: 'var(--bg-primary)', border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--text-primary)', outline: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '4px 0', minWidth: 160, zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            <div onClick={() => { openFile(contextMenu.file.path); setContextMenu(null) }} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', gap: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >📄 Open</div>
            <div onClick={() => handleRename(contextMenu.file)} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', gap: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >✏️ Rename</div>
            <div onClick={() => window.api.showItemInFolder(contextMenu.file.path)} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', gap: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >📁 Show in Explorer</div>
            <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
            <div onClick={() => handleDelete(contextMenu.file)} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--error)', display: 'flex', gap: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >🗑️ Delete</div>
          </div>
        </>
      )}
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

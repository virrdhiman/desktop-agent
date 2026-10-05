/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * CodeEditor — Monaco-powered code editor
 *
 * Features:
 * - Full VS Code editor (Monaco) with syntax highlighting
 * - Tab management for multiple open files
 * - Ctrl+S to save, Ctrl+W to close tabs
 * - File dirty indicator (unsaved changes dot)
 * - Language auto-detection from file extension
 * - Minimap, bracket matching, code folding
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lazy, Suspense } from 'react'
import type * as Monaco from 'monaco-editor'
import { useStore } from '../store'
import {
  findWorkspaceReferences,
  isValidIdentifier,
  pickLikelyDefinition,
  renameWorkspaceIdentifier,
  type WorkspaceReference,
} from '../lib/editorIntelligence'
import { buildInlineEditHunks, rejectInlineEditHunk, summarizeInlineEdit, type InlineEditHunk } from '../lib/inlineEdits'

const loadMonacoEditor = () => import('../lib/monacoEditor')
const Editor = lazy(loadMonacoEditor)

const COMMON_SYMBOLS = [
  'async', 'await', 'const', 'let', 'function', 'return', 'import', 'export', 'type', 'interface',
  'class', 'extends', 'implements', 'try', 'catch', 'finally', 'Promise', 'Array', 'Record',
]

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

function hasLspSupport(language: string): boolean {
  return ['typescript', 'javascript', 'python', 'go', 'rust', 'c', 'cpp', 'csharp'].includes(language)
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

function completionWords(text: string, filePaths: string[], openFiles: string[]): string[] {
  const words = new Set<string>(COMMON_SYMBOLS)
  const wordMatches = text.match(/\b[A-Za-z_$][\w$]{2,}\b/g) || []
  for (const word of wordMatches) words.add(word)
  for (const file of [...filePaths, ...openFiles]) {
    const normalized = file.replace(/\\/g, '/')
    const base = normalized.split('/').pop() || ''
    const stem = base.replace(/\.[^.]+$/, '')
    for (const part of normalized.split(/[/.\\_-]+/)) if (/^[A-Za-z_$][\w$]{2,}$/.test(part)) words.add(part)
    if (/^[A-Za-z_$][\w$]{2,}$/.test(stem)) words.add(stem)
  }
  return [...words].slice(0, 500)
}

export default function CodeEditor() {
  const {
    selectedFile, setSelectedFile, fileContent, setFileContent,
    fileDirty, setFileDirty, openFiles, addOpenFile, closeOpenFile,
    allFiles, addTerminalEntry, workspacePath, fileEditHistory, removeFileEdit,
  } = useStore()

  const [editorContent, setEditorContent] = useState('')
  const [languageReady, setLanguageReady] = useState(false)
  const [references, setReferences] = useState<WorkspaceReference[]>([])
  const [diagnostics, setDiagnostics] = useState<Array<WorkspaceReference & { message: string; severity: 'error' | 'warning' | 'info' }>>([])
  const [referenceWord, setReferenceWord] = useState('')
  const [pendingReveal, setPendingReveal] = useState<WorkspaceReference | null>(null)
  const [dismissedInlineHunks, setDismissedInlineHunks] = useState<Set<string>>(() => new Set())
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const completionProviderRef = useRef<Monaco.IDisposable | null>(null)
  const completionWordsRef = useRef<string[]>([])

  const language = useMemo(() => selectedFile ? getLanguage(selectedFile) : 'plaintext', [selectedFile])
  const hasTsLanguageService = language === 'typescript' || language === 'javascript'
  const hasLanguageService = hasLspSupport(language)
  const latestInlineEdit = useMemo(() => {
    if (!selectedFile) return null
    return [...fileEditHistory].reverse().find((edit) => edit.path === selectedFile) || null
  }, [fileEditHistory, selectedFile])
  const latestInlineEditSummary = useMemo(() => (
    latestInlineEdit ? summarizeInlineEdit(latestInlineEdit.before, latestInlineEdit.after) : null
  ), [latestInlineEdit])
  const inlineEditHunks = useMemo(() => (
    latestInlineEdit
      ? buildInlineEditHunks(latestInlineEdit.before, latestInlineEdit.after).filter((hunk) => !dismissedInlineHunks.has(hunk.id))
      : []
  ), [dismissedInlineHunks, latestInlineEdit])
  const localCompletionWords = useMemo(() => (
    completionWords(editorContent, allFiles.map((file) => file.path), openFiles)
  ), [allFiles, editorContent, openFiles])

  useEffect(() => {
    completionWordsRef.current = localCompletionWords
  }, [localCompletionWords])

  useEffect(() => {
    setDismissedInlineHunks(new Set())
  }, [latestInlineEdit?.timestamp])

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

  useEffect(() => {
    let cancelled = false
    if (!selectedFile) return
    setLanguageReady(false)
    loadMonacoEditor()
      .then((module) => module.ensureMonacoLanguage(language))
      .finally(() => {
        if (!cancelled) setLanguageReady(true)
      })
    return () => { cancelled = true }
  }, [language, selectedFile])

  const handleSave = useCallback(async () => {
    if (!selectedFile) return
    try {
      const result = await window.api.writeFile(selectedFile, editorContent)
      if ('success' in result) {
        setFileContent(editorContent)
        if (workspacePath && hasLanguageService) {
          const next = await window.api.lspDiagnostics(workspacePath, selectedFile)
          if (Array.isArray(next)) setDiagnostics(next)
        }
      }
    } catch (err) { console.error('Failed to save file:', err) }
  }, [selectedFile, editorContent, workspacePath, hasLanguageService])

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

  const currentIdentifier = useCallback(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    const position = editor?.getPosition()
    if (!editor || !model || !position) return ''
    return model.getWordAtPosition(position)?.word || ''
  }, [])

  const currentPosition = useCallback(() => {
    const position = editorRef.current?.getPosition()
    return position ? { line: position.lineNumber, column: position.column } : null
  }, [])

  const openReference = useCallback((ref: WorkspaceReference) => {
    setPendingReveal(ref)
    setSelectedFile(ref.path)
    addOpenFile(ref.path)
  }, [addOpenFile, setSelectedFile])

  useEffect(() => {
    if (!pendingReveal || selectedFile !== pendingReveal.path || !editorRef.current) return
    const editor = editorRef.current
    editor.setPosition({ lineNumber: pendingReveal.line, column: pendingReveal.column })
    editor.revealLineInCenter(pendingReveal.line)
    editor.focus()
    setPendingReveal(null)
  }, [editorContent, pendingReveal, selectedFile])

  const collectReferences = useCallback(async (word?: string) => {
    const identifier = word || currentIdentifier()
    if (!isValidIdentifier(identifier)) return []
    const position = currentPosition()
    if (workspacePath && selectedFile && hasLanguageService && position) {
      const exact = await window.api.lspReferences(workspacePath, selectedFile, position.line, position.column)
      if (Array.isArray(exact) && exact.length > 0) {
        setReferenceWord(identifier)
        setReferences(exact)
        return exact
      }
    }
    const refs = await findWorkspaceReferences(allFiles, window.api.readFile, identifier)
    setReferenceWord(identifier)
    setReferences(refs)
    return refs
  }, [allFiles, currentIdentifier, currentPosition, hasLanguageService, selectedFile, workspacePath])

  const handleGoToDefinition = useCallback(async () => {
    const editor = editorRef.current
    const word = currentIdentifier()
    if (!editor || !word) return
    const position = currentPosition()
    if (workspacePath && selectedFile && hasLanguageService && position) {
      const exact = await window.api.lspDefinition(workspacePath, selectedFile, position.line, position.column)
      if (exact && !('error' in exact)) {
        openReference(exact)
        return
      }
    }
    await editor.getAction('editor.action.revealDefinition')?.run()
    const refs = await collectReferences(word)
    const target = pickLikelyDefinition(refs, word)
    if (target) openReference(target)
  }, [collectReferences, currentIdentifier, currentPosition, hasLanguageService, openReference, selectedFile, workspacePath])

  const handleFindReferences = useCallback(async () => {
    const word = currentIdentifier()
    const refs = await collectReferences(word)
    if (word) {
      addTerminalEntry({
        id: Date.now().toString(),
        type: 'output',
        content: refs.length ? `Found ${refs.length} reference(s) for "${word}".` : `No references found for "${word}".`,
        timestamp: Date.now(),
      })
    }
  }, [addTerminalEntry, collectReferences, currentIdentifier])

  const handleRenameSymbol = useCallback(async () => {
    const from = currentIdentifier()
    if (!isValidIdentifier(from)) return
    const to = window.prompt(`Rename "${from}" to:`)?.trim()
    if (!to || to === from) return
    if (!isValidIdentifier(to)) {
      window.alert('Use a valid JavaScript/TypeScript-style identifier for workspace rename.')
      return
    }
    const refs = await collectReferences(from)
    const position = currentPosition()
    const exactRename = workspacePath && selectedFile && hasLanguageService && position
    const ok = window.confirm(`Rename ${refs.length} occurrence(s) of "${from}" to "${to}"${exactRename ? ' using language service' : ' across workspace text files'}?`)
    if (!ok) return
    const result = exactRename
      ? await window.api.lspRename(workspacePath, selectedFile, position.line, position.column, to)
      : await renameWorkspaceIdentifier(allFiles, window.api.readFile, window.api.writeFile, from, to)
    if ('error' in result) {
      addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Rename failed: ${result.error}`, timestamp: Date.now() })
      return
    }
    if (selectedFile && result.updatedFiles.includes(selectedFile)) {
      const reloaded = await window.api.readFile(selectedFile)
      if ('content' in reloaded) {
        setEditorContent(reloaded.content)
        setFileContent(reloaded.content)
      }
    }
    setReferences([])
    addTerminalEntry({
      id: Date.now().toString(),
      type: result.errors.length ? 'error' : 'success',
      content: `Renamed ${result.replacements} occurrence(s) in ${result.updatedFiles.length} file(s).${result.errors.length ? ` ${result.errors.length} file(s) failed.` : ''}`,
      timestamp: Date.now(),
    })
  }, [addTerminalEntry, allFiles, collectReferences, currentIdentifier, currentPosition, hasLanguageService, selectedFile, setFileContent, workspacePath])

  const acceptInlineEdit = useCallback(async () => {
    if (!latestInlineEdit || !selectedFile) return
    setFileContent(latestInlineEdit.after)
    setEditorContent(latestInlineEdit.after)
    removeFileEdit(latestInlineEdit.timestamp)
    setDismissedInlineHunks(new Set())
    addTerminalEntry({ id: Date.now().toString(), type: 'success', content: `Accepted inline edit: ${selectedFile}`, timestamp: Date.now() })
  }, [addTerminalEntry, latestInlineEdit, removeFileEdit, selectedFile, setFileContent])

  const rejectInlineEdit = useCallback(async () => {
    if (!latestInlineEdit || !selectedFile) return
    const result = await window.api.writeFile(selectedFile, latestInlineEdit.before)
    if ('error' in result) {
      addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Reject inline edit failed: ${result.error}`, timestamp: Date.now() })
      return
    }
    setFileContent(latestInlineEdit.before)
    setEditorContent(latestInlineEdit.before)
    removeFileEdit(latestInlineEdit.timestamp)
    setDismissedInlineHunks(new Set())
    addTerminalEntry({ id: Date.now().toString(), type: 'success', content: `Rejected inline edit and restored previous file: ${selectedFile}`, timestamp: Date.now() })
  }, [addTerminalEntry, latestInlineEdit, removeFileEdit, selectedFile, setFileContent])

  const acceptInlineHunk = useCallback((hunk: InlineEditHunk) => {
    if (!latestInlineEdit || !selectedFile) return
    const remainingHunks = inlineEditHunks.filter((item) => item.id !== hunk.id)
    if (remainingHunks.length === 0) {
      removeFileEdit(latestInlineEdit.timestamp)
      setDismissedInlineHunks(new Set())
    } else {
      setDismissedInlineHunks((current) => new Set(current).add(hunk.id))
    }
    addTerminalEntry({ id: Date.now().toString(), type: 'success', content: `Accepted inline edit hunk: ${selectedFile}:${hunk.newStart}`, timestamp: Date.now() })
  }, [addTerminalEntry, inlineEditHunks, latestInlineEdit, removeFileEdit, selectedFile])

  const rejectInlineHunk = useCallback(async (hunk: InlineEditHunk) => {
    if (!latestInlineEdit || !selectedFile) return
    const nextContent = rejectInlineEditHunk(editorContent || latestInlineEdit.after, hunk)
    const result = await window.api.writeFile(selectedFile, nextContent)
    if ('error' in result) {
      addTerminalEntry({ id: Date.now().toString(), type: 'error', content: `Reject inline edit hunk failed: ${result.error}`, timestamp: Date.now() })
      return
    }
    setFileContent(nextContent)
    setEditorContent(nextContent)
    const remainingHunks = inlineEditHunks.filter((item) => item.id !== hunk.id)
    if (remainingHunks.length === 0) {
      removeFileEdit(latestInlineEdit.timestamp)
      setDismissedInlineHunks(new Set())
    } else {
      setDismissedInlineHunks((current) => new Set(current).add(hunk.id))
    }
    addTerminalEntry({ id: Date.now().toString(), type: 'success', content: `Rejected inline edit hunk: ${selectedFile}:${hunk.newStart}`, timestamp: Date.now() })
  }, [addTerminalEntry, editorContent, inlineEditHunks, latestInlineEdit, removeFileEdit, selectedFile, setFileContent])

  useEffect(() => {
    let cancelled = false
    if (!workspacePath || !selectedFile || !hasLanguageService) {
      setDiagnostics([])
      return
    }
    const timer = window.setTimeout(() => {
      window.api.lspDiagnostics(workspacePath, selectedFile).then((next) => {
        if (!cancelled && Array.isArray(next)) setDiagnostics(next)
      })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [fileContent, hasLanguageService, selectedFile, workspacePath])

  const handleEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    editorRef.current = editor
    completionProviderRef.current?.dispose()
    completionProviderRef.current = monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', '/', '-', '_'],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }
        const prefix = word.word.toLowerCase()
        const suggestions = completionWordsRef.current
          .filter((item) => !prefix || item.toLowerCase().includes(prefix))
          .slice(0, 80)
          .map((item) => ({
            label: item,
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: item,
            range,
            detail: 'VD local workspace',
            sortText: item.toLowerCase().startsWith(prefix) ? `0${item}` : `1${item}`,
          }))
        return { suggestions }
      },
    })
    editor.addAction({
      id: 'vd.goToDefinition',
      label: 'VD: Go to Definition',
      keybindings: [monaco.KeyCode.F12],
      run: () => { void handleGoToDefinition() },
    })
    editor.addAction({
      id: 'vd.findWorkspaceReferences',
      label: 'VD: Find Workspace References',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.F12],
      run: () => { void handleFindReferences() },
    })
    editor.addAction({
      id: 'vd.renameWorkspaceSymbol',
      label: 'VD: Rename Workspace Symbol',
      keybindings: [monaco.KeyCode.F2],
      run: () => { void handleRenameSymbol() },
    })
  }, [handleFindReferences, handleGoToDefinition, handleRenameSymbol, language])

  useEffect(() => () => {
    completionProviderRef.current?.dispose()
    completionProviderRef.current = null
  }, [])

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
            <button className="btn btn-sm" onClick={handleGoToDefinition} title="Go to definition (F12)">
              Def
            </button>
            <button className="btn btn-sm" onClick={handleFindReferences} title="Find workspace references (Ctrl+Shift+F12)">
              Refs
            </button>
            <button className="btn btn-sm" onClick={handleRenameSymbol} title="Rename exact identifier across workspace text files (F2)">
              Rename
            </button>
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

      {references.length > 0 && (
        <div style={{
          maxHeight: 160,
          overflow: 'auto',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 10px',
            fontSize: 12,
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)',
          }}>
            <span>{references.length} reference(s) for <strong style={{ color: 'var(--text-primary)' }}>{referenceWord}</strong></span>
            <button className="btn btn-sm" onClick={() => setReferences([])}>Close</button>
          </div>
          {references.slice(0, 80).map((ref, index) => (
            <button
              key={`${ref.path}:${ref.line}:${ref.column}:${index}`}
              onClick={() => openReference(ref)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--accent)' }}>{ref.path}:{ref.line}:{ref.column}</span>
              <span style={{ marginLeft: 8, fontFamily: 'monospace' }}>{ref.preview}</span>
            </button>
          ))}
        </div>
      )}

      {diagnostics.length > 0 && (
        <div style={{
          maxHeight: 130,
          overflow: 'auto',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
            TypeScript diagnostics
          </div>
          {diagnostics.slice(0, 40).map((diag, index) => (
            <button
              key={`${diag.path}:${diag.line}:${diag.column}:${index}`}
              onClick={() => openReference(diag)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                background: 'transparent',
                color: diag.severity === 'error' ? '#f87171' : diag.severity === 'warning' ? '#fbbf24' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
              }}
            >
              <span>{diag.line}:{diag.column}</span>
              <span style={{ marginLeft: 8 }}>{diag.message}</span>
            </button>
          ))}
        </div>
      )}

      {latestInlineEdit && latestInlineEditSummary && (
        <div style={{
          background: 'rgba(59,130,246,0.10)',
          borderBottom: '1px solid rgba(59,130,246,0.25)',
          padding: '8px 10px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Inline edit proposal: {latestInlineEditSummary.changedLines} changed line(s)
              {latestInlineEditSummary.addedLines ? `, +${latestInlineEditSummary.addedLines}` : ''}
              {latestInlineEditSummary.removedLines ? `, -${latestInlineEditSummary.removedLines}` : ''}
              {inlineEditHunks.length ? ` across ${inlineEditHunks.length} hunk(s)` : ''}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-success" onClick={acceptInlineEdit}>Accept all</button>
              <button className="btn btn-sm" onClick={rejectInlineEdit}>Reject all</button>
            </span>
          </div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 240, overflow: 'auto' }}>
            {inlineEditHunks.slice(0, 8).map((hunk) => (
              <div key={hunk.id} style={{
                border: '1px solid rgba(148,163,184,0.20)',
                borderRadius: 6,
                background: 'rgba(15,23,42,0.35)',
                overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  alignItems: 'center',
                  padding: '5px 7px',
                  borderBottom: '1px solid rgba(148,163,184,0.16)',
                }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Lines {hunk.newEnd >= hunk.newStart ? `${hunk.newStart}-${hunk.newEnd}` : `${hunk.newStart}`}
                  </span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-sm btn-success" onClick={() => acceptInlineHunk(hunk)}>Accept hunk</button>
                    <button className="btn btn-sm" onClick={() => rejectInlineHunk(hunk)}>Reject hunk</button>
                  </span>
                </div>
                <pre style={{
                  margin: 0,
                  maxHeight: 115,
                  overflow: 'auto',
                  padding: '6px 7px',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  whiteSpace: 'pre',
                }}>{hunk.preview}</pre>
              </div>
            ))}
            {inlineEditHunks.length > 8 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {inlineEditHunks.length - 8} more hunk(s). Accept or reject visible hunks to continue reviewing.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Monaco Editor (lazy-loaded) */}
      {selectedFile && languageReady ? (
        <Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading editor...</div>}>
        <Editor
          language={language}
          value={editorContent}
          onMount={handleEditorMount}
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
            quickSuggestions: { other: true, comments: false, strings: false },
            suggestOnTriggerCharacters: true,
            tabCompletion: 'on',
            wordBasedSuggestions: 'matchingDocuments',
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
        </Suspense>
      ) : selectedFile ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading {language} support...</div>
        </div>
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

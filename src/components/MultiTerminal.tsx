/**
 * MultiTerminal — Multi-tab terminal with PTY
 *
 * Features:
 * - Multiple terminal tabs (add/remove)
 * - Real PTY shells (PowerShell on Windows, bash on Mac/Linux)
 * - xterm.js with fit addon and web links
 * - Per-instance cleanup on close
 */
import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'
import { useStore } from '../store'

interface TermInstance {
  terminal: Terminal
  fitAddon: FitAddon
  termId: string
  cleanup: () => void
}

export default function MultiTerminal() {
  const {
    workspacePath, terminalTabs, addTerminalTab, removeTerminalTab,
    activeTerminalTab, setActiveTerminalTab,
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const instancesRef = useRef<Map<string, TermInstance>>(new Map())
  const termCounterRef = useRef(1)

  // Create a terminal instance with proper listener cleanup
  const createTerm = useCallback((tabId: string, container: HTMLDivElement) => {
    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      theme: {
        background: '#0a0e1a',
        foreground: '#e2e8f0',
        cursor: '#3b82f6',
        selectionBackground: '#334155',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
      },
      cursorBlink: true,
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(container)
    fitAddon.fit()

    const termId = `term-${tabId}`
    const cwd = workspacePath || process.env.HOME || '.'

    window.api.terminalCreate(termId, cwd)

    // Store listener references so we can remove them later
    const dataHandler = (id: string, data: string) => {
      if (id === termId) term.write(data)
    }
    const exitHandler = (id: string, code: number) => {
      if (id === termId) {
        term.writeln(`\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m`)
      }
    }

    window.api.onTerminalData(dataHandler)
    window.api.onTerminalExit(exitHandler)
    term.onData((data) => window.api.terminalWrite(termId, data))

    term.writeln('\x1b[36m╔═══════════════════════════════════════╗\x1b[0m')
    term.writeln('\x1b[36m║       Freebuff Terminal               ║\x1b[0m')
    term.writeln('\x1b[36m╚═══════════════════════════════════════╝\x1b[0m')
    term.writeln('')

    const cleanup = () => {
      window.api.terminalKill(termId)
      term.dispose()
    }

    const instance: TermInstance = { terminal: term, fitAddon, termId, cleanup }
    instancesRef.current.set(tabId, instance)
    return instance
  }, [workspacePath])

  // Mount active terminal
  useEffect(() => {
    if (!activeTerminalTab || !containerRef.current) return
    const container = containerRef.current

    // Clear container
    container.innerHTML = ''

    // Check if instance already exists
    let instance = instancesRef.current.get(activeTerminalTab)
    if (instance) {
      container.appendChild(instance.terminal.element!)
      instance.fitAddon.fit()
      return
    }

    // Create new
    instance = createTerm(activeTerminalTab, container)

    // Resize observer
    const ro = new ResizeObserver(() => {
      instance?.fitAddon.fit()
      if (instance) {
        window.api.terminalResize(instance.termId, instance.terminal.cols, instance.terminal.rows)
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
    }
  }, [activeTerminalTab, createTerm])

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      instancesRef.current.forEach((inst) => inst.cleanup())
      instancesRef.current.clear()
    }
  }, [])

  const handleAddTab = useCallback(() => {
    termCounterRef.current += 1
    const count = termCounterRef.current
    const newTab = {
      id: `term-tab-${Date.now()}`,
      name: `Terminal ${count}`,
      cwd: workspacePath || '',
    }
    addTerminalTab(newTab)
  }, [workspacePath])

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    const inst = instancesRef.current.get(tabId)
    if (inst) {
      inst.cleanup()
      instancesRef.current.delete(tabId)
    }
    removeTerminalTab(tabId)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)', height: 34, flexShrink: 0,
        overflow: 'auto',
      }}>
        {terminalTabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTerminalTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 12px', height: 34, fontSize: 12, cursor: 'pointer',
              borderRight: '1px solid var(--border)',
              background: activeTerminalTab === tab.id ? '#0a0e1a' : 'transparent',
              color: activeTerminalTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              borderBottom: activeTerminalTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--success)',
            }} />
            {tab.name}
            {terminalTabs.length > 1 && (
              <span
                onClick={(e) => handleCloseTab(e, tab.id)}
                style={{ fontSize: 14, opacity: 0.4, padding: '0 2px', borderRadius: 3 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4' }}
              >
                ×
              </span>
            )}
          </div>
        ))}
        <button
          onClick={handleAddTab}
          style={{
            height: 34, padding: '0 10px', background: 'transparent',
            border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: 16,
          }}
          title="New Terminal"
        >
          +
        </button>
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        style={{ flex: 1, background: '#0a0e1a', padding: '2px 0 0 2px' }}
      />
    </div>
  )
}

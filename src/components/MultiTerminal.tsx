/**
 * @author Virender Dhiman
 * @year 2025
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */
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
import type { ITheme } from 'xterm'
import 'xterm/css/xterm.css'
import { useStore } from '../store'

interface TermInstance {
  terminal: Terminal
  fitAddon: FitAddon
  termId: string
  disposed: boolean
  cleanup: () => void
}

export default function MultiTerminal() {
  const {
    workspacePath, terminalTabs, addTerminalTab, removeTerminalTab,
    activeTerminalTab, setActiveTerminalTab,
  } = useStore()
  const themePreference = useStore((state) => state.settings.theme)

  const containerRef = useRef<HTMLDivElement>(null)
  const instancesRef = useRef<Map<string, TermInstance>>(new Map())
  const termCounterRef = useRef(1)

  const readTerminalTheme = useCallback((): ITheme => {
    const style = window.getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    return {
      // xterm expects concrete CSS colors; custom-property aliases such as
      // `var(--text-primary)` are not valid xterm color values.
      background: read('--bg-primary', 'transparent'),
      foreground: read('--text-primary', 'currentColor'),
      cursor: read('--accent', 'currentColor'),
      selectionBackground: read('--bg-tertiary', 'transparent'),
      black: read('--bg-secondary', 'currentColor'),
      red: read('--error', 'currentColor'),
      green: read('--success', 'currentColor'),
      yellow: read('--warning', 'currentColor'),
      blue: read('--accent', 'currentColor'),
      magenta: read('--category-community', 'currentColor'),
      cyan: read('--category-local', 'currentColor'),
      white: read('--text-primary', 'currentColor'),
    }
  }, [])

  const fitTerminal = useCallback((instance: TermInstance, container?: HTMLElement | null) => {
    const target = container || instance.terminal.element?.parentElement
    const element = instance.terminal.element
    if (instance.disposed || !element || !element.isConnected || !target || !target.isConnected || target.clientWidth <= 0 || target.clientHeight <= 0) return false
    const style = window.getComputedStyle(target)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    if (instance.terminal.cols <= 0 || instance.terminal.rows <= 0) return false
    const core = (instance.terminal as Terminal & {
      _core?: { _renderService?: { dimensions?: { css?: { cell?: { width?: number; height?: number } } } } }
    })._core
    const cell = core?._renderService?.dimensions?.css?.cell
    if (!cell?.width || !cell.height) return false
    try {
      instance.fitAddon.fit()
      return true
    } catch (err) {
      console.warn('PIT Agent terminal fit skipped:', err)
      return false
    }
  }, [])

  // Create a terminal instance with proper listener cleanup
  const createTerm = useCallback((tabId: string, container: HTMLDivElement) => {
    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      theme: readTerminalTheme(),
      cursorBlink: true,
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(container)

    const termId = `term-${tabId}`
    // Renderer code cannot rely on Node globals. The main process resolves the
    // relative fallback using its own platform-specific working directory.
    const cwd = workspacePath || '.'

    window.api.terminalCreate(termId, cwd)

    // The IPC listeners outlive the terminal, so ignore output after dispose.
    let disposed = false
    const dataHandler = (id: string, data: string) => {
      if (!disposed && id === termId) term.write(data)
    }
    const exitHandler = (id: string, code: number) => {
      if (!disposed && id === termId) {
        term.writeln(`\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m`)
      }
    }

    window.api.onTerminalData(dataHandler)
    window.api.onTerminalExit(exitHandler)
    term.onData((data) => window.api.terminalWrite(termId, data))

    const instance: TermInstance = { terminal: term, fitAddon, termId, disposed: false, cleanup: () => {} }
    let bannerFrame = 0
    const cleanup = () => {
      instance.disposed = true
      disposed = true
      if (bannerFrame) cancelAnimationFrame(bannerFrame)
      window.api.terminalKill(termId)
      // xterm can have a viewport refresh queued when a right-panel tab is
      // switched. Let that frame drain before disposing its render service;
      // disposing synchronously can make Viewport._innerRefresh read missing
      // render dimensions in the renderer.
      let frames = 0
      const disposeAfterRefresh = () => {
        if (++frames < 2) requestAnimationFrame(disposeAfterRefresh)
        else term.dispose()
      }
      requestAnimationFrame(disposeAfterRefresh)
    }

    instance.cleanup = cleanup
    instancesRef.current.set(tabId, instance)
    const writeBanner = () => {
      bannerFrame = 0
      if (instance.disposed || !term.element?.isConnected) return
      if (!fitTerminal(instance, container)) {
        bannerFrame = requestAnimationFrame(writeBanner)
        return
      }
      term.writeln('\x1b[36m╔═══════════════════════════════════════╗\x1b[0m')
      term.writeln('\x1b[36m║         PIT Agent Terminal            ║\x1b[0m')
      term.writeln('\x1b[36m╚═══════════════════════════════════════╝\x1b[0m')
      term.writeln('')
      window.api.terminalResize(instance.termId, instance.terminal.cols, instance.terminal.rows)
    }
    const fitWhenVisible = () => {
      let attempts = 0
      const attempt = () => {
        attempts += 1
        if (fitTerminal(instance, container)) {
          window.api.terminalResize(instance.termId, instance.terminal.cols, instance.terminal.rows)
        } else if (attempts < 12 && instance.terminal.element?.isConnected) {
          requestAnimationFrame(attempt)
        }
      }
      requestAnimationFrame(attempt)
    }
    fitWhenVisible()
    bannerFrame = requestAnimationFrame(writeBanner)
    return instance
  }, [workspacePath, fitTerminal, readTerminalTheme])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      for (const instance of instancesRef.current.values()) {
        instance.terminal.options.theme = readTerminalTheme()
        instance.terminal.refresh(0, Math.max(0, instance.terminal.rows - 1))
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [themePreference, readTerminalTheme])

  // Mount active terminal
  useEffect(() => {
    if (!activeTerminalTab || !containerRef.current) return
    const container = containerRef.current

    const visible = () => {
      if (!container.isConnected || container.clientWidth <= 0 || container.clientHeight <= 0) return false
      const style = window.getComputedStyle(container)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }
    let instance = instancesRef.current.get(activeTerminalTab)
    const mount = () => {
      if (!visible()) return
      if (!instance) instance = createTerm(activeTerminalTab, container)
      instancesRef.current.forEach((candidate) => {
        const element = candidate.terminal.element
        if (!element) return
        if (element.parentElement !== container) container.appendChild(element)
        element.style.display = candidate === instance ? 'block' : 'none'
      })
      scheduleFit()
    }

    const scheduleFit = () => {
      requestAnimationFrame(() => {
        if (instance && fitTerminal(instance, container)) window.api.terminalResize(instance.termId, instance.terminal.cols, instance.terminal.rows)
      })
    }
    mount()

    // Resize observer
    const ro = new ResizeObserver(() => {
      mount()
    })
    ro.observe(container)
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden' && instance) {
        scheduleFit()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [activeTerminalTab, createTerm, fitTerminal])

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
              background: activeTerminalTab === tab.id ? 'var(--terminal-bg)' : 'transparent',
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
        style={{ flex: 1, background: 'var(--terminal-bg)', padding: '2px 0 0 2px' }}
      />
    </div>
  )
}

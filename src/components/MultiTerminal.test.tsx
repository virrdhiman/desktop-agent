import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { useStore } from '../store'
import MultiTerminal from './MultiTerminal'

const { fitMock, terminalInstances } = vi.hoisted(() => ({ fitMock: vi.fn(), terminalInstances: [] as Array<{ options: { theme: Record<string, string> } }> }))

vi.mock('xterm', () => ({
  Terminal: class MockTerminal {
    element = document.createElement('div')
    cols = 80
    rows = 24
    options = { theme: {} }
    _core = { _renderService: { dimensions: { css: { cell: { width: 8, height: 16 } } } } }
    constructor() { terminalInstances.push(this) }
    loadAddon() {}
    open(container: HTMLElement) { container.appendChild(this.element) }
    onData() { return { dispose() {} } }
    write() {}
    writeln() {}
    refresh() {}
    dispose() {}
  },
}))

vi.mock('xterm-addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit() { fitMock() }
  },
}))

vi.mock('xterm-addon-web-links', () => ({
  WebLinksAddon: class MockWebLinksAddon {},
}))

describe('MultiTerminal renderer safety', () => {
  beforeEach(() => {
    useStore.setState({
      workspacePath: '',
      terminalTabs: [{ id: 'term-1', name: 'Terminal 1', cwd: '' }],
      activeTerminalTab: 'term-1',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders when the Node process global is unavailable', () => {
    const originalProcess = globalThis.process
    let view: ReturnType<typeof render> | undefined
    let renderError: unknown

    try {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 })
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 240 })
      Object.defineProperty(globalThis, 'process', { configurable: true, value: undefined })
      view = render(<MultiTerminal />)
    } catch (error) {
      renderError = error
    } finally {
      Object.defineProperty(globalThis, 'process', { configurable: true, value: originalProcess })
      delete (HTMLElement.prototype as unknown as { clientWidth?: number }).clientWidth
      delete (HTMLElement.prototype as unknown as { clientHeight?: number }).clientHeight
    }

    expect(renderError).toBeUndefined()
    expect(window.api.terminalCreate).toHaveBeenCalledWith('term-term-1', '.')
    view?.unmount()
  })

  it('does not fit a terminal before its container has a visible size', () => {
    fitMock.mockClear()
    const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 0 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 0 })
    const view = render(<MultiTerminal />)
    expect(fitMock).not.toHaveBeenCalled()
    view.unmount()
    if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  })

  it('refits after a visible panel resize and active-tab switch', async () => {
    const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    const originalObserver = global.ResizeObserver
    let resize: (() => void) | undefined
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 240 })
    global.ResizeObserver = class ResizeObserver {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    fitMock.mockClear()
    const view = render(<MultiTerminal />)
    await waitFor(() => expect(fitMock).toHaveBeenCalled())
    const firstCount = fitMock.mock.calls.length
    await act(async () => {
      resize?.()
      useStore.setState({
        terminalTabs: [{ id: 'term-1', name: 'Terminal 1', cwd: '' }, { id: 'term-2', name: 'Terminal 2', cwd: '' }],
        activeTerminalTab: 'term-2',
      })
    })
    await waitFor(() => expect(fitMock.mock.calls.length).toBeGreaterThan(firstCount))
    view.unmount()
    global.ResizeObserver = originalObserver
    if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  })

  it('passes concrete theme colors to xterm and refreshes them when the preference changes', async () => {
    terminalInstances.length = 0
    const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 240 })
    const root = document.documentElement
    root.style.setProperty('--terminal-bg', 'var(--bg-primary)')
    root.style.setProperty('--terminal-fg', 'var(--text-primary)')
    root.style.setProperty('--terminal-cursor', 'var(--accent)')
    root.style.setProperty('--terminal-selection', 'var(--bg-tertiary)')
    root.style.setProperty('--bg-primary', '#fff8fc')
    root.style.setProperty('--text-primary', '#25131e')
    root.style.setProperty('--bg-tertiary', '#fbe5ef')
    root.style.setProperty('--accent', '#be185d')
    useStore.setState({ settings: { ...useStore.getState().settings, theme: 'pink-light' } })
    const view = render(<MultiTerminal />)
    await waitFor(() => expect(terminalInstances[0]?.options.theme.foreground).toBe('#25131e'))

    await act(async () => {
      root.style.setProperty('--bg-primary', '#170b14')
      root.style.setProperty('--text-primary', '#fff1f7')
      root.style.setProperty('--bg-tertiary', '#3a1a2d')
      root.style.setProperty('--accent', '#ff8bc3')
      useStore.setState({ settings: { ...useStore.getState().settings, theme: 'pink-dark' } })
    })
    await waitFor(() => {
      expect(terminalInstances[0]?.options.theme).toMatchObject({
        background: '#170b14', foreground: '#fff1f7', cursor: '#ff8bc3', selectionBackground: '#3a1a2d',
      })
    })
    view.unmount()
    root.style.cssText = ''
    if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
    else delete (HTMLElement.prototype as unknown as { clientWidth?: number }).clientWidth
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
    else delete (HTMLElement.prototype as unknown as { clientHeight?: number }).clientHeight
  })
})

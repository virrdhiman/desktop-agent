import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { useStore } from '../store'
import MultiTerminal from './MultiTerminal'

const { fitMock } = vi.hoisted(() => ({ fitMock: vi.fn() }))

vi.mock('xterm', () => ({
  Terminal: class MockTerminal {
    element = document.createElement('div')
    cols = 80
    rows = 24
    loadAddon() {}
    open(container: HTMLElement) { container.appendChild(this.element) }
    onData() { return { dispose() {} } }
    write() {}
    writeln() {}
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
      Object.defineProperty(globalThis, 'process', { configurable: true, value: undefined })
      view = render(<MultiTerminal />)
    } catch (error) {
      renderError = error
    } finally {
      Object.defineProperty(globalThis, 'process', { configurable: true, value: originalProcess })
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
})

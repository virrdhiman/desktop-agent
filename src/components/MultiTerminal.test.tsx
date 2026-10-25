import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useStore } from '../store'
import MultiTerminal from './MultiTerminal'

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
    fit() {}
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
})

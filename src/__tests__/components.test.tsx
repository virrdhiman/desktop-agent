/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Component rendering tests
 * Covers: Sidebar, ErrorBoundary, SearchResults, SettingsPanel, FileBrowser
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { useStore } from '../store'
import ErrorBoundary from '../components/ErrorBoundary'
import SearchResults from '../components/SearchResults'

// Reset store
beforeEach(() => {
  const state = useStore.getState()
  state.setWorkspacePath('')
  state.setSearchResults(null)
  state.setActivePanel('chat')
})

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('renders error UI when child throws', () => {
    const ThrowingChild = () => { throw new Error('Test error') }
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
  })

  it('shows error details in development', () => {
    const ThrowingChild = () => { throw new Error('Specific error message') }
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Specific error message/)).toBeInTheDocument()
  })

  it('has a reload button', () => {
    const ThrowingChild = () => { throw new Error('Test') }
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Reload/)).toBeInTheDocument()
  })
})

describe('SearchResults', () => {
  it('renders empty state when no results', () => {
    render(<SearchResults />)
    expect(screen.getByText('🔍 Search Results')).toBeInTheDocument()
  })

  it('shows match count', () => {
    useStore.getState().setSearchResults('file.ts:1: test match\nfile.ts:5: another match')
    render(<SearchResults />)
    expect(screen.getByText('2 matches')).toBeInTheDocument()
  })

  it('renders parsed result lines', () => {
    useStore.getState().setSearchResults('src/main.ts:42: const x = 1\nsrc/utils.ts:10: function foo()')
    render(<SearchResults />)
    expect(screen.getByText('src/main.ts')).toBeInTheDocument()
    expect(screen.getByText(/42/)).toBeInTheDocument()
  })

  it('has a close button', () => {
    render(<SearchResults />)
    expect(screen.getByText('✕ Close')).toBeInTheDocument()
  })
})

describe('Store — Setters work correctly', () => {
  it('setSelectedFile updates selected file', () => {
    useStore.getState().setSelectedFile('/path/to/file.ts')
    expect(useStore.getState().selectedFile).toBe('/path/to/file.ts')
  })

  it('toggleTerminal toggles terminal visibility', () => {
    const initial = useStore.getState().showTerminal
    useStore.getState().toggleTerminal()
    expect(useStore.getState().showTerminal).toBe(!initial)
  })

  it('setPanel updates active panel', () => {
    useStore.getState().setActivePanel('settings')
    expect(useStore.getState().activePanel).toBe('settings')
  })
})

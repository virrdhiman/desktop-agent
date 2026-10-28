/**
 * @author Virender Dhiman
 * @year 2025
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * ErrorBoundary — React error boundary for crash recovery
 *
 * Catches JavaScript errors in the component tree and shows
 * a friendly error screen with the ability to reset and continue.
 * Without this, any rendering error would crash the entire app.
 */
import { Component, type ReactNode } from 'react'
import { APP_NAME } from '../lib/brand'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error(`${APP_NAME} ErrorBoundary caught:`, error, errorInfo)
    void window.api.recordDiagnostics({
      source: 'renderer',
      severity: 'error',
      message: error.message || 'Unhandled renderer error',
      stack: [error.stack, errorInfo?.componentStack].filter(Boolean).join('\n'),
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)',
          color: 'var(--text-primary)', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, maxWidth: 480, lineHeight: 1.6 }}>
            {APP_NAME} hit an unexpected render error. Your files and settings were not modified.
          </p>
          <div style={{
            padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8,
            border: '1px solid var(--border)', marginBottom: 20, maxWidth: 600,
            fontFamily: 'monospace', fontSize: 12, color: 'var(--error)',
            textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 200, overflow: 'auto',
          }}>
            {this.state.error?.message || 'Unknown error'}
            {this.state.error?.stack && (
              <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 11 }}>
                {this.state.error.stack.split('\n').slice(1, 5).join('\n')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', cursor: 'pointer',
              }}
            >
              🔄 Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 14,
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              🔃 Reload App
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

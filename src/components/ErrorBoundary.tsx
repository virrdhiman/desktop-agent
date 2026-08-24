/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * ErrorBoundary — React error boundary for crash recovery
 *
 * Catches JavaScript errors in the component tree and shows
 * a friendly error screen with the ability to reset and continue.
 * Without this, any rendering error would crash the entire app.
 */
import { Component, type ReactNode } from 'react'

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
    console.error('Freebuff ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: '#0f172a',
          color: '#f1f5f9', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20, maxWidth: 480, lineHeight: 1.6 }}>
            Freebuff encountered an unexpected error. Your data is safe — this is a rendering issue, not a data loss.
          </p>
          <div style={{
            padding: '12px 16px', background: '#1e293b', borderRadius: 8,
            border: '1px solid #334155', marginBottom: 20, maxWidth: 600,
            fontFamily: 'monospace', fontSize: 12, color: '#f87171',
            textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 200, overflow: 'auto',
          }}>
            {this.state.error?.message || 'Unknown error'}
            {this.state.error?.stack && (
              <div style={{ marginTop: 8, color: '#64748b', fontSize: 11 }}>
                {this.state.error.stack.split('\n').slice(1, 5).join('\n')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer',
              }}
            >
              🔄 Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 14,
                background: '#334155', color: '#f1f5f9', border: '1px solid #475569', cursor: 'pointer',
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

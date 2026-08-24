/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Shared style constants — replaces inline style={{}} across components
 * Centralizes all UI styling for consistency and maintainability
 */

// ═══ Layout ═══════════════════════════════════════════════════════════════
export const LAYOUT = {
  panelHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    minHeight: 40,
  },
  panelBody: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 8,
  },
  flexCol: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
  },
  flexRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  flexCenter: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    margin: '2px 0',
  },
  separator: {
    borderTop: '1px solid var(--border)',
    paddingTop: 12,
    marginTop: 12,
  },
} as const

// ═══ Typography ════════════════════════════════════════════════════════════
export const TEXT = {
  heading: {
    fontSize: 14,
    fontWeight: 600 as const,
  },
  subheading: {
    fontSize: 13,
    fontWeight: 600 as const,
  },
  body: {
    fontSize: 13,
    lineHeight: 1.5,
  },
  small: {
    fontSize: 12,
  },
  muted: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  tiny: {
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  monospace: {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: 600 as const,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
} as const

// ═══ Buttons ══════════════════════════════════════════════════════════════
export const BTN = {
  icon: {
    height: 42,
    minWidth: 42,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconSm: {
    height: 28,
    minWidth: 28,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontSize: 12,
  },
  group: {
    display: 'flex' as const,
    gap: 4,
  },
} as const

// ═══ Inputs ═══════════════════════════════════════════════════════════════
export const INPUT = {
  text: {
    flex: 1,
    fontSize: 13,
  },
  small: {
    fontSize: 12,
    padding: '4px 8px',
  },
  tiny: {
    fontSize: 11,
    padding: '3px 6px',
  },
  monospace: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  },
  textarea: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    resize: 'vertical' as const,
  },
} as const

// ═══ Cards ════════════════════════════════════════════════════════════════
export const CARD = {
  base: {
    padding: '8px 12px',
    borderRadius: 6,
    cursor: 'pointer' as const,
    fontSize: 12,
    lineHeight: 1.5,
  },
  hoverable: {
    padding: '6px 10px',
    borderRadius: 4,
    cursor: 'pointer' as const,
    fontSize: 12,
    lineHeight: 1.5,
  },
  provider: {
    padding: '10px 14px',
    borderRadius: 8,
    cursor: 'pointer' as const,
    border: '1px solid var(--border)',
  },
  providerSelected: {
    padding: '10px 14px',
    borderRadius: 8,
    cursor: 'pointer' as const,
    border: '1px solid var(--accent)',
    background: 'rgba(59, 130, 246, 0.1)',
  },
} as const

// ═══ Chat ═════════════════════════════════════════════════════════════════
export const CHAT = {
  messageUser: {
    padding: '10px 14px',
    borderRadius: 12,
    background: 'var(--accent)',
    color: 'white',
    maxWidth: '80%',
    marginLeft: 'auto',
    fontSize: 13,
    lineHeight: 1.6,
  },
  messageAssistant: {
    padding: '10px 14px',
    borderRadius: 12,
    background: 'var(--bg-tertiary)',
    maxWidth: '80%',
    fontSize: 13,
    lineHeight: 1.6,
  },
  input: {
    flex: 1,
    fontSize: 13,
    minHeight: 42,
    resize: 'none' as const,
    lineHeight: 1.5,
  },
  statusBar: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 4,
  },
  statusRight: {
    display: 'flex' as const,
    gap: 8,
    alignItems: 'center' as const,
  },
  toolCall: {
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    background: 'var(--bg-tertiary)',
    borderLeft: '2px solid var(--accent)',
    marginBottom: 4,
  },
  progressTrack: {
    width: 60,
    height: 4,
    background: 'var(--border)',
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s',
  },
} as const

// ═══ Git ══════════════════════════════════════════════════════════════════
export const GIT = {
  fileRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '4px 8px',
    borderRadius: 4,
    cursor: 'pointer' as const,
    fontSize: 12,
  },
  badge: {
    fontSize: 9,
    fontWeight: 700 as const,
    width: 16,
    height: 16,
    borderRadius: 3,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    color: 'white',
  },
  diffLine: {
    padding: '2px 8px',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: 'pre-wrap' as const,
    lineHeight: 1.5,
  },
  commitRow: {
    padding: '6px 8px',
    borderRadius: 4,
    cursor: 'pointer' as const,
    fontSize: 12,
    borderBottom: '1px solid var(--border)',
  },
} as const

// ═══ File Tree ═════════════════════════════════════════════════════════════
export const FILE = {
  treeItem: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 4,
    padding: '3px 8px',
    cursor: 'pointer' as const,
    fontSize: 12,
    borderRadius: 4,
  },
  breadcrumb: {
    padding: '4px 12px',
    fontSize: 11,
    color: 'var(--text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
    borderBottom: '1px solid var(--border)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
} as const

// ═══ Empty States ═════════════════════════════════════════════════════════
export const EMPTY = {
  container: {
    flex: 1,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 12,
    padding: 20,
    textAlign: 'center' as const,
  },
  icon: {
    fontSize: 48,
    opacity: 0.3,
  },
  text: {
    fontSize: 14,
    fontWeight: 500 as const,
  },
  subtext: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
  },
} as const

// ═══ Context Menu ═════════════════════════════════════════════════════════
export const CONTEXT = {
  menu: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '4px 0',
    minWidth: 160,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  item: {
    padding: '6px 12px',
    cursor: 'pointer' as const,
    fontSize: 12,
    display: 'flex' as const,
    gap: 8,
  },
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
} as const

// ═══ Provider Settings ════════════════════════════════════════════════════
export const SETTINGS = {
  row: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  section: {
    marginTop: 16,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: 600 as const,
    marginBottom: 10,
  },
  note: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 6,
    lineHeight: 1.6,
  },
  inputGroup: {
    display: 'flex' as const,
    gap: 8,
    alignItems: 'flex-end',
  },
} as const

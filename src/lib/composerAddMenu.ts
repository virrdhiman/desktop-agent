export type ComposerMenuSection = 'add' | 'tools'

export type ComposerMenuItem = {
  id: string
  section: ComposerMenuSection
  label: string
  description: string
  icon: string
  hint?: string
  capabilities?: string[]
}

export const COMPOSER_ADD_ITEMS: ComposerMenuItem[] = [
  {
    id: 'context',
    section: 'add',
    label: 'Files and folders',
    description: 'Attach safe workspace paths as context',
    icon: '📎',
  },
  {
    id: 'goal',
    section: 'add',
    label: 'Goal',
    description: 'Keep a task goal visible for this workspace',
    icon: '🎯',
  },
  {
    id: 'plan',
    section: 'add',
    label: 'Plan mode',
    description: 'Propose a plan and wait before running tools',
    icon: '📋',
  },
]

export const COMPOSER_TOOL_ITEMS: ComposerMenuItem[] = [
  {
    id: 'documents',
    section: 'tools',
    label: 'Documents and archives',
    description: 'Inspect ZIP and other supported document archives',
    icon: '🗂️',
    hint: 'Use the document and archive tools for this request.',
    capabilities: ['archive_list', 'archive_extract'],
  },
  {
    id: 'pdf',
    section: 'tools',
    label: 'PDF',
    description: 'Extract text from a supported PDF',
    icon: '📄',
    hint: 'Use the PDF text extraction tool for this request.',
    capabilities: ['pdf_extract_text'],
  },
  {
    id: 'spreadsheets',
    section: 'tools',
    label: 'Spreadsheets',
    description: 'Read or write bounded CSV and XLSX data',
    icon: '📊',
    hint: 'Use the spreadsheet tools for this request.',
    capabilities: ['spreadsheet_read', 'spreadsheet_write'],
  },
  {
    id: 'web',
    section: 'tools',
    label: 'Web search',
    description: 'Search the web for current references',
    icon: '🌐',
    hint: 'Use web search for this request.',
    capabilities: ['web_search'],
  },
  {
    id: 'code',
    section: 'tools',
    label: 'Code search',
    description: 'Search and map the open workspace',
    icon: '🔎',
    hint: 'Search the workspace and inspect the relevant files first.',
    capabilities: ['search_code', 'repo_search', 'repo_map'],
  },
]

export function getComposerMenuItems(toolNames: Iterable<string>): ComposerMenuItem[] {
  const available = new Set(toolNames)
  return [
    ...COMPOSER_ADD_ITEMS,
    ...COMPOSER_TOOL_ITEMS.filter((item) => item.capabilities?.some((name) => available.has(name))),
  ]
}

export function filterComposerItems(items: ComposerMenuItem[], query: string): ComposerMenuItem[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return items
  return items.filter((item) => [item.label, item.description, item.id, item.hint || ''].some((value) => value.toLocaleLowerCase().includes(needle)))
}

function normalizedPath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLocaleLowerCase()
}

export function isProtectedContextPath(filePath: string): boolean {
  const normalized = normalizedPath(filePath)
  const name = normalized.split('/').pop() || ''
  return normalized === 'd:/pit' || normalized.startsWith('d:/pit/') || name.startsWith('.env') || name.includes('key') || name.endsWith('.pem')
}

export function isAllowedContextPath(filePath: string, workspacePath: string): boolean {
  const path = normalizedPath(filePath)
  const workspace = normalizedPath(workspacePath)
  if (!path || !workspace || isProtectedContextPath(filePath)) return false
  return path === workspace || path.startsWith(`${workspace}/`)
}

export function contextHint(paths: string[]): string {
  const safe = paths.filter((path, index) => path.trim() && paths.indexOf(path) === index)
  return safe.length > 0 ? `Attached context:\n${safe.map((path) => `- ${path}`).join('\n')}` : ''
}

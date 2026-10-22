/** First-run prerequisite catalog and renderer-safe validation helpers. */
export type SetupItemId = 'vscode' | 'bridge' | 'ollama'

export type SetupDefinition = {
  id: SetupItemId
  title: string
  detail: string
  size: string
  disk: string
  officialUrl: string
  /** Populated by the main process only when a supported official artifact exists. */
  downloadUrl?: string
  artifactFileName?: string
  unavailableReason?: string
}

export type SetupItem = SetupDefinition & {
  consented: boolean
  completed: boolean
}

export const OFFICIAL_HOSTS = [
  'code.visualstudio.com',
  'update.code.visualstudio.com',
  'marketplace.visualstudio.com',
  'ollama.com',
  'download.ollama.com',
  // Official Ollama release redirects use the project's GitHub repository.
  'github.com',
  // Official VS Code CDN redirects use this Microsoft-owned host.
  'vscode.download.prss.microsoft.com',
  'az764295.vo.msecnd.net',
] as const

export const SETUP_ITEMS: SetupDefinition[] = [
  {
    id: 'vscode',
    title: 'VS Code',
    detail: 'Optional editor integration host. VD Agent works without it.',
    size: 'Approx. 100–200 MB',
    disk: 'Allow at least 500 MB',
    officialUrl: 'https://code.visualstudio.com/download',
  },
  {
    id: 'bridge',
    title: 'VD Agent Bridge',
    detail: 'The signed/packaged VSIX connects the same workspace to VS Code.',
    size: 'Less than 1 MB',
    disk: 'Allow at least 5 MB',
    officialUrl: 'https://code.visualstudio.com/docs/editor/extension-marketplace',
    unavailableReason: 'The signed bridge package is bundled with VD Agent; no external download is configured.',
  },
  {
    id: 'ollama',
    title: 'Ollama + small model',
    detail: 'Optional local AI runtime. The model download is separate and can be large.',
    size: 'Runtime approx. 300 MB; model varies',
    disk: 'Allow at least 2 GB for a small model',
    officialUrl: 'https://ollama.com/download',
  },
]

/**
 * Main-process catalog. The direct artifacts are intentionally limited to
 * official Windows endpoints. Other platforms remain unavailable instead of
 * guessing a package format or launching a page as if it were an installer.
 */
export function getSetupCatalog(platform: NodeJS.Platform = 'win32'): SetupDefinition[] {
  const artifacts: Partial<Record<SetupItemId, Pick<SetupDefinition, 'downloadUrl' | 'artifactFileName'>>> = platform === 'win32'
    ? {
        vscode: {
          downloadUrl: 'https://update.code.visualstudio.com/latest/win32-x64-user/stable',
          artifactFileName: 'VSCodeSetup.exe',
        },
        ollama: {
          downloadUrl: 'https://ollama.com/download/OllamaSetup.exe',
          artifactFileName: 'OllamaSetup.exe',
        },
      }
    : {}

  return SETUP_ITEMS.map((item) => ({
    ...item,
    ...(artifacts[item.id] || {}),
    ...(artifacts[item.id] || item.id === 'bridge'
      ? {}
      : { unavailableReason: 'A verified installer artifact is not configured for this operating system.' }),
  }))
}

export function createSetupItems(
  consent: Partial<Record<SetupItemId, boolean>> = {},
  completed: Partial<Record<SetupItemId, boolean>> = {},
  definitions: SetupDefinition[] = SETUP_ITEMS,
): SetupItem[] {
  return definitions.map((item) => ({
    ...item,
    consented: consent[item.id] === true,
    completed: completed[item.id] === true,
  }))
}

export function isExpectedSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
}

export function isAllowlistedOfficialUrl(value: unknown): value is string {
  try {
    const url = new URL(String(value))
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    const hostname = url.hostname.toLowerCase()
    if (!(OFFICIAL_HOSTS as readonly string[]).includes(hostname)) return false
    if (hostname === 'github.com' && !url.pathname.startsWith('/ollama/ollama/')) return false
    return true
  } catch {
    return false
  }
}

export function canOpenOfficialInstaller(item: SetupDefinition): boolean {
  return isAllowlistedOfficialUrl(item.officialUrl)
}

export function canDownloadInstaller(item: SetupDefinition, expectedSha256: unknown): boolean {
  return Boolean(item.downloadUrl) &&
    isAllowlistedOfficialUrl(item.downloadUrl) &&
    isExpectedSha256(expectedSha256)
}

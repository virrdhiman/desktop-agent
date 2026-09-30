/** Privacy-preserving local diagnostics. Reports metadata only, never user content or paths. */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { redactSecrets } from './conversationStore'

type ProviderLike = {
  id?: unknown
  apiKey?: unknown
  model?: unknown
  models?: unknown
  modelsUpdatedAt?: unknown
  performance?: any
}
export type StorageStats = {
  files: number
  bytes: number
}

export type ConversationDiagnostics = StorageStats & {
  primaryFiles: number
  backupFiles: number
  unreadablePrimaryFiles: number
  storedMessages: number
  schemaVersions: number[]
}

export type DiagnosticsReport = {
  formatVersion: 1
  generatedAt: string
  privacy: {
    apiKeysExcluded: true
    chatContentExcluded: true
    filenamesExcluded: true
    workspacePathsExcluded: true
    sourceCodeExcluded: true
  }
  application: {
    name: string
    version: string
    packaged: boolean
    platform: string
    architecture: string
    osRelease: string
    electron: string
    chrome: string
    node: string
  }
  settings: {
    workspaceConfigured: boolean
    activeProviderConfigured: boolean
    permissionMode: string
    planMode: boolean
    autoUpdate: boolean
    providers: Array<{
      position: number
      active: boolean
      configured: boolean
      selectedModelConfigured: boolean
      discoveredModels: number
      modelsUpdatedAt?: number
      successes: number
      failures: number
      consecutiveFailures: number
      cooldownActive: boolean
    }>
  }
  storage: {
    conversations: ConversationDiagnostics
    checkpoints: StorageStats
    projectMemory: StorageStats
  }
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function safeText(value: unknown, fallback = ''): string {
  return redactSecrets(typeof value === 'string' ? value.slice(0, 200) : fallback)
}

function permissionMode(value: unknown): string {
  return value === 'ask-risky' || value === 'ask-all-writes' || value === 'trusted' ? value : 'unknown'
}

async function directoryStats(dir: string): Promise<StorageStats> {
  let files = 0
  let bytes = 0
  async function walk(current: string) {
    let entries: fs.Dirent[]
    try { entries = await fs.promises.readdir(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const target = path.join(current, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) await walk(target)
      else if (entry.isFile()) {
        files++
        try { bytes += (await fs.promises.stat(target)).size } catch {}
      }
    }
  }
  await walk(dir)
  return { files, bytes }
}

async function conversationDiagnostics(dir: string): Promise<ConversationDiagnostics> {
  const stats: ConversationDiagnostics = {
    files: 0,
    bytes: 0,
    primaryFiles: 0,
    backupFiles: 0,
    unreadablePrimaryFiles: 0,
    storedMessages: 0,
    schemaVersions: [],
  }
  const versions = new Set<number>()
  let names: string[]
  try { names = await fs.promises.readdir(dir) } catch { return stats }
  for (const name of names) {
    const primary = name.endsWith('.json')
    const backup = name.endsWith('.json.bak')
    if (!primary && !backup) continue
    const target = path.join(dir, name)
    stats.files++
    if (primary) stats.primaryFiles++
    if (backup) stats.backupFiles++
    try {
      const stat = await fs.promises.stat(target)
      stats.bytes += stat.size
      if (primary && stat.size <= 8 * 1024 * 1024) {
        const parsed = JSON.parse(await fs.promises.readFile(target, 'utf8'))
        if (Number.isInteger(parsed?.version)) versions.add(parsed.version)
        if (Array.isArray(parsed?.messages)) stats.storedMessages += parsed.messages.length
      }
    } catch {
      if (primary) stats.unreadablePrimaryFiles++
    }
  }
  stats.schemaVersions = [...versions].sort((a, b) => a - b)
  return stats
}

export async function buildDiagnosticsReport(input: {
  userDataDir: string
  settings: any
  appVersion: string
  packaged: boolean
  now?: number
}): Promise<DiagnosticsReport> {
  const providers = Array.isArray(input.settings?.providers) ? input.settings.providers as ProviderLike[] : []
  return {
    formatVersion: 1,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    privacy: {
      apiKeysExcluded: true,
      chatContentExcluded: true,
      filenamesExcluded: true,
      workspacePathsExcluded: true,
      sourceCodeExcluded: true,
    },
    application: {
      name: 'VD Agent',
      version: safeText(input.appVersion, 'unknown'),
      packaged: input.packaged,
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      electron: process.versions.electron || 'unknown',
      chrome: process.versions.chrome || 'unknown',
      node: process.versions.node,
    },
    settings: {
      workspaceConfigured: typeof input.settings?.workspacePath === 'string' && input.settings.workspacePath.length > 0,
      activeProviderConfigured: typeof input.settings?.activeProvider === 'string' && input.settings.activeProvider.length > 0,
      permissionMode: permissionMode(input.settings?.permissionMode),
      planMode: input.settings?.planMode === true,
      autoUpdate: input.settings?.autoUpdate === true,
      providers: providers.map((provider, index) => ({
        position: index + 1,
        active: typeof provider.id === 'string' && provider.id === input.settings?.activeProvider,
        configured: typeof provider.apiKey === 'string' && provider.apiKey.length > 0,
        selectedModelConfigured: typeof provider.model === 'string' && provider.model.length > 0,
        discoveredModels: Array.isArray(provider.models) ? provider.models.length : 0,
        modelsUpdatedAt: finiteNumber(provider.modelsUpdatedAt) || undefined,
        successes: finiteNumber(provider.performance?.successes),
        failures: finiteNumber(provider.performance?.failures),
        consecutiveFailures: finiteNumber(provider.performance?.consecutiveFailures),
        cooldownActive: finiteNumber(provider.performance?.cooldownUntil) > (input.now ?? Date.now()),
      })),
    },
    storage: {
      conversations: await conversationDiagnostics(path.join(input.userDataDir, 'conversations')),
      checkpoints: await directoryStats(path.join(input.userDataDir, 'checkpoints')),
      projectMemory: await directoryStats(path.join(input.userDataDir, 'project-memory')),
    },
  }
}

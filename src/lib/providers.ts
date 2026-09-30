/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import type { AgentTaskKind, ProviderConfig, Settings } from '../types'
import { rankModels } from './modelSelect'

export type ProviderCategory = 'free' | 'local' | 'community' | 'image_video' | 'paid'

export const LOCAL_PROVIDER_IDS = ['ollama', 'lmstudio', 'llamacpp']
export const IMAGE_VIDEO_PROVIDER_IDS = ['flux', 'pollinations_img', 'runway', 'kling', 'replicate', 'stability']
export const COMMUNITY_PROVIDER_IDS = [
  'g4f', 'chatgpt2api', 'zukijourney', 'electronhub', 'voidai', 'nagaai', 'helixmind', 'navyapi',
  'mnn', 'webraftai', 'voltai', 'hcap', 'zanityai', 'kimetsu', 'pollinations',
]

export function getProviderCategory(p: Pick<ProviderConfig, 'id' | 'freeTier'>): ProviderCategory {
  if (LOCAL_PROVIDER_IDS.includes(p.id)) return 'local'
  if (IMAGE_VIDEO_PROVIDER_IDS.includes(p.id)) return 'image_video'
  if (COMMUNITY_PROVIDER_IDS.includes(p.id)) return 'community'
  if (p.freeTier) return 'free'
  return 'paid'
}

export const MAX_PROVIDER_ATTEMPTS = 4

/**
 * Active provider first, then other official free chat providers that have a key.
 * Local servers are skipped (placeholder keys say nothing about whether they are running),
 * and community proxies are never used implicitly because they would receive the user's code.
 */
export function buildProviderChain(
  providers: ProviderConfig[],
  activeId: string,
  max = MAX_PROVIDER_ATTEMPTS,
  taskKind: AgentTaskKind = 'analysis',
  now = Date.now()
): ProviderConfig[] {
  const active = providers.find((p) => p.id === activeId)
  const fallbacks = providers.filter(
    (p) => p.id !== activeId && !!p.apiKey?.trim() && getProviderCategory(p) === 'free'
  ).sort((a, b) => providerScore(b, taskKind, now) - providerScore(a, taskKind, now))
  return [...(active ? [active] : []), ...fallbacks].slice(0, max)
}

function providerScore(provider: ProviderConfig, taskKind: AgentTaskKind, now: number): number {
  const stats = provider.performance
  if (!stats) return 50
  if ((stats.cooldownUntil || 0) > now) return -100
  const total = stats.successes + stats.failures
  const reliability = ((stats.successes + 2) / (total + 4)) * 100
  const latency = stats.avgLatencyMs > 0 ? Math.max(-20, 15 - stats.avgLatencyMs / 1000) : 0
  const taskBonus = stats.taskSuccesses?.[taskKind] ? Math.min(12, stats.taskSuccesses[taskKind]! * 2) : 0
  return reliability + latency + taskBonus - (stats.consecutiveFailures || 0) * 8
}

export function classifyAgentTask(text: string): AgentTaskKind {
  const value = text.toLowerCase()
  if (/\b(readme|documentation|docs|changelog|explain|guide)\b/.test(value)) return 'documentation'
  if (/\b(fix|implement|build|code|refactor|test|bug|repo|file|function|class)\b/.test(value)) return 'coding'
  if (text.length < 180 && !/\b(analy[sz]e|review|compare|research|architecture)\b/.test(value)) return 'quick'
  return 'analysis'
}

export function recordProviderOutcome(
  settings: Settings,
  providerId: string,
  model: string,
  ok: boolean,
  latencyMs: number,
  taskKind: AgentTaskKind,
  now = Date.now()
): Settings {
  return {
    ...settings,
    providers: settings.providers.map((provider) => {
      if (provider.id !== providerId) return provider
      const previous = provider.performance || { successes: 0, failures: 0, avgLatencyMs: 0, lastUsedAt: 0 }
      const attempts = previous.successes + previous.failures
      const average = attempts === 0 ? latencyMs : Math.round((previous.avgLatencyMs * attempts + latencyMs) / (attempts + 1))
      const previousModel = previous.models?.[model] || { successes: 0, failures: 0, avgLatencyMs: 0, lastUsedAt: 0 }
      const modelAttempts = previousModel.successes + previousModel.failures
      const modelAverage = modelAttempts === 0 ? latencyMs : Math.round((previousModel.avgLatencyMs * modelAttempts + latencyMs) / (modelAttempts + 1))
      const consecutiveFailures = ok ? 0 : (previous.consecutiveFailures || 0) + 1
      return {
        ...provider,
        performance: {
          ...previous,
          successes: previous.successes + (ok ? 1 : 0),
          failures: previous.failures + (ok ? 0 : 1),
          avgLatencyMs: average,
          lastUsedAt: now,
          consecutiveFailures,
          cooldownUntil: consecutiveFailures >= 3 ? now + 2 * 60_000 : undefined,
          taskSuccesses: ok
            ? { ...previous.taskSuccesses, [taskKind]: (previous.taskSuccesses?.[taskKind] || 0) + 1 }
            : previous.taskSuccesses,
          models: {
            ...previous.models,
            [model]: {
              ...previousModel,
              successes: previousModel.successes + (ok ? 1 : 0),
              failures: previousModel.failures + (ok ? 0 : 1),
              avgLatencyMs: modelAverage,
              lastUsedAt: now,
              taskSuccesses: ok
                ? { ...previousModel.taskSuccesses, [taskKind]: (previousModel.taskSuccesses?.[taskKind] || 0) + 1 }
                : previousModel.taskSuccesses,
            },
          },
        },
      }
    }),
  }
}

/** Settings as they may be written to an export file: every API key removed. */
export function withoutApiKeys(settings: Settings): Settings {
  return { ...settings, providers: settings.providers.map((p) => ({ ...p, apiKey: '' })) }
}

/** Imported settings keep the keys already stored on this machine unless the file supplies one. */
export function mergeImportedSettings(current: Settings, imported: Settings): Settings {
  const keys = new Map(current.providers.map((p) => [p.id, p.apiKey]))
  return {
    ...current,
    ...imported,
    providers: (imported.providers || current.providers).map((p) => ({ ...p, apiKey: p.apiKey || keys.get(p.id) || '' })),
  }
}

/**
 * Settings with the provider's model replaced by the one that just worked, or null when nothing
 * should be persisted (manual override in effect, unknown provider, or model unchanged).
 */
export function applyDiscoveredModel(
  settings: Settings,
  providerId: string,
  model: string | undefined,
  manualOverride: boolean
): Settings | null {
  if (manualOverride || !model?.trim()) return null
  const provider = settings.providers.find((p) => p.id === providerId)
  if (!provider || provider.model === model) return null
  return {
    ...settings,
    providers: settings.providers.map((p) => (p.id === providerId ? { ...p, model } : p)),
  }
}

function sameList(a: string[] = [], b: string[] = []): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Persist the live chat models a key can currently call. The strongest ranked model becomes
 * the provider's default, and stale/deprecated model IDs disappear from the stored catalog.
 */
export function refreshProviderModelCatalog(
  settings: Settings,
  providerId: string,
  discovered: string[],
  at = Date.now()
): Settings | null {
  const ranked = rankModels(discovered).slice(0, 40)
  if (ranked.length === 0) return null
  const provider = settings.providers.find((p) => p.id === providerId)
  if (!provider) return null

  const nextModel = ranked[0]
  if (provider.model === nextModel && sameList(provider.models, ranked)) return null

  return {
    ...settings,
    providers: settings.providers.map((p) => (
      p.id === providerId ? { ...p, model: nextModel, models: ranked, modelsUpdatedAt: at } : p
    )),
  }
}

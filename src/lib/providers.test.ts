/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import { describe, it, expect } from 'vitest'
import type { ProviderConfig, Settings } from '../types'
import {
  applyDiscoveredModel,
  buildProviderChain,
  getProviderCategory,
  mergeImportedSettings,
  refreshProviderModelCatalog,
  withoutApiKeys,
} from './providers'

const p = (id: string, apiKey = '', freeTier = true, model = 'm'): ProviderConfig => ({
  id, name: id, apiKey, baseUrl: `https://${id}.example/v1`, model, freeTier,
})

const settings = (providers: ProviderConfig[], activeProvider = providers[0]?.id ?? ''): Settings => ({
  providers, activeProvider, workspacePath: '',
})

describe('buildProviderChain', () => {
  it('puts the active provider first, then official free providers with keys', () => {
    const chain = buildProviderChain(
      [p('groq', 'k1'), p('gemini', 'k2'), p('cerebras', ''), p('openai', 'k3', false)],
      'groq'
    )
    expect(chain.map((x) => x.id)).toEqual(['groq', 'gemini'])
  })

  it('never uses local, image/video, or community providers as implicit fallbacks', () => {
    const chain = buildProviderChain(
      [p('groq', 'k1'), p('ollama', 'ollama'), p('flux', 'img-key'), p('zukijourney', 'proxy-key'), p('gemini', 'k2')],
      'groq'
    )
    expect(chain.map((x) => x.id)).toEqual(['groq', 'gemini'])
  })

  it('still honours an explicitly selected community or local provider', () => {
    expect(buildProviderChain([p('ollama', 'ollama'), p('groq', 'k')], 'ollama')[0].id).toBe('ollama')
    expect(getProviderCategory({ id: 'helixmind', freeTier: true })).toBe('community')
  })

  it('caps the number of providers tried', () => {
    const many = ['groq', 'gemini', 'cerebras', 'sambanova', 'mistral', 'github'].map((id) => p(id, 'k'))
    expect(buildProviderChain(many, 'groq', 3)).toHaveLength(3)
  })
})

describe('applyDiscoveredModel', () => {
  const base = settings([p('groq', 'k', true, 'llama-3.1-8b-instant'), p('gemini', 'k2')])

  it('persists the model that worked for that provider only', () => {
    const next = applyDiscoveredModel(base, 'groq', 'llama-3.3-70b-versatile', false)
    expect(next?.providers.find((x) => x.id === 'groq')?.model).toBe('llama-3.3-70b-versatile')
    expect(next?.providers.find((x) => x.id === 'gemini')?.model).toBe('m')
    expect(base.providers[0].model).toBe('llama-3.1-8b-instant')
  })

  it('does not persist when the user pinned a model, or nothing changed', () => {
    expect(applyDiscoveredModel(base, 'groq', 'llama-3.3-70b-versatile', true)).toBeNull()
    expect(applyDiscoveredModel(base, 'groq', 'llama-3.1-8b-instant', false)).toBeNull()
    expect(applyDiscoveredModel(base, 'groq', undefined, false)).toBeNull()
    expect(applyDiscoveredModel(base, 'unknown', 'x', false)).toBeNull()
  })
})

describe('refreshProviderModelCatalog', () => {
  const base = settings([p('openrouter', 'k', true, 'old-free-model:free'), p('gemini', 'k2')])

  it('stores the live model catalog and switches to the strongest available model', () => {
    const next = refreshProviderModelCatalog(base, 'openrouter', [
      'paid/huge-model',
      'meta-llama/llama-3.3-70b-instruct:free',
      'text-embedding-3-small',
      'mistralai/mistral-7b-instruct:free',
    ], 123)

    const provider = next?.providers.find((x) => x.id === 'openrouter')
    expect(provider?.model).toBe('meta-llama/llama-3.3-70b-instruct:free')
    expect(provider?.models).toEqual([
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ])
    expect(provider?.modelsUpdatedAt).toBe(123)
    expect(provider?.models).not.toContain('old-free-model:free')
  })

  it('keeps settings unchanged when discovery returns no usable chat models', () => {
    expect(refreshProviderModelCatalog(base, 'openrouter', ['text-embedding-3-small'])).toBeNull()
    expect(refreshProviderModelCatalog(base, 'unknown', ['llama-3.3-70b'])).toBeNull()
  })
})

describe('settings export/import', () => {
  it('export strips every API key', () => {
    const exported = withoutApiKeys(settings([p('groq', 'gsk_secret'), p('gemini', 'AIza-secret')]))
    expect(JSON.stringify(exported)).not.toMatch(/secret/)
  })

  it('import keeps keys already stored locally when the file has none', () => {
    const current = settings([p('groq', 'local-key'), p('gemini', '')])
    const imported = settings([p('groq', '', true, 'new-model'), p('gemini', 'file-key')], 'gemini')
    const merged = mergeImportedSettings(current, imported)
    expect(merged.activeProvider).toBe('gemini')
    expect(merged.providers.find((x) => x.id === 'groq')).toMatchObject({ apiKey: 'local-key', model: 'new-model' })
    expect(merged.providers.find((x) => x.id === 'gemini')?.apiKey).toBe('file-key')
  })
})

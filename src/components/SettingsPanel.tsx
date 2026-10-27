/**
 * @author Virender Dhiman
 * @year 2025
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * SettingsPanel — AI provider configuration
 *
 * Features:
 * - Provider catalog grouped by category (free, local, image/video, paid)
 * - Category filter tabs with counts
 * - Provider search
 * - API key input (save requires secure OS key storage)
 * - Base URL and model configuration
 * - Sign-up links for each provider
 * - Custom Rules editor (appended to the system prompt)
 * - Plan Mode toggle
 * - Settings import/export (export never includes API keys)
 * - About card with author credit, license, and repository links
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import type { ProviderConfig, TeamPreset, TeamRoleProfile, TeamTokenBudget } from '../types'
import { getProviderCategory, mergeImportedSettings, providerIsConfigured, providerPrefersFreeModels, refreshProviderModelCatalog, withoutApiKeys } from '../lib/providers'
import { maskProviderForRenderer } from '../lib/providerKeys'
import { APP_COMMIT, APP_NAME, APP_VERSION, AUTHOR_NAME, AUTHOR_URL, COPYRIGHT, LICENSE_URL, REPO_URL } from '../lib/brand'
import { TEAM_PRESET_LABELS } from '../lib/multiAgent'
import { DATA_TOOL_SETTINGS } from '../lib/dataToolSettings'
import BrandLogo from './BrandLogo'
import { SMALL_OLLAMA_MODEL, SMALL_OLLAMA_SIZE } from '../../electron/ollamaModels'
import { THEME_LABELS, THEME_PREFERENCES, normalizeThemePreference } from '../lib/theme'

type Category = 'all' | 'free' | 'local' | 'community' | 'image_video' | 'paid'

const CATEGORY_LABELS: Record<Category, { label: string; icon: string; color: string; soft: string }> = {
  all: { label: 'All', icon: '📋', color: 'var(--text-secondary)', soft: 'var(--bg-tertiary)' },
  free: { label: 'Free Official', icon: '🆓', color: 'var(--category-free)', soft: 'var(--category-free-soft)' },
  local: { label: 'Local', icon: '🏠', color: 'var(--category-local)', soft: 'var(--category-local-soft)' },
  community: { label: 'Community', icon: '🏴‍☠️', color: 'var(--category-community)', soft: 'var(--category-community-soft)' },
  image_video: { label: 'Image/Video', icon: '🎨', color: 'var(--category-media)', soft: 'var(--category-media-soft)' },
  paid: { label: 'Paid', icon: '💰', color: 'var(--category-paid)', soft: 'var(--category-paid-soft)' },
}

const stripEmoji = (name: string) => name.replace(/[^\p{L}\p{N}\s().&-]/gu, '').trim()

/**
 * A local provider's placeholder key only means that the provider entry exists.
 * A successful request is the only health evidence currently recorded here.
 * This is deliberately not treated as a current health check.
 */
function localProviderHasHealthEvidence(provider: ProviderConfig): boolean {
  return getProviderCategory(provider) === 'local' && (provider.performance?.successes || 0) > 0
}

function providerStatusLabel(provider: ProviderConfig): string {
  if (getProviderCategory(provider) !== 'local') return 'API key set'
  return localProviderHasHealthEvidence(provider) ? 'Local provider verified' : 'Configured · not verified'
}

export default function SettingsPanel() {
  const { settings, setSettings, workspacePath, setWorkspacePath, setCurrentDirectory, projectMemory, setProjectMemory } = useStore()
  const [editing, setEditing] = useState<ProviderConfig | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [filter, setFilter] = useState<Category>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshingModels, setRefreshingModels] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')
  const [updateStatus, setUpdateStatus] = useState<Awaited<ReturnType<typeof window.api.updateStatus>> | null>(null)
  const [diagnosticsMessage, setDiagnosticsMessage] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [installedModels, setInstalledModels] = useState<string[]>([])
  const [localModelMessage, setLocalModelMessage] = useState('')
  const [pullConsent, setPullConsent] = useState(false)
  const [pulling, setPulling] = useState(false)
  const advancedSettingsRequested = useStore((state) => state.advancedSettingsRequested)
  const requestAdvancedSettings = useStore((state) => state.requestAdvancedSettings)

  useEffect(() => {
    if (!advancedSettingsRequested) return
    setAdvanced(true)
    requestAdvancedSettings(false)
  }, [advancedSettingsRequested, requestAdvancedSettings])

  const savePreference = useCallback(async (change: Partial<typeof settings>) => {
    const next = { ...settings, ...change }
    try {
      const saved = await window.api.saveSettings(next)
      if ('error' in saved) { setRefreshMessage(saved.error); return }
      setSettings(next)
      setRefreshMessage('Settings saved.')
    } catch { setRefreshMessage('Could not save settings.') }
  }, [settings, setSettings])

  const detectOllama = useCallback(async () => {
    setLocalModelMessage('Checking installed Ollama models…')
    try {
      const result = await window.api.ollamaModels()
      if ('error' in result) { setLocalModelMessage(result.error); return }
      setInstalledModels(result.models)
      setLocalModelMessage(result.models.length ? `${result.models.length} installed model(s) found.` : 'No local models found. Nothing was downloaded.')
    } catch { setLocalModelMessage('Could not reach Ollama on localhost.') }
  }, [])

  useEffect(() => {
    if (editing?.id === 'ollama') void detectOllama()
  }, [editing?.id, detectOllama])

  const pullSmallModel = useCallback(async () => {
    if (!pullConsent) return
    setPullConsent(false)
    setPulling(true)
    setLocalModelMessage('Downloading the small model from Ollama…')
    try {
      const result = await window.api.ollamaPullSmallModel({ model: SMALL_OLLAMA_MODEL, consent: true })
      if ('error' in result) setLocalModelMessage(result.error)
      else await detectOllama()
    } catch { setLocalModelMessage('Model download failed.') }
    finally { setPulling(false) }
  }, [pullConsent, detectOllama])

  const saveTeamProfile = useCallback((role: keyof TeamRoleProfile, value: string) => {
    const nextProfile = { ...(settings.teamProfile || {}), [role]: value }
    const next = { ...settings, teamProfile: nextProfile }
    setSettings(next)
    void window.api.saveSettings(next)
  }, [settings, setSettings])

  useEffect(() => {
    void window.api.updateStatus().then(setUpdateStatus)
    return window.api.onUpdateStatus(setUpdateStatus)
  }, [])

  const openFolder = useCallback(async () => {
    try {
      const dir = await window.api.openDirectory()
      if (!dir) return
      const newSettings = { ...settings, workspacePath: dir }
      setSettings(newSettings)
      setWorkspacePath(dir)
      setCurrentDirectory(dir)
      await window.api.saveSettings(newSettings)
      const memory = await window.api.projectMemoryLoad(dir, true)
      if (!('error' in memory)) setProjectMemory(memory.content)
    } catch (err) { console.error('Failed to open folder:', err) }
  }, [settings])

  const selectProvider = useCallback(async (id: string) => {
    try {
      const newSettings = { ...settings, activeProvider: id }
      setSettings(newSettings)
      await window.api.saveSettings(newSettings)
    } catch (err) { console.error('Failed to save provider:', err) }
  }, [settings])

  const saveProvider = useCallback(async (provider: ProviderConfig, clear = false) => {
    try {
      if (!provider.name.trim() || !provider.baseUrl.trim() || !provider.model.trim()) {
        setRefreshMessage('Name, base URL, and fallback model are required.')
        return
      }
      const local = getProviderCategory(provider) === 'local'
      const typed = apiKeyInput.trim()
      const outgoing = {
        ...provider,
        apiKey: local ? provider.apiKey : (clear ? '' : typed),
        clearKey: clear,
      }
      const toSave = {
        ...settings,
        providers: settings.providers.some((p) => p.id === provider.id)
          ? settings.providers.map((p) => (p.id === provider.id ? outgoing : p))
          : [...settings.providers, outgoing],
      }
      const view = {
        ...toSave,
        providers: toSave.providers.map((p) => (p.id === provider.id ? maskProviderForRenderer({ ...outgoing, hasKey: !clear && (Boolean(typed) || provider.hasKey) }) : p)),
      }
      const result = await window.api.saveSettings(toSave)
      if ('error' in result) { setRefreshMessage(result.error); return }
      setSettings(view)
      setEditing(null)
      setApiKeyInput('')
    } catch { setRefreshMessage('Could not save provider settings.') }
  }, [settings, apiKeyInput])

  const addCustomProvider = useCallback(() => {
    setEditing({
      id: `custom_${crypto.randomUUID()}`,
      name: '', apiKey: '', baseUrl: '', model: '', freeTier: false,
    })
    setApiKeyInput('')
    setRefreshMessage('')
  }, [])

  const removeCustomProvider = useCallback(async (provider: ProviderConfig) => {
    if (!provider.id.startsWith('custom_') || provider.id === 'custom_openai' || !settings.providers.some((p) => p.id === provider.id)) return
    if (!window.confirm(`Remove ${provider.name} and its saved key?`)) return
    const providers = settings.providers.filter((p) => p.id !== provider.id)
    const next = {
      ...settings,
      providers,
      activeProvider: settings.activeProvider === provider.id ? (providers.find((p) => p.id === 'groq')?.id || providers[0]?.id || '') : settings.activeProvider,
    }
    await window.api.saveSettings(next)
    setSettings(next)
    setEditing(null)
  }, [settings, setSettings])

  const refreshModels = useCallback(async () => {
    if (!editing) return
    const local = getProviderCategory(editing) === 'local'
    const typed = apiKeyInput.trim()
    if ((!typed && !providerIsConfigured(editing)) || !editing.baseUrl) {
      setRefreshMessage('Add an API key and base URL before refreshing.')
      return
    }
    setRefreshingModels(true)
    setRefreshMessage('')
    try {
      const ids = await window.api.aiListModels({
        provider: editing.id,
        apiKey: local ? editing.apiKey : typed,
        baseUrl: editing.baseUrl,
        modelBudget: settings.teamTokenBudget || 'balanced',
        preferFreeModels: providerPrefersFreeModels(editing) && !settings.allowPaidModels,
      })
      if (!Array.isArray(ids) || ids.length === 0) {
        setRefreshMessage('No usable chat models were returned. The saved fallback model was kept.')
        return
      }
      const pendingSettings = {
        ...settings,
        providers: settings.providers.map((p) => (
          p.id === editing.id ? { ...editing, apiKey: local ? editing.apiKey : typed } : p
        )),
      }
      const next = refreshProviderModelCatalog(pendingSettings, editing.id, ids)
      const saved = next || pendingSettings
      const masked = { ...saved, providers: saved.providers.map((p) => maskProviderForRenderer(p)) }
      const updated = masked.providers.find((p) => p.id === editing.id)
      const result = await window.api.saveSettings(saved)
      if ('error' in result) { setRefreshMessage(result.error); return }
      setSettings(masked)
      if (updated) setEditing(updated)
      setApiKeyInput('')
      setRefreshMessage(`Synced ${ids.length} live chat models. Using ${updated?.model || ids[0]}.`)
    } catch (err: any) {
      setRefreshMessage(`Refresh failed: ${err?.message || err}`)
    } finally {
      setRefreshingModels(false)
    }
  }, [editing, apiKeyInput, settings])

  const filteredProviders = useMemo(() => {
    return settings.providers.filter((p) => {
      const matchesCategory = filter === 'all' || getProviderCategory(p) === filter
      const matchesSearch = !searchQuery || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.notes || '').toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [settings.providers, filter, searchQuery])

  const counts = useMemo(() => ({
    all: settings.providers.length,
    free: settings.providers.filter((p) => getProviderCategory(p) === 'free').length,
    local: settings.providers.filter((p) => getProviderCategory(p) === 'local').length,
    community: settings.providers.filter((p) => getProviderCategory(p) === 'community').length,
    image_video: settings.providers.filter((p) => getProviderCategory(p) === 'image_video').length,
    paid: settings.providers.filter((p) => getProviderCategory(p) === 'paid').length,
  }), [settings.providers])

  const activeProvider = settings.providers.find((provider) => provider.id === settings.activeProvider)
  const configuredProviders = settings.providers.filter(providerIsConfigured)
  const configuredFallbacks = configuredProviders.filter((provider) => provider.id !== settings.activeProvider && getProviderCategory(provider) !== 'image_video')
  const activeProviderConfigured = Boolean(activeProvider && providerIsConfigured(activeProvider))
  const activeProviderLocal = Boolean(activeProvider && getProviderCategory(activeProvider) === 'local')
  const activeProviderVerified = Boolean(activeProvider && localProviderHasHealthEvidence(activeProvider))

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left: Provider list */}
      <div style={{ width: 400, borderRight: '1px solid var(--border)', display: appearanceOpen ? 'none' : 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <div className="vd-settings-heading"><BrandLogo className="vd-settings-logo" /><h2>⚙️ Settings</h2></div>
          <div className="vd-settings-header-actions">
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{settings.providers.length} providers</span>
            <button className="btn btn-sm" type="button" onClick={() => { setAppearanceOpen(true); setEditing(null); setAdvanced(false) }}>Appearance</button>
          </div>
        </div>
          <div className="panel-body">
          {/* Workspace */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              Workspace
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{
                flex: 1, padding: '6px 10px', background: 'var(--bg-primary)',
                border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
                fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {workspacePath || 'No folder selected'}
              </div>
              <button className="btn btn-sm btn-primary" onClick={openFolder}>Open</button>
              {workspacePath && (
                <button
                  className="btn btn-sm"
                  title="Refresh local project memory"
                  onClick={async () => {
                    const memory = await window.api.projectMemoryLoad(workspacePath, true)
                    if (!('error' in memory)) setProjectMemory(memory.content)
                  }}
                >
                  Refresh context
                </button>
              )}
            </div>
            {projectMemory && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>Local project context ready ({projectMemory.length.toLocaleString()} characters)</div>}
          </div>

            <div className="divider" />

            {/* First-use guidance and runtime state */}
            <div
              role="status"
              aria-label="Provider setup status"
              style={{
               marginBottom: 12, padding: 12, borderRadius: 'var(--radius)',
                 background: activeProviderConfigured && (!activeProviderLocal || activeProviderVerified) ? 'var(--success-soft)' : 'var(--warning-soft)',
                 border: `1px solid ${activeProviderConfigured && (!activeProviderLocal || activeProviderVerified) ? 'var(--success-border)' : 'var(--warning-border)'}`,
               }}
             >
               <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                 {!activeProvider
                   ? 'Finish provider setup'
                   : !activeProviderConfigured
                     ? 'Finish provider setup'
                     : activeProviderLocal && !activeProviderVerified
                       ? 'Configured · not verified'
                     : activeProviderLocal
                         ? '✓ Local provider verified'
                         : '✓ API key configured'}
               </div>
               <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                 {activeProvider
                   ? <>Active: <strong>{stripEmoji(activeProvider.name)}</strong> · {!activeProviderConfigured ? 'needs setup' : activeProviderLocal ? (activeProviderVerified ? 'verified by a successful request' : 'configured, not verified') : 'configured'}. {configuredFallbacks.length > 0 ? `${configuredFallbacks.length} fallback${configuredFallbacks.length === 1 ? '' : 's'} available.` : 'Add another configured provider for automatic fallback.'}</>
                   : 'Choose a provider below to get started.'}
               </div>
               <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 6 }}>
                 <strong>Local Ollama:</strong> the saved placeholder key only records the local provider. Install the Ollama runtime separately, start it, and download the selected model; saving this entry does not test the server or model. <strong>API providers:</strong> need a key from the provider and send requests to that provider.
               </div>
             </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
              Paste an API key. {APP_NAME} lists the models that key can call, drops expired IDs, and saves the best working chat model for the selected budget. Pick a specific model in the composer to pin it instead.
          </div>

          <button className="btn btn-sm" onClick={addCustomProvider} style={{ marginBottom: 10 }}>+ Add compatible provider</button>
          <button className="btn btn-sm" onClick={() => { setEditing(null); setAdvanced(true) }} style={{ marginBottom: 10, marginLeft: 8 }}>Advanced</button>

          {/* Search */}
          <div style={{ margin: '10px 0 8px' }}>
            <input
              className="input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search providers..."
              style={{ fontSize: 12, padding: '6px 10px' }}
            />
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['all', 'free', 'local', 'image_video', 'paid'] as Category[]).map((cat) => (
              <button
                key={cat}
                className={`btn btn-sm ${filter === cat ? 'btn-primary' : ''}`}
                onClick={() => setFilter(cat)}
                style={{ fontSize: 11, padding: '3px 8px' }}
              >
                {CATEGORY_LABELS[cat].icon} {CATEGORY_LABELS[cat].label} ({counts[cat]})
              </button>
            ))}
          </div>

          {/* Provider list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {filteredProviders.map((provider) => {
              const cat = getProviderCategory(provider)
              const catInfo = CATEGORY_LABELS[cat]
              return (
                <div
                  key={provider.id}
                  onClick={() => { selectProvider(provider.id); setEditing(provider); setApiKeyInput(getProviderCategory(provider) === 'local' ? provider.apiKey : ''); setRefreshMessage(''); setInstalledModels([]); setPullConsent(false); setLocalModelMessage('') }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    border: `1px solid ${settings.activeProvider === provider.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: settings.activeProvider === provider.id ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{provider.name}</div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {provider.freeTier && (
                        <span style={{
                          padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                          background: catInfo.soft,
                          color: catInfo.color,
                        }}>
                          {cat === 'local' ? 'LOCAL' : cat === 'image_video' ? 'MEDIA' : 'FREE'}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: settings.activeProvider === provider.id ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {settings.activeProvider === provider.id ? '●' : '○'}
                      </span>
                    </div>
                  </div>
                   <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                     {providerIsConfigured(provider) ? `${cat === 'local' && !localProviderHasHealthEvidence(provider) ? '⚠' : '✓'} ${providerStatusLabel(provider)} · ${provider.model}${provider.models?.length ? ` · ${provider.models.length} live models` : ''}` :
                       provider.notes?.slice(0, 80) + (provider.notes && provider.notes.length > 80 ? '...' : '') || `Model: ${provider.model}`}
                   </div>
                  {provider.performance && (
                    <div style={{ fontSize: 11, marginTop: 3, color: (provider.performance.cooldownUntil || 0) > Date.now() ? 'var(--error)' : 'var(--text-muted)' }}>
                      {(provider.performance.cooldownUntil || 0) > Date.now()
                        ? `Cooling down until ${new Date(provider.performance.cooldownUntil!).toLocaleTimeString()}`
                        : `${provider.performance.successes} successful · ${provider.performance.failures} failed`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right: Edit provider */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {appearanceOpen ? (
          <section className="vd-appearance-page" aria-labelledby="vd-appearance-title">
            <header className="vd-appearance-header">
              <div>
                <p className="vd-appearance-eyebrow">Settings</p>
                <h2 id="vd-appearance-title">Appearance</h2>
                <p>Choose how PIT Agent looks. System follows your operating system and stays the default.</p>
              </div>
              <button className="btn" type="button" onClick={() => setAppearanceOpen(false)}>Back to providers</button>
            </header>
            <fieldset className="vd-theme-options">
              <legend>Theme</legend>
              <div className="vd-theme-grid" role="radiogroup" aria-label="Appearance theme">
                {THEME_PREFERENCES.map((theme) => {
                  const selectedTheme = normalizeThemePreference(settings.theme)
                  const preview = theme
                  return (
                    <label className="vd-theme-choice" key={theme}>
                      <input
                        type="radio"
                        name="pit-agent-theme"
                        value={theme}
                        checked={selectedTheme === theme}
                        onChange={() => void savePreference({ theme })}
                      />
                      <span className="vd-theme-card">
                        <span className={`vd-theme-preview vd-theme-preview-${preview}`} aria-hidden="true">
                          <span className="vd-theme-preview-sidebar" />
                          <span className="vd-theme-preview-content"><span /><span /></span>
                          <span className="vd-theme-preview-accent" />
                        </span>
                        <span className="vd-theme-choice-label">{THEME_LABELS[theme]}</span>
                        {theme === 'system' && <span className="vd-theme-choice-description">Follows your device setting</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
              <p className="vd-appearance-note" role="status">Changes apply immediately and are saved with your settings.</p>
            </fieldset>
          </section>
        ) : editing ? (
          <div style={{ padding: 24, maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{editing.name}</div>
              {editing.freeTier && (
                <span style={{
                  padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: getProviderCategory(editing) === 'paid' ? 'var(--category-paid-soft)' : 'var(--category-free-soft)',
                  color: getProviderCategory(editing) === 'paid' ? 'var(--category-paid)' : 'var(--category-free)',
                }}>
                  {getProviderCategory(editing) === 'local' ? '🏠 LOCAL' :
                   getProviderCategory(editing) === 'image_video' ? '🎨 MEDIA' :
                   getProviderCategory(editing) === 'paid' ? '💰 PAID' : '🆓 FREE TIER'}
                </span>
              )}
            </div>

            {editing.notes && (
              <div style={{
                padding: '12px 14px', marginBottom: 16, borderRadius: 'var(--radius)',
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                ℹ️ {editing.notes}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {editing.id.startsWith('custom_') && (
                <>
                  <div className="input-group">
                    <label className="input-label">Provider name</label>
                    <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Provider name" />
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <input type="checkbox" checked={!!editing.freeTier} onChange={(e) => setEditing({ ...editing, freeTier: e.target.checked })} />
                    Free tier (eligible as a free-provider fallback)
                  </label>
                </>
              )}
              {getProviderCategory(editing) !== 'local' && (
                <div className="input-group">
                  <label className="input-label">API Key</label>
                  <input
                    type="password"
                    className="input"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={editing.hasKey ? 'A key is saved. Paste a new one to replace it.' : 'Enter your API key...'}
                  />
                  {editing.hasKey && (
                    <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => saveProvider(editing, true)}>
                      Remove saved key
                    </button>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    🔒 Saved only when secure OS key storage is available, and sent only to this provider's base URL.
                  </div>
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Base URL</label>
                <input
                  className="input"
                  value={editing.baseUrl}
                  onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                />
              </div>

               <div className="input-group">
                 <label className="input-label">Model</label>
                <input
                  className="input"
                  value={editing.model}
                  onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Fallback model. Refreshing live models makes {APP_NAME} drop stale IDs and use the best accessible chat model for your budget.
                 </div>
               </div>

              {getProviderCategory(editing) === 'local' && (
                <div
                  role="note"
                  style={{
                    padding: '10px 12px', borderRadius: 'var(--radius)',
                    background: 'var(--warning-soft)',
                    border: '1px solid var(--warning-border)',
                    fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
                  }}
                >
                  <strong>Configured is not verified.</strong> This entry stores the local URL and model name only. Ollama, its runtime, and the selected model must be installed separately. A successful request is recorded as evidence; saving changes does not check whether the server or model is available.
                </div>
              )}

              {editing.id === 'ollama' && (
                <div className="input-group">
                  <button className="btn" type="button" onClick={() => void detectOllama()}>Detect installed models</button>
                  {installedModels.length > 0 && <div>Installed models: {installedModels.map((model) => <button className="btn btn-sm" type="button" key={model} onClick={() => setEditing({ ...editing, model })}>{model}</button>)}</div>}
                  <div role="status">{localModelMessage}</div>
                  <label style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <input type="checkbox" checked={pullConsent} onChange={(event) => setPullConsent(event.target.checked)} />
                    I agree to download {SMALL_OLLAMA_MODEL} ({SMALL_OLLAMA_SIZE}; network and disk use) from my local Ollama server
                  </label>
                  <button className="btn" type="button" disabled={!pullConsent || pulling} onClick={() => void pullSmallModel()}>
                    {pulling ? 'Downloading…' : `Pull small model (${SMALL_OLLAMA_SIZE})`}
                  </button>
                </div>
              )}

               {editing.models?.length ? (
                <div className="input-group">
                  <label className="input-label">Live Models</label>
                  <select
                    className="input"
                    value={editing.model}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  >
                    {editing.models.map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Auto mode tries these in ranked order and switches when a model expires, rate-limits, or is unavailable. Last refreshed {editing.modelsUpdatedAt ? new Date(editing.modelsUpdatedAt).toLocaleString() : 'during this session'}.
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn" onClick={refreshModels} disabled={refreshingModels || editing.id === 'anthropic'}>
                  {refreshingModels ? 'Refreshing...' : 'Refresh Live Models'}
                </button>
                {refreshMessage && (
                  <span style={{ fontSize: 11, color: refreshMessage.startsWith('Refresh failed') ? 'var(--error)' : 'var(--text-muted)' }}>
                    {refreshMessage}
                  </span>
                )}
              </div>

              {editing.signupUrl && (
                <a
                  href={editing.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', justifyContent: 'center' }}
                >
                  {getProviderCategory(editing) === 'local' ? '📦 Download & Install' : '🔑 Get API Key'} → {editing.signupUrl.replace('https://', '').split('/')[0]}
                </a>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => saveProvider(editing)}>
                  💾 Save Changes
                </button>
                <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                {editing.id.startsWith('custom_') && editing.id !== 'custom_openai' && settings.providers.some((p) => p.id === editing.id) && (
                  <button className="btn" onClick={() => void removeCustomProvider(editing)}>Remove</button>
                )}
              </div>
              {refreshMessage && <div role="status" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{refreshMessage}</div>}
            </div>
          </div>
        ) : advanced ? (
          <div style={{ padding: 24, maxWidth: 680, display: 'grid', gap: 16 }}>
            <h2>Advanced</h2>
            <p>All optional capabilities start off. Existing provider entries and custom OpenAI-compatible endpoints are available in the list on the left.</p>
            <button className="btn" onClick={() => { const provider = settings.providers.find((p) => p.id === settings.activeProvider); if (provider) setEditing(provider) }}>Edit active model and provider</button>
            {([
              ['autocompleteEnabled', 'Autocomplete'],
              ['ocrToolEnabled', 'Offline OCR'],
              ['indexingEnabled', 'Automatic indexing'],
              ['telemetryEnabled', 'Telemetry'],
              ['autoUpdate', 'Check for verified release updates after launch'],
            ] as const).map(([key, label]) => (
              <label key={key} style={{ display: 'flex', gap: 8 }}>
                <input type="checkbox" checked={settings[key] === true} onChange={(event) => void savePreference({ [key]: event.target.checked })} />{label}
              </label>
            ))}
            <label>Update channel
              <select className="input" aria-label="Update channel" value={settings.updateChannel === 'beta' ? 'beta' : 'stable'} onChange={(event) => void savePreference({ updateChannel: event.target.value as 'stable' | 'beta' })}>
                <option value="stable">Stable</option><option value="beta">Beta</option>
              </select>
            </label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Update checks remain off until enabled above. Telemetry is not transmitted by this build.</p>
            {refreshMessage && <div role="status">{refreshMessage}</div>}
            <button className="btn" onClick={() => setAdvanced(false)}>Back to Settings</button>
          </div>
        ) : (
          <div style={{ padding: 24, maxWidth: 680 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              AI Provider Settings
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
              Configure API keys for <strong style={{ color: 'var(--text-primary)' }}>{settings.providers.length} providers</strong>.
              Free tiers from official providers or a local model are enough to use the agent; free-tier limits are set by each provider and change often.
              If the active provider fails with a rate limit or unavailable model, {APP_NAME} tries other official free providers that have keys.
              An invalid key stops the request so you can fix it.
            </div>

            {/* Category summaries */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {([
                { cat: 'free', title: '🆓 Free Official', color: 'var(--category-free)', soft: 'var(--category-free-soft)', border: 'var(--category-free-border)', note: 'Used for automatic fallback when they have a key.' },
                { cat: 'local', title: '🏠 Local', color: 'var(--category-local)', soft: 'var(--category-local-soft)', border: 'var(--category-local-border)', note: 'Ollama, LM Studio, llama.cpp, or another OpenAI-compatible server.' },
                { cat: 'image_video', title: '🎨 Image/Video', color: 'var(--category-media)', soft: 'var(--category-media-soft)', border: 'var(--category-media-border)', note: 'Official media APIs. Not used for chat.' },
                { cat: 'paid', title: '💰 Paid', color: 'var(--category-paid)', soft: 'var(--category-paid-soft)', border: 'var(--category-paid-border)', note: 'Billed by the provider.' },
              ] as const).map(({ cat, title, color, soft, border, note }) => (
                <div key={cat} style={{ padding: 12, borderRadius: 'var(--radius)', background: soft, border: `1px solid ${border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 4 }}>{title} ({counts[cat]})</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {settings.providers.filter((p) => getProviderCategory(p) === cat).map((p) => stripEmoji(p.name)).join(', ')}
                    <div style={{ marginTop: 4 }}>{note}</div>
                  </div>
                </div>
              ))}
            </div>

             {/* Quick start */}
             <div className="card" style={{ marginBottom: 16, padding: 16 }}>
               <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🚀 Quick Start</div>
                <ol style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: 20 }}>
                  <li>Choose <strong>Local</strong> for Ollama (private, no API key) or an API provider (requires a key)</li>
                  <li>For Ollama, install the runtime, start the local server, and download the model separately; for an API provider, click "Get API Key"</li>
                  <li>Open the provider here and confirm its local URL or paste the API key</li>
                  <li>Save changes, then open the <strong>🤖 Agent</strong> panel and send a message</li>
                  <li>Configured official free providers are tried automatically if the active provider is unavailable</li>
                </ol>
             </div>

             <div
               className="card"
               aria-label="Bundled support and external prerequisites"
               style={{ marginBottom: 16, padding: 16 }}
             >
               <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>📦 Bundled support vs separate installs</div>
               <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                 These prerequisites are separate on Windows, macOS, and Linux. {APP_NAME} bundles integration support; it does not install the external applications or local model files for you.
                 <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                   <li><strong>VS Code:</strong> the {APP_NAME} Bridge VSIX and bridge support are bundled in packaged builds. Install the VS Code application separately, then use the <strong>VS Code Bridge</strong> panel to load the bridge and open your workspace.</li>
                   <li><strong>Ollama:</strong> the provider entry and OpenAI-compatible support are bundled. Install the Ollama runtime separately, start it, and pull the model named in Settings. A placeholder key means configured, not verified.</li>
                 </ul>
               </div>
             </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                const active = settings.providers.find((p) => p.id === settings.activeProvider)
                if (active) {
                  setEditing(active)
                  setApiKeyInput(getProviderCategory(active) === 'local' ? active.apiKey : '')
                }
              }}
            >
              ✏️ Edit Active Provider ({settings.providers.find((p) => p.id === settings.activeProvider)?.name})
            </button>

            {/* Custom Rules */}
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>📝 Custom Rules</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
                Custom instructions appended to every system prompt.
                Use this to tell the agent how to behave — coding style, conventions, preferences.
              </div>
              <textarea
                className="input"
                value={settings.customRules || ''}
                onChange={(e) => {
                  const newSettings = { ...settings, customRules: e.target.value }
                  setSettings(newSettings)
                  window.api.saveSettings(newSettings)
                }}
                placeholder={`Examples:\n- Always use TypeScript strict mode\n- Use functional components, never class components\n- Prefer named exports over default exports\n- Write tests for all new functions\n- Use conventional commits (feat:, fix:, etc.)`}
                rows={6}
                style={{ fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
              />
            </div>

            {/* Plan Mode */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>📋 Plan Mode</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    When enabled, the agent plans changes before executing them
                  </div>
                </div>
                <button
                  className={`btn btn-sm ${settings.planMode ? 'btn-success' : ''}`}
                  onClick={() => {
                    const newSettings = { ...settings, planMode: !settings.planMode }
                    setSettings(newSettings)
                    window.api.saveSettings(newSettings)
                  }}
                >
                  {settings.planMode ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Agent Environment</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Normal uses one executor. Smart chooses the team for substantial work. Agentic runs planner, worker, reviewer, repair, and verifier for every chat query.
                  </div>
                </div>
                <select
                  className="input"
                  value={settings.teamMode || 'auto'}
                  onChange={(event) => {
                    const teamMode = event.target.value as 'off' | 'auto' | 'always'
                    const next = { ...settings, teamMode }
                    setSettings(next)
                    void window.api.saveSettings(next)
                  }}
                  aria-label="Agent environment"
                  style={{ width: 120, flex: '0 0 120px' }}
                >
                  <option value="off">Normal</option>
                  <option value="auto">Smart</option>
                  <option value="always">Agentic</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                <div>
                  <label className="input-label">Team preset</label>
                  <select
                    className="input"
                    value={settings.teamPreset || 'default'}
                    onChange={(event) => {
                      const teamPreset = event.target.value as TeamPreset
                      const next = { ...settings, teamPreset }
                      setSettings(next)
                      void window.api.saveSettings(next)
                    }}
                    aria-label="Team preset"
                  >
                    {(Object.keys(TEAM_PRESET_LABELS) as TeamPreset[]).map((preset) => (
                      <option key={preset} value={preset}>{TEAM_PRESET_LABELS[preset]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="input-label">Token budget</label>
                  <select
                    className="input"
                    value={settings.teamTokenBudget || 'balanced'}
                    onChange={(event) => {
                      const teamTokenBudget = event.target.value as TeamTokenBudget
                      const next = { ...settings, teamTokenBudget }
                      setSettings(next)
                      void window.api.saveSettings(next)
                    }}
                    aria-label="Agentic token budget"
                  >
                    <option value="cheap">Cheap</option>
                    <option value="balanced">Balanced</option>
                    <option value="strong">Strong</option>
                  </select>
                </div>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.allowPaidModels === true}
                  onChange={(event) => {
                    const next = { ...settings, allowPaidModels: event.target.checked }
                    setSettings(next)
                    void window.api.saveSettings(next)
                  }}
                />
                Allow paid model IDs alongside tagged free models in Auto
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.dynamicTeam !== false}
                  onChange={(event) => {
                    const next = { ...settings, dynamicTeam: event.target.checked }
                    setSettings(next)
                    void window.api.saveSettings(next)
                  }}
                />
                Let {APP_NAME} add read-only specialist agents when the task calls for them
              </label>
              <div style={{ marginTop: 12, padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Custom agent roles</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                  Optional. Presets fill the baseline roles; custom text overrides only the role you edit. Tool isolation, token limits, and evidence checks still stay enforced.
                </div>
                {([
                  ['analyst', 'Prompt analyst', 'How should the first agent improve and frame the user request?'],
                  ['executor', 'Worker', 'How should the tool-enabled worker approach execution?'],
                  ['reviewer', 'Reviewer', 'What should the reviewer be strict about before approving?'],
                  ['verifier', 'Final verifier', 'How should the final response be shaped for the user?'],
                ] as const).map(([role, label, placeholder]) => (
                  <div key={role} style={{ marginTop: 8 }}>
                    <label className="input-label">{label}</label>
                    <textarea
                      className="input"
                      value={settings.teamProfile?.[role] || ''}
                      onChange={(event) => saveTeamProfile(role, event.target.value)}
                      placeholder={placeholder}
                      rows={2}
                      style={{ fontSize: 12, resize: 'vertical' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Tool permissions</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                Enforced by the desktop process. Writes outside the open workspace are always blocked.
              </div>
              <select
                className="input"
                value={settings.permissionMode || 'ask-risky'}
                onChange={(event) => {
                  const permissionMode = event.target.value as NonNullable<typeof settings.permissionMode>
                  const next = { ...settings, permissionMode }
                  setSettings(next)
                  void window.api.saveSettings(next)
                }}
              >
                 <option value="always">Always ask with exact previews</option>
                 <option value="ask-risky">Ask for risky commands and changes</option>
                 <option value="auto">Auto-approve safe actions; always ask risky actions</option>
              </select>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.restrictedCommandMode === true}
                  onChange={(event) => {
                    const next = { ...settings, restrictedCommandMode: event.target.checked }
                    setSettings(next)
                    void window.api.saveSettings(next)
                  }}
                />
                <span><strong>Restricted command mode</strong><br /><span style={{ color: 'var(--text-muted)' }}>Opt in to workspace-only command cwd and block shell escape/redirection, network access, and package installs. This is a command policy, not OS sandboxing.</span></span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.strictGrounding === true}
                  onChange={(event) => {
                    const next = { ...settings, strictGrounding: event.target.checked }
                    setSettings(next)
                    void window.api.saveSettings(next)
                  }}
                />
                <span><strong>Strict grounding</strong><br /><span style={{ color: 'var(--text-muted)' }}>Opt in to evidence-only claims. The agent cites files and reports commands or tests as not checked unless this chat has a tool result.</span></span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.browserToolEnabled === true}
                  onChange={(event) => {
                    const next = { ...settings, browserToolEnabled: event.target.checked }
                    setSettings(next)
                    void window.api.saveSettings(next)
                  }}
                />
                <span>
                  <strong>Enable browser tool (off by default)</strong><br />
                  <span style={{ color: 'var(--text-muted)' }}>
                    Allows the agent to open http/https pages in an isolated hidden Electron window, send page text (including hidden DOM text) to your AI provider, and save viewport screenshots under .vd-agent/browser-screenshots in the workspace. Pages are untrusted. Browser actions use the dangerous-tool approval policy; Trusted mode skips dialogs only after this setting is enabled. Turning it off closes all browser pages.
                  </span>
                </span>
              </label>
            </div>

            <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Data tools — off by default</div>
              {DATA_TOOL_SETTINGS.map(({ key, label, detail }) => (
                <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, fontSize: 12 }}>
                  <input type="checkbox" checked={settings[key] === true} onChange={(event) => {
                    const next = { ...settings, [key]: event.target.checked }
                    setSettings(next)
                    void window.api.saveSettings(next)
                  }} />
                  <span><strong>{label}</strong><br /><span style={{ color: 'var(--text-muted)' }}>{detail} Uses the dangerous-tool approval policy.</span></span>
                </label>
              ))}
            </div>

            <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.autoUpdate === true}
                  onChange={(event) => {
                    const next = { ...settings, autoUpdate: event.target.checked }
                    setSettings(next)
                    void window.api.saveSettings(next)
                  }}
                />
                Check for verified release updates after launch
              </label>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Application updates</div>
                  <div style={{ fontSize: 12, color: updateStatus?.state === 'error' ? 'var(--error)' : 'var(--text-muted)', marginTop: 4 }}>
                    {updateStatus?.message || 'Updates have not been checked.'}
                  </div>
                </div>
                {updateStatus?.state === 'downloaded' ? (
                  <button className="btn btn-sm btn-primary" onClick={() => { void window.api.installUpdate() }}>Restart and install</button>
                ) : (
                  <button className="btn btn-sm" disabled={updateStatus?.state === 'checking' || updateStatus?.state === 'downloading'} onClick={() => { void window.api.checkForUpdates().then(setUpdateStatus) }}>
                    Check now
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Private diagnostics</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                Export app, provider-health, and storage metadata for troubleshooting. Chat text, code, filenames, workspace paths, and API keys are excluded.
              </div>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  setDiagnosticsMessage('Preparing report...')
                  const result = await window.api.exportDiagnostics()
                  if ('error' in result && result.error) setDiagnosticsMessage(`Export failed: ${result.error}`)
                  else if (result.cancelled) setDiagnosticsMessage('Export cancelled.')
                  else setDiagnosticsMessage('Diagnostics report saved.')
                }}
              >
                Export diagnostics
              </button>
              {diagnosticsMessage && (
                <div style={{ fontSize: 11, color: diagnosticsMessage.startsWith('Export failed') ? 'var(--error)' : 'var(--text-muted)', marginTop: 6 }}>
                  {diagnosticsMessage}
                </div>
              )}
            </div>

            {/* Import / Export Settings */}
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>💾 Import / Export Settings</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(withoutApiKeys(settings), null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'vd-settings.json'
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  📤 Export
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = '.json'
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0]
                      if (!file) return
                      const text = await file.text()
                      try {
                        const imported = JSON.parse(text)
                        if (!imported || !Array.isArray(imported.providers)) throw new Error('missing providers')
                        const merged = mergeImportedSettings(settings, imported)
                        await window.api.saveSettings(merged)
                        setSettings({ ...merged, providers: merged.providers.map((provider) => maskProviderForRenderer(provider)) })
                      } catch {
                        alert('Invalid settings file')
                      }
                    }
                    input.click()
                  }}
                >
                  📥 Import
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Export saves provider configs and preferences without API keys. Import keeps the keys already stored on this machine.
              </div>
            </div>

            {/* About */}
            <div className="card" style={{ marginTop: 20, padding: 16 }} aria-label={`About ${APP_NAME}`}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>ℹ️ About {APP_NAME} v{APP_VERSION}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Build commit: {APP_COMMIT}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
                Built by <strong style={{ color: 'var(--text-primary)' }}>{AUTHOR_NAME}</strong>. {COPYRIGHT}
                <br />
                Free to download and use under the PIT Agent License. Please keep the credit when you share it, and star the repository if it helps you.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="btn btn-sm" href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  🌐 virender.in
                </a>
                <a className="btn btn-sm btn-primary" href={REPO_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  ⭐ Star on GitHub
                </a>
                <a className="btn btn-sm" href={LICENSE_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  📄 License
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

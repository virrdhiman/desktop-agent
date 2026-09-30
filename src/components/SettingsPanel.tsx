/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * SettingsPanel — AI provider configuration
 *
 * Features:
 * - Provider catalog grouped by category (free, local, community, image/video, paid)
 * - Category filter tabs with counts
 * - Provider search
 * - API key input (encrypted at rest when the OS keychain is available)
 * - Base URL and model configuration
 * - Sign-up links for each provider
 * - Custom Rules editor (appended to the system prompt)
 * - Plan Mode toggle
 * - Settings import/export (export never includes API keys)
 * - About card with author credit, license, and repository links
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import type { ProviderConfig } from '../types'
import { getProviderCategory, mergeImportedSettings, refreshProviderModelCatalog, withoutApiKeys } from '../lib/providers'
import { APP_NAME, APP_VERSION, AUTHOR_NAME, AUTHOR_URL, COPYRIGHT, LICENSE_URL, REPO_URL } from '../lib/brand'

type Category = 'all' | 'free' | 'local' | 'community' | 'image_video' | 'paid'

const CATEGORY_LABELS: Record<Category, { label: string; icon: string; color: string }> = {
  all: { label: 'All', icon: '📋', color: 'var(--text-secondary)' },
  free: { label: 'Free Official', icon: '🆓', color: '#4ade80' },
  local: { label: 'Local', icon: '🏠', color: '#60a5fa' },
  community: { label: 'Community', icon: '🏴‍☠️', color: '#c084fc' },
  image_video: { label: 'Image/Video', icon: '🎨', color: '#f472b6' },
  paid: { label: 'Paid', icon: '💰', color: '#fbbf24' },
}

const stripEmoji = (name: string) => name.replace(/[^\p{L}\p{N}\s().&-]/gu, '').trim()

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

  const saveProvider = useCallback(async (provider: ProviderConfig) => {
    try {
      const newSettings = {
        ...settings,
        providers: settings.providers.map((p) =>
          p.id === provider.id ? { ...provider, apiKey: apiKeyInput } : p
        ),
      }
      setSettings(newSettings)
      setEditing(null)
      await window.api.saveSettings(newSettings)
    } catch (err) { console.error('Failed to save provider:', err) }
  }, [settings, apiKeyInput])

  const refreshModels = useCallback(async () => {
    if (!editing) return
    const apiKey = apiKeyInput || editing.apiKey
    if (!apiKey || !editing.baseUrl) {
      setRefreshMessage('Add an API key and base URL before refreshing.')
      return
    }
    setRefreshingModels(true)
    setRefreshMessage('')
    try {
      const ids = await window.api.aiListModels({ provider: editing.id, apiKey, baseUrl: editing.baseUrl })
      if (!Array.isArray(ids) || ids.length === 0) {
        setRefreshMessage('No usable chat models were returned. The saved fallback model was kept.')
        return
      }
      const pendingSettings = {
        ...settings,
        providers: settings.providers.map((p) => (
          p.id === editing.id ? { ...editing, apiKey } : p
        )),
      }
      const next = refreshProviderModelCatalog(pendingSettings, editing.id, ids)
      const saved = next || pendingSettings
      const updated = saved.providers.find((p) => p.id === editing.id)
      setSettings(saved)
      if (updated) setEditing(updated)
      await window.api.saveSettings(saved)
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

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left: Provider list */}
      <div style={{ width: 400, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <h2>⚙️ Settings</h2>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{settings.providers.length} providers</span>
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

          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
            Paste a free API key. VD lists the models that key can call, uses the strongest chat model, and saves it as the provider's model. Pick a specific model in the Agent header to pin it instead.
          </div>

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
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
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
                  onClick={() => { selectProvider(provider.id); setEditing(provider); setApiKeyInput(provider.apiKey); setRefreshMessage('') }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    border: `1px solid ${settings.activeProvider === provider.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: settings.activeProvider === provider.id ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{provider.name}</div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {provider.freeTier && (
                        <span style={{
                          padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                          background: `${catInfo.color}22`,
                          color: catInfo.color,
                        }}>
                          {cat === 'local' ? 'LOCAL' : cat === 'community' ? 'FREE' : 'FREE'}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: settings.activeProvider === provider.id ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {settings.activeProvider === provider.id ? '●' : '○'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {provider.apiKey ? `✓ Key set · ${provider.model}${provider.models?.length ? ` · ${provider.models.length} live models` : ''}` :
                     provider.notes?.slice(0, 80) + (provider.notes && provider.notes.length > 80 ? '...' : '') || `Model: ${provider.model}`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right: Edit provider */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {editing ? (
          <div style={{ padding: 24, maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{editing.name}</div>
              {editing.freeTier && (
                <span style={{
                  padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: getProviderCategory(editing) === 'community' ? 'rgba(168,85,247,0.2)' : 'rgba(34,197,94,0.2)',
                  color: getProviderCategory(editing) === 'community' ? '#c084fc' : '#4ade80',
                }}>
                  {getProviderCategory(editing) === 'local' ? '🏠 LOCAL' :
                   getProviderCategory(editing) === 'community' ? '🏴‍☠️ COMMUNITY' : '🆓 FREE TIER'}
                </span>
              )}
            </div>

            {editing.notes && (
              <div style={{
                padding: '12px 14px', marginBottom: 16, borderRadius: 'var(--radius)',
                background: getProviderCategory(editing) === 'community'
                  ? 'rgba(168,85,247,0.08)' : 'rgba(59,130,246,0.08)',
                border: `1px solid ${getProviderCategory(editing) === 'community'
                  ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)'}`,
                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                ℹ️ {editing.notes}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {getProviderCategory(editing) !== 'local' && (
                <div className="input-group">
                  <label className="input-label">API Key</label>
                  <input
                    type="password"
                    className="input"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Enter your API key..."
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    🔒 Stored on this machine, encrypted with the OS keychain when available, and sent only to this provider's base URL.
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
                  Fallback model. Refreshing live models makes VD drop stale IDs and use the strongest chat model this key can call.
                </div>
              </div>

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
                    Last refreshed {editing.modelsUpdatedAt ? new Date(editing.modelsUpdatedAt).toLocaleString() : 'during this session'}.
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

              {getProviderCategory(editing) === 'community' && (
                <div style={{
                  padding: '10px 12px', borderRadius: 'var(--radius)', fontSize: 12, lineHeight: 1.6,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--text-secondary)',
                }}>
                  ⚠️ Community endpoints are unofficial third-party proxies. They receive your prompts and code, and may be unreliable.
                  VD never uses them as automatic fallbacks. Do not send sensitive code through them.
                </div>
              )}

              {editing.signupUrl && (
                <a
                  href={editing.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', justifyContent: 'center' }}
                >
                  {getProviderCategory(editing) === 'community' ? '⭐ Join Discord / GitHub' :
                   getProviderCategory(editing) === 'local' ? '📦 Download & Install' :
                   '🔑 Get API Key'} → {editing.signupUrl.replace('https://', '').split('/')[0]}
                </a>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => saveProvider(editing)}>
                  💾 Save Changes
                </button>
                <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 24, maxWidth: 680 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              AI Provider Settings
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
              Configure API keys for <strong style={{ color: 'var(--text-primary)' }}>{settings.providers.length} providers</strong>.
              Free tiers from official providers or a local model are enough to use the agent; free-tier limits are set by each provider and change often.
              If the active provider fails with a rate limit or unavailable model, VD tries other official free providers that have keys.
              An invalid key stops the request so you can fix it.
            </div>

            {/* Category summaries */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {([
                { cat: 'free', title: '🆓 Free Official', color: '#4ade80', rgb: '34,197,94', note: 'Used for automatic fallback when they have a key.' },
                { cat: 'local', title: '🏠 Local', color: '#60a5fa', rgb: '96,165,250', note: 'Runs on your machine; prompts stay local.' },
                { cat: 'community', title: '🏴‍☠️ Community', color: '#c084fc', rgb: '168,85,247', note: 'Unofficial proxies. Never used automatically.' },
                { cat: 'paid', title: '💰 Paid', color: '#fbbf24', rgb: '245,158,11', note: 'Billed by the provider.' },
              ] as const).map(({ cat, title, color, rgb, note }) => (
                <div key={cat} style={{ padding: 12, borderRadius: 'var(--radius)', background: `rgba(${rgb},0.05)`, border: `1px solid rgba(${rgb},0.2)` }}>
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
                <li>Select a provider (Groq or Gemini are good free starting points)</li>
                <li>Click "Get API Key" to open the provider's website</li>
                <li>Create an account and copy the key</li>
                <li>Paste it in the API Key field and click Save</li>
                <li>Open the <strong>🤖 Agent</strong> panel and send a message</li>
              </ol>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                const active = settings.providers.find((p) => p.id === settings.activeProvider)
                if (active) {
                  setEditing(active)
                  setApiKeyInput(active.apiKey)
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
                <option value="ask-risky">Ask for commands, deletes, and Git changes</option>
                <option value="ask-all-writes">Ask before every write</option>
                <option value="trusted">Trusted workspace (no approval dialogs)</option>
              </select>
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
                        setSettings(merged)
                        await window.api.saveSettings(merged)
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
            <div className="card" style={{ marginTop: 20, padding: 16 }} aria-label="About VD Agent">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>ℹ️ About {APP_NAME} v{APP_VERSION}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
                Built by <strong style={{ color: 'var(--text-primary)' }}>{AUTHOR_NAME}</strong>. {COPYRIGHT}
                <br />
                Free to download and use under the VD Agent License. Please keep the credit when you share it, and star the repository if it helps you.
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

/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * SettingsPanel — AI provider configuration
 *
 * Features:
 * - 37 AI providers across 4 categories (free, local, community, paid)
 * - Category filter tabs with counts
 * - Provider search
 * - API key input with security note
 * - Base URL and model configuration
 * - Sign-up links for each provider
 * - Custom Rules editor (custom system prompts)
 * - Plan Mode toggle
 */
import { useState, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import type { ProviderConfig } from '../types'

type Category = 'all' | 'free' | 'local' | 'community' | 'image_video' | 'paid'

const CATEGORY_LABELS: Record<Category, { label: string; icon: string; color: string }> = {
  all: { label: 'All', icon: '📋', color: 'var(--text-secondary)' },
  free: { label: 'Free Official', icon: '🆓', color: '#4ade80' },
  local: { label: 'Local', icon: '🏠', color: '#60a5fa' },
  community: { label: 'Community', icon: '🏴‍☠️', color: '#c084fc' },
  image_video: { label: 'Image/Video', icon: '🎨', color: '#f472b6' },
  paid: { label: 'Paid', icon: '💰', color: '#fbbf24' },
}

const COMMUNITY_IDS = ['g4f', 'chatgpt2api', 'zukijourney', 'electronhub', 'voidai', 'nagaai', 'navyapi', 'mnn', 'webraftai', 'voltai', 'hcap', 'zanityai', 'kimetsu', 'pollinations']
const LOCAL_IDS = ['ollama', 'lmstudio', 'llamacpp']
const IMAGE_VIDEO_IDS = ['flux', 'pollinations_img', 'runway', 'kling', 'replicate', 'stability']

function getProviderCategory(p: ProviderConfig): 'free' | 'local' | 'community' | 'image_video' | 'paid' {
  if (LOCAL_IDS.includes(p.id)) return 'local'
  if (IMAGE_VIDEO_IDS.includes(p.id)) return 'image_video'
  if (COMMUNITY_IDS.includes(p.id)) return 'community'
  if (p.freeTier) return 'free'
  return 'paid'
}

export default function SettingsPanel() {
  const { settings, setSettings, workspacePath, setWorkspacePath, setCurrentDirectory } = useStore()
  const [editing, setEditing] = useState<ProviderConfig | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [filter, setFilter] = useState<Category>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const openFolder = useCallback(async () => {
    try {
      const dir = await window.api.openDirectory()
      if (!dir) return
      const newSettings = { ...settings, workspacePath: dir }
      setSettings(newSettings)
      setWorkspacePath(dir)
      setCurrentDirectory(dir)
      await window.api.saveSettings(newSettings)
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
            </div>
          </div>

          <div className="divider" />

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
                  onClick={() => { selectProvider(provider.id); setEditing(provider); setApiKeyInput(provider.apiKey) }}
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
                    {provider.apiKey ? `✓ Key set · ${provider.model}` :
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
                    🔒 Key is stored locally and only sent to the AI provider.
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
              </div>

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
              Configure API keys for <strong style={{ color: 'var(--text-primary)' }}>{settings.providers.length} AI providers</strong>.
              You can use the agent at <strong style={{ color: '#4ade80' }}>zero cost</strong> with free official providers,
              local models, or community APIs.
            </div>

            {/* Category summaries */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div style={{ padding: 12, borderRadius: 'var(--radius)', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>🆓 Free Official ({counts.free})</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Groq, Cerebras, SambaNova, HuggingFace, DeepSeek, Gemini, GitHub, OpenRouter, Mistral, Together, Fireworks, DeepInfra, SiliconFlow, xAI, Novita, MiMo
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 'var(--radius)', background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa', marginBottom: 4 }}>🏠 Local ({counts.local})</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Ollama, LM Studio, llama.cpp — 100% free & private, runs on your machine
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 'var(--radius)', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#c084fc', marginBottom: 4 }}>🏴‍☠️ Community ({counts.community})</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  g4f, Pollinations, Zukijourney, ElectronHub, VoidAI, NagaAI, HelixMind, NavyAPI, MNN, WebraftAI, VoltAI, HCAP, ZanityAI, Kimetsu
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 'var(--radius)', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', marginBottom: 4 }}>💰 Paid ({counts.paid})</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  OpenAI, Anthropic, Cohere, Perplexity — industry leaders
                </div>
              </div>
            </div>

            {/* Quick start */}
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🚀 Quick Start (Zero Cost)</div>
              <ol style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: 20 }}>
                <li>Click a provider above (try <strong>Groq</strong> for fastest free inference)</li>
                <li>Click "Get API Key" to open the provider's website</li>
                <li>Create a free account and copy your API key</li>
                <li>Paste it in the API Key field and click Save</li>
                <li>Head to the <strong>🤖 Agent</strong> panel and start chatting!</li>
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

            {/* Custom Rules (Cursor's Rules feature) */}
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>📝 Custom Rules</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
                Custom instructions that are prepended to every system prompt.
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

            {/* Import / Export Settings */}
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>💾 Import / Export Settings</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'freebuff-settings.json'
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
                        setSettings(imported)
                        await window.api.saveSettings(imported)
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
                Export saves all provider configs, keys, and preferences. Import restores them.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

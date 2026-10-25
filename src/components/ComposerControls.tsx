import { useMemo, useState } from 'react'
import type { ProviderConfig, Settings } from '../types'
import { getProviderCategory } from '../lib/providers'

type ComposerControlsProps = {
  settings: Settings
  activeProvider?: ProviderConfig
  availableModels: string[]
  modelOverride: string | null
  onModelOverride: (model: string | null) => void
  onSettings: (settings: Settings) => void
}

type Budget = 'cheap' | 'balanced' | 'strong'
type Source = 'local' | 'cloud'

const budgetLabels: Array<[Budget, string]> = [['cheap', 'Efficient'], ['balanced', 'Balanced'], ['strong', 'Powerful']]

function tierForModel(model: string): Budget {
  const value = model.toLowerCase()
  if (value.includes('mini') || value.includes('small') || value.includes('flash') || value.includes('haiku') || value.includes('8b') || value.includes('1.5b')) return 'cheap'
  if (value.includes('large') || value.includes('opus') || value.includes('70b') || value.includes('405b') || value.includes('pro')) return 'strong'
  return 'balanced'
}

export default function ComposerControls({ settings, activeProvider, availableModels, modelOverride, onModelOverride, onSettings }: ComposerControlsProps) {
  const [modelOpen, setModelOpen] = useState(false)
  const [budgetTab, setBudgetTab] = useState<Budget>(settings.teamTokenBudget || 'balanced')
  const [source, setSource] = useState<Source>(activeProvider && getProviderCategory(activeProvider) === 'local' ? 'local' : 'cloud')
  const models = useMemo(() => [...new Set([...(activeProvider?.model ? [activeProvider.model] : []), ...availableModels])], [activeProvider?.model, availableModels])
  const visibleModels = models.filter((model) => tierForModel(model) === budgetTab)
  const localProviders = settings.providers.filter((provider) => getProviderCategory(provider) === 'local')
  const cloudProviders = settings.providers.filter((provider) => getProviderCategory(provider) !== 'local')

  const changeBudget = (budget: Budget) => {
    setBudgetTab(budget)
    onSettings({ ...settings, teamTokenBudget: budget })
  }

  const changeSource = (next: Source) => {
    setSource(next)
    const candidates = next === 'local' ? localProviders : cloudProviders
    const provider = candidates[0]
    if (provider && provider.id !== settings.activeProvider) onSettings({ ...settings, activeProvider: provider.id })
  }

  return (
    <div className="vd-composer-controls" aria-label="Composer controls">
      <div className="vd-model-picker-wrap">
        <button className="vd-composer-chip" aria-haspopup="dialog" aria-expanded={modelOpen} onClick={() => setModelOpen((value) => !value)} title="Choose a model budget and model">
          ✦ {modelOverride || activeProvider?.model || 'Auto model'} <span className="vd-chip-chevron">⌃</span>
        </button>
        {modelOpen && (
          <div className="vd-model-popover" role="dialog" aria-label="Model picker">
            <div className="vd-model-popover-title">Choose response model</div>
            <div className="vd-model-tabs" role="tablist" aria-label="Model budgets">
              {budgetLabels.map(([id, label]) => <button key={id} role="tab" aria-selected={budgetTab === id} className={budgetTab === id ? 'active' : ''} onClick={() => changeBudget(id)}>{label}</button>)}
            </div>
            <div className="vd-model-list">
              <button className={`vd-model-row ${!modelOverride ? 'active' : ''}`} onClick={() => { onModelOverride(null); setModelOpen(false) }}><span>Auto-select</span><small>{activeProvider?.name || 'best configured provider'}</small></button>
              {visibleModels.map((model) => <button key={model} className={`vd-model-row ${modelOverride === model ? 'active' : ''}`} onClick={() => { onModelOverride(model); setModelOpen(false) }}><span>{model}</span><small>{activeProvider?.name || 'configured provider'}</small></button>)}
              {visibleModels.length === 0 && <div className="vd-model-empty">No cataloged models in this tier yet. Auto-select remains available.</div>}
            </div>
            <button className="vd-model-clear" onClick={() => setModelOpen(false)}>Done</button>
          </div>
        )}
      </div>
      <div className="vd-control-group" role="group" aria-label="Provider source">
        <button className={source === 'local' ? 'active' : ''} onClick={() => changeSource('local')} title={localProviders.length ? 'Use a configured local provider' : 'No local provider is configured'}>Local</button>
        <button className={source === 'cloud' ? 'active' : ''} onClick={() => changeSource('cloud')} title={cloudProviders.length ? 'Use a configured cloud provider' : 'No cloud provider is configured'}>Cloud</button>
      </div>
      <label className="vd-effort-control" title="Used in the model prompt to control response depth">
        <span>Effort</span>
        <input type="range" min="0" max="2" step="1" value={settings.responseEffort === 'low' ? 0 : settings.responseEffort === 'high' ? 2 : 1} aria-label="Response effort" onChange={(event) => onSettings({ ...settings, responseEffort: (['low', 'medium', 'high'] as const)[Number(event.target.value)] })} />
        <span>{settings.responseEffort || 'medium'}</span>
      </label>
    </div>
  )
}

import type { Settings } from '../types'
import type { WorkingMode } from '../lib/layoutPersistence'

const MODES: Array<[WorkingMode, string]> = [['plan', 'Plan'], ['build', 'Build'], ['multitask', 'Multitask'], ['ask', 'Ask'], ['review', 'Review'], ['debug', 'Debug']]

export default function WorkingModeSelector({ settings, onChange }: { settings: Settings; onChange: (settings: Settings) => void }) {
  const value = settings.layout?.workingMode || (settings.planMode ? 'plan' : 'build')
  return (
    <select aria-label="Working mode" value={value} onChange={(event) => {
      const workingMode = event.target.value as WorkingMode
      const readOnly = workingMode === 'plan' || workingMode === 'ask' || workingMode === 'review'
      onChange({
        ...settings,
        planMode: readOnly,
        teamMode: workingMode === 'multitask' ? 'always' : settings.teamMode,
        layout: { ...(settings.layout || {}), version: 1, workingMode } as Settings['layout'],
      })
    }} title="Working mode; Plan, Ask, and Review are read-only">
      {MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select>
  )
}

export type WorkingMode = 'plan' | 'build' | 'multitask' | 'ask' | 'review' | 'debug'

export interface LayoutPreferences {
  version: 1
  leftRailCollapsed: boolean
  sidebarCollapsed: boolean
  historyCollapsed: boolean
  launcherCollapsed: boolean
  terminalCollapsed: boolean
  sidebarWidth: number
  historyWidth: number
  launcherWidth: number
  terminalHeight: number
  workingMode: WorkingMode
  surface: 'agent' | 'code'
}

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferences = {
  version: 1, leftRailCollapsed: false, sidebarCollapsed: false, historyCollapsed: false, launcherCollapsed: false, terminalCollapsed: false,
  sidebarWidth: 260, historyWidth: 240, launcherWidth: 52, terminalHeight: 220, workingMode: 'build', surface: 'agent', 
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, number))
}

export function normalizeLayoutPreferences(input: unknown): LayoutPreferences {
  const value = input && typeof input === 'object' ? input as Partial<LayoutPreferences> : {}
  const modes: WorkingMode[] = ['plan', 'build', 'multitask', 'ask', 'review', 'debug']
  return { ...DEFAULT_LAYOUT_PREFERENCES, leftRailCollapsed: value.leftRailCollapsed === true, sidebarCollapsed: value.sidebarCollapsed === true, historyCollapsed: value.historyCollapsed === true, launcherCollapsed: value.launcherCollapsed === true, terminalCollapsed: value.terminalCollapsed === true, sidebarWidth: clamp(value.sidebarWidth, 180, 420, 260), historyWidth: clamp(value.historyWidth, 220, 460, 280), launcherWidth: clamp(value.launcherWidth, 44, 180, 52), terminalHeight: clamp(value.terminalHeight, 120, 480, 220), workingMode: modes.includes(value.workingMode as WorkingMode) ? value.workingMode as WorkingMode : 'build', surface: value.surface === 'code' ? 'code' : 'agent' }
}

export function mergeLayoutPreferences(current: unknown, patch: Partial<LayoutPreferences>): LayoutPreferences {
  return normalizeLayoutPreferences({ ...normalizeLayoutPreferences(current), ...patch })
}

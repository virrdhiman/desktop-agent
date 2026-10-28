export const THEME_PREFERENCES = [
  'pit-brand', 'system', 'light', 'dark', 'pink-light', 'pink-dark',
] as const

export type ThemePreference = typeof THEME_PREFERENCES[number]

export const THEME_LABELS: Record<ThemePreference, string> = {
  'pit-brand': 'PIT Brand (default)',
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  'pink-light': 'Pink Light',
  'pink-dark': 'Pink Dark',
}

export const THEME_DESCRIPTIONS: Record<ThemePreference, string> = {
  'pit-brand': 'Productive IT colors that follow your device setting',
  system: 'Follows your device setting',
  light: 'Clean light surfaces with a blue accent',
  dark: 'Dark surfaces with a blue accent',
  'pink-light': 'Soft blush surfaces with a rose-pink accent',
  'pink-dark': 'Deep plum surfaces with a rose-pink accent',
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (value === 'pit-brand-light' || value === 'pit-brand-dark') return 'pit-brand'
  return typeof value === 'string' && THEME_PREFERENCES.includes(value as ThemePreference)
    ? value as ThemePreference
    : 'pit-brand'
}

export function resolveThemeMode(value: unknown, systemMode: 'light' | 'dark'): 'light' | 'dark' {
  const preference = normalizeThemePreference(value)
  if (preference === 'light' || preference === 'pink-light') return 'light'
  if (preference === 'dark' || preference === 'pink-dark') return 'dark'
  return systemMode
}

export function applyThemePreference(root: HTMLElement, value: unknown): ThemePreference {
  const preference = normalizeThemePreference(value)
  root.dataset.theme = preference
  root.style.colorScheme = preference === 'system' || preference === 'pit-brand'
    ? ''
    : preference === 'light' || preference === 'pink-light' ? 'light' : 'dark'
  return preference
}

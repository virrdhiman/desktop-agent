export const THEME_PREFERENCES = [
  'system', 'light', 'dark', 'pink-light', 'pink-dark', 'pit-brand-light', 'pit-brand-dark',
] as const

export type ThemePreference = typeof THEME_PREFERENCES[number]

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  'pink-light': 'Pink Light',
  'pink-dark': 'Pink Dark',
  'pit-brand-light': 'PIT Brand Light',
  'pit-brand-dark': 'PIT Brand Dark',
}

export const THEME_DESCRIPTIONS: Record<ThemePreference, string> = {
  system: 'Follows your device setting',
  light: 'Clean light surfaces with a blue accent',
  dark: 'Dark surfaces with a blue accent',
  'pink-light': 'Soft blush surfaces with a rose-pink accent',
  'pink-dark': 'Deep plum surfaces with a rose-pink accent',
  'pit-brand-light': 'Cool light surfaces with Productive IT navy and green accents',
  'pit-brand-dark': 'Deep navy surfaces with Productive IT green accents',
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return typeof value === 'string' && THEME_PREFERENCES.includes(value as ThemePreference)
    ? value as ThemePreference
    : 'system'
}

export function applyThemePreference(root: HTMLElement, value: unknown): ThemePreference {
  const preference = normalizeThemePreference(value)
  root.dataset.theme = preference
  root.style.colorScheme = preference === 'system'
    ? ''
    : preference === 'light' || preference === 'pink-light' || preference === 'pit-brand-light' ? 'light' : 'dark'
  return preference
}

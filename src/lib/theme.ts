export const THEME_PREFERENCES = ['system', 'light', 'dark', 'pink-light', 'pink-dark'] as const

export type ThemePreference = typeof THEME_PREFERENCES[number]

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  'pink-light': 'Pink Light',
  'pink-dark': 'Pink Dark',
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
    : preference === 'light' || preference === 'pink-light' ? 'light' : 'dark'
  return preference
}

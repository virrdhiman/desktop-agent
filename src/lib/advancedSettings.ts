/** Opt-in feature flags; legacy/malformed settings cannot enable them implicitly. */
export function normalizeAdvancedSettings(settings: Record<string, unknown> = {}) {
  return {
    autocompleteEnabled: settings.autocompleteEnabled === true,
    indexingEnabled: settings.indexingEnabled === true,
    telemetryEnabled: settings.telemetryEnabled === true,
    updateChannel: settings.updateChannel === 'beta' ? 'beta' as const : 'stable' as const,
  }
}

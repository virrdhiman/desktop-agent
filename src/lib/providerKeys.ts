/**
 * @author Virender Dhiman
 * @year 2026
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */

export const LOCAL_PLACEHOLDER_KEYS = new Set(['ollama', 'lm-studio', 'llama-cpp'])

export type KeyedProvider = {
  apiKey?: string
  hasKey?: boolean
  clearKey?: boolean
}

export function isLocalPlaceholderKey(key: string): boolean {
  return LOCAL_PLACEHOLDER_KEYS.has(key)
}

/** Real secrets stay in the main process. Local placeholders are not secrets. */
export function maskProviderForRenderer<T extends KeyedProvider>(provider: T): T {
  const { clearKey: _clear, ...rest } = provider
  const key = typeof rest.apiKey === 'string' ? rest.apiKey : ''
  if (!key || isLocalPlaceholderKey(key)) return rest as T
  return { ...rest, apiKey: '', hasKey: true } as T
}

/**
 * Empty incoming keys keep the stored value (possibly already encrypted).
 * A typed key replaces it. clearKey wipes it.
 */
export function nextStoredApiKey(
  incoming: KeyedProvider,
  storedApiKey: string | undefined,
  encrypt: (plain: string) => string,
): string {
  if (incoming.clearKey) return ''
  const typed = typeof incoming.apiKey === 'string' ? incoming.apiKey.trim() : ''
  if (!typed) return storedApiKey || ''
  return encrypt(typed)
}

/** Never persist a secret in plaintext, including keys from older settings files. */
export function secureStoredApiKey(incoming: KeyedProvider, storedApiKey: string | undefined, encrypt: (plain: string) => string): string {
  if (incoming.clearKey) return ''
  const typed = typeof incoming.apiKey === 'string' ? incoming.apiKey.trim() : ''
  const key = typed || storedApiKey || ''
  if (!key || isLocalPlaceholderKey(key) || (!typed && key.startsWith('enc:'))) return key
  return encrypt(key)
}

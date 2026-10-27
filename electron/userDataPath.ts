import path from 'node:path'

/** The legacy directory is intentionally stable so a product rename upgrades in place. */
export const LEGACY_USER_DATA_FOLDER = 'VD Agent'

/** Return the explicit QA user-data directory, if the launcher supplied one. */
export function userDataOverride(argv: string[] = process.argv): string | undefined {
  const index = argv.findIndex((argument) => argument === '--user-data-dir' || argument.startsWith('--user-data-dir='))
  if (index < 0) return undefined
  const raw = argv[index].includes('=') ? argv[index].slice(argv[index].indexOf('=') + 1) : argv[index + 1]
  return raw?.trim() ? path.resolve(raw.trim()) : undefined
}

export function stableUserDataPath(appDataPath: string): string {
  return path.join(appDataPath, LEGACY_USER_DATA_FOLDER)
}

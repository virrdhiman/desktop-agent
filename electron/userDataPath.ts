import path from 'node:path'

/** Return the explicit QA user-data directory, if the launcher supplied one. */
export function userDataOverride(argv: string[] = process.argv): string | undefined {
  const index = argv.findIndex((argument) => argument === '--user-data-dir' || argument.startsWith('--user-data-dir='))
  if (index < 0) return undefined
  const raw = argv[index].includes('=') ? argv[index].slice(argv[index].indexOf('=') + 1) : argv[index + 1]
  return raw?.trim() ? path.resolve(raw.trim()) : undefined
}

/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import path from 'path'

/**
 * Where a private env file may be read from.
 * Packaged apps do not look beside the executable or inside resources.
 * Set VD_AGENT_ENV_FILE to opt in to a specific path.
 */
export function privateEnvCandidatePaths(options: {
  userData: string
  appPath: string
  packaged: boolean
  envFile?: string
  disabled?: boolean
}): string[] {
  if (options.disabled) return []
  const files = [path.join(options.userData, '.env.local')]
  if (!options.packaged && options.appPath) files.push(path.join(options.appPath, '.env.local'))
  const explicit = options.envFile?.trim()
  if (explicit) files.push(explicit)
  return files
}

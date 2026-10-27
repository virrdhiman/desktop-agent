/**
 * @author Virender Dhiman
 * @year 2026
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Writes release/SHA256SUMS.txt for the downloadable files in release/
 * (installers, archives, packages). The format matches `sha256sum`, so users
 * can verify with `sha256sum -c SHA256SUMS.txt` or compare hashes manually.
 *
 *   npm run checksums
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseFiles, verifyChecksums, writeChecksums } from './checksums-lib.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(repo, 'release')
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
const includeAll = process.argv.includes('--all')
if (process.argv.includes('--verify')) {
  const result = await verifyChecksums(releaseDir)
  if (!result.ok) {
    for (const failure of result.failures) console.error(failure)
    process.exit(1)
  }
  console.log(`Verified ${result.checked} release artifact${result.checked === 1 ? '' : 's'}.`)
} else {
  try {
    const files = releaseFiles(releaseDir, pkg.version, includeAll)
    if (files.length === 0) throw new Error(`No ${includeAll ? '' : `${pkg.version} `}installers or archives found in release/.`)
    const result = await writeChecksums(releaseDir, pkg.version, includeAll)
    for (const line of result.lines) console.log(line)
    console.log(`\nWrote release/SHA256SUMS.txt (${files.length} file${files.length === 1 ? '' : 's'})`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

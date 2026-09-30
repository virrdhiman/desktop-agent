/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Writes release/SHA256SUMS.txt for the downloadable files in release/
 * (installers, archives, packages). The format matches `sha256sum`, so users
 * can verify with `sha256sum -c SHA256SUMS.txt` or compare hashes manually.
 *
 *   npm run checksums
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const releaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'release')
const DOWNLOADABLE = /\.(exe|msi|dmg|zip|appimage|deb|rpm|tar\.gz|snap)$/i

if (!fs.existsSync(releaseDir)) {
  console.error('No release/ folder. Build the app first (Win\\build.bat, Mac/build.sh, or Linux/build.sh).')
  process.exit(1)
}

const files = fs.readdirSync(releaseDir, { withFileTypes: true })
  .filter((e) => e.isFile() && DOWNLOADABLE.test(e.name))
  .map((e) => e.name)
  .sort()

if (files.length === 0) {
  console.error('No installers or archives found in release/.')
  process.exit(1)
}

const hashFile = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256')
  fs.createReadStream(path.join(releaseDir, file))
    .on('data', (chunk) => hash.update(chunk))
    .on('end', () => resolve(hash.digest('hex')))
    .on('error', reject)
})

const lines = []
for (const file of files) {
  const digest = await hashFile(file)
  lines.push(`${digest}  ${file}`)
  console.log(`${digest}  ${file}`)
}
fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), lines.join('\n') + '\n')
console.log(`\nWrote release/SHA256SUMS.txt (${files.length} file${files.length === 1 ? '' : 's'})`)

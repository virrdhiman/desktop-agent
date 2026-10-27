import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const DOWNLOADABLE = /\.(exe|msi|dmg|zip|appimage|deb|rpm|tar\.gz|snap)$/i

export function releaseFiles(releaseDir, version, includeAll = false) {
  if (!fs.existsSync(releaseDir)) throw new Error('No release/ folder. Build the app first.')
  return fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && DOWNLOADABLE.test(entry.name))
    .filter((entry) => includeAll || entry.name.includes(version))
    .map((entry) => entry.name)
    .sort()
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

export async function writeChecksums(releaseDir, version, includeAll = false) {
  const files = releaseFiles(releaseDir, version, includeAll)
  if (files.length === 0) throw new Error(`No ${includeAll ? '' : `${version} `}downloadable artifacts found in release/.`)
  const lines = []
  for (const file of files) lines.push(`${await sha256File(path.join(releaseDir, file))}  ${file}`)
  const checksumPath = path.join(releaseDir, 'SHA256SUMS.txt')
  fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`)
  return { checksumPath, files, lines }
}

export async function verifyChecksums(releaseDir, checksumPath = path.join(releaseDir, 'SHA256SUMS.txt')) {
  if (!fs.existsSync(checksumPath)) return { ok: false, checked: 0, failures: ['SHA256SUMS.txt is missing'] }
  const failures = []
  const entries = fs.readFileSync(checksumPath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const entry of entries) {
    const match = /^(?<digest>[a-f0-9]{64})\s+\*?(?<file>.+)$/i.exec(entry)
    if (!match?.groups) {
      failures.push(`Invalid checksum line: ${entry}`)
      continue
    }
    const file = match.groups.file
    const target = path.resolve(releaseDir, file)
    if (path.dirname(target) !== path.resolve(releaseDir) || !fs.existsSync(target)) {
      failures.push(`Missing artifact: ${file}`)
      continue
    }
    const actual = await sha256File(target)
    if (actual.toLowerCase() !== match.groups.digest.toLowerCase()) failures.push(`Hash mismatch: ${file}`)
  }
  return { ok: failures.length === 0 && entries.length > 0, checked: entries.length, failures }
}

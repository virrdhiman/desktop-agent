/** Safe, bounded ZIP inspection and extraction for agent archive workflows. */
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import * as yauzl from 'yauzl'
import type { Readable } from 'stream'
import { isPathInsideWorkspace, resolvesInsideWorkspace } from './toolPolicy'

export const MAX_ARCHIVE_ENTRIES = 2_000
export const MAX_ARCHIVE_FILE_BYTES = 64 * 1024 * 1024
export const MAX_ARCHIVE_TOTAL_BYTES = 512 * 1024 * 1024

export type ArchiveEntrySummary = {
  name: string
  directory: boolean
  compressedBytes: number
  uncompressedBytes: number
}
export type ArchiveInspection = {
  archivePath: string
  entries: ArchiveEntrySummary[]
  fileCount: number
  directoryCount: number
  totalUncompressedBytes: number
}

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

type ModernZipFile = yauzl.ZipFile & {
  eachEntry(): AsyncIterable<yauzl.Entry>
  openReadStreamPromise(entry: yauzl.Entry): Promise<Readable>
}

type ModernYauzl = typeof yauzl & {
  openPromise(filePath: string, options?: yauzl.Options): Promise<ModernZipFile>
}

function normalizedEntryName(name: string): string {
  const normalized = name.replace(/\\/g, '/')
  if (!normalized || normalized.includes('\0') || /^[A-Za-z]:/.test(normalized) || normalized.startsWith('/')) {
    throw new Error(`Unsafe ZIP entry path: ${name}`)
  }
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0 || parts.some((part) => (
    part === '..'
    || part === '.'
    || part.includes(':')
    || /[. ]$/.test(part)
    || WINDOWS_RESERVED_NAME.test(part)
  ))) {
    throw new Error(`Unsafe ZIP entry path: ${name}`)
  }
  return normalized.endsWith('/') ? `${parts.join('/')}/` : parts.join('/')
}

function isSymlink(entry: yauzl.Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000
  return mode === 0o120000
}

async function openArchive(archivePath: string): Promise<ModernZipFile> {
  const stat = await fs.promises.stat(archivePath)
  if (!stat.isFile()) throw new Error('Archive path is not a regular file')
  if (path.extname(archivePath).toLowerCase() !== '.zip') throw new Error('Only .zip archives are supported')
  return (yauzl as ModernYauzl).openPromise(archivePath, {
    autoClose: true,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  })
}

export async function inspectZipArchive(archivePath: string): Promise<ArchiveInspection> {
  const zip = await openArchive(archivePath)
  const entries: ArchiveEntrySummary[] = []
  let totalUncompressedBytes = 0
  let fileCount = 0
  let directoryCount = 0
  const entryKinds = new Map<string, boolean>()

  try {
    for await (const entry of zip.eachEntry()) {
      if (entries.length >= MAX_ARCHIVE_ENTRIES) throw new Error(`ZIP contains more than ${MAX_ARCHIVE_ENTRIES} entries`)
      if (isSymlink(entry)) throw new Error(`ZIP contains a symbolic link, which is not supported: ${entry.fileName}`)
      const name = normalizedEntryName(entry.fileName)
      const directory = name.endsWith('/')
      const comparableName = name.replace(/\/$/, '').normalize('NFC').toLowerCase()
      if (entryKinds.has(comparableName)) throw new Error(`ZIP contains duplicate or case-colliding entries: ${name}`)
      const ancestors = comparableName.split('/')
      ancestors.pop()
      while (ancestors.length > 0) {
        if (entryKinds.get(ancestors.join('/')) === false) {
          throw new Error(`ZIP path conflicts with a file entry: ${name}`)
        }
        ancestors.pop()
      }
      if (!directory && [...entryKinds.keys()].some((existing) => existing.startsWith(`${comparableName}/`))) {
        throw new Error(`ZIP file conflicts with a directory path: ${name}`)
      }
      entryKinds.set(comparableName, directory)
      if (!directory && entry.uncompressedSize > MAX_ARCHIVE_FILE_BYTES) {
        throw new Error(`ZIP entry exceeds the ${MAX_ARCHIVE_FILE_BYTES} byte file limit: ${name}`)
      }
      totalUncompressedBytes += directory ? 0 : entry.uncompressedSize
      if (totalUncompressedBytes > MAX_ARCHIVE_TOTAL_BYTES) {
        throw new Error(`ZIP expands beyond the ${MAX_ARCHIVE_TOTAL_BYTES} byte total limit`)
      }
      if (directory) directoryCount++
      else fileCount++
      entries.push({
        name,
        directory,
        compressedBytes: entry.compressedSize,
        uncompressedBytes: entry.uncompressedSize,
      })
    }
  } finally {
    if (zip.isOpen) zip.close()
  }

  return { archivePath, entries, fileCount, directoryCount, totalUncompressedBytes }
}

export function archiveOutputPaths(outputDir: string, inspection: ArchiveInspection): string[] {
  const root = path.resolve(outputDir)
  return inspection.entries
    .filter((entry) => !entry.directory)
    .map((entry) => path.resolve(root, entry.name))
    .filter((target) => isPathInsideWorkspace(root, target))
}

export async function extractZipArchive(
  archivePath: string,
  outputDir: string,
  options: { overwrite?: boolean; inspection?: ArchiveInspection } = {},
): Promise<{ extracted: string[]; skipped: string[]; totalBytes: number }> {
  const inspection = options.inspection || await inspectZipArchive(archivePath)
  if (path.resolve(inspection.archivePath) !== path.resolve(archivePath)) {
    throw new Error('Archive inspection does not match the requested ZIP')
  }
  const root = path.resolve(outputDir)
  await fs.promises.mkdir(root, { recursive: true })
  const zip = await openArchive(archivePath)
  const extracted: string[] = []
  const skipped: string[] = []
  let entryCount = 0
  let totalBytes = 0

  try {
    for await (const entry of zip.eachEntry()) {
      entryCount++
      if (entryCount > MAX_ARCHIVE_ENTRIES) throw new Error(`ZIP contains more than ${MAX_ARCHIVE_ENTRIES} entries`)
      if (isSymlink(entry)) throw new Error(`ZIP contains a symbolic link, which is not supported: ${entry.fileName}`)
      const name = normalizedEntryName(entry.fileName)
      const target = path.resolve(root, name)
      if (!isPathInsideWorkspace(root, target) || !await resolvesInsideWorkspace(root, target)) {
        throw new Error(`ZIP entry escapes the extraction folder: ${name}`)
      }
      if (name.endsWith('/')) {
        await fs.promises.mkdir(target, { recursive: true })
        continue
      }
      if (entry.uncompressedSize > MAX_ARCHIVE_FILE_BYTES) {
        throw new Error(`ZIP entry exceeds the ${MAX_ARCHIVE_FILE_BYTES} byte file limit: ${name}`)
      }
      totalBytes += entry.uncompressedSize
      if (totalBytes > MAX_ARCHIVE_TOTAL_BYTES) {
        throw new Error(`ZIP expands beyond the ${MAX_ARCHIVE_TOTAL_BYTES} byte total limit`)
      }
      if (!options.overwrite && fs.existsSync(target)) {
        skipped.push(name)
        continue
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true })
      const input = await zip.openReadStreamPromise(entry)
      await pipeline(input, fs.createWriteStream(target, { flags: options.overwrite ? 'w' : 'wx', mode: 0o600 }))
      extracted.push(name)
    }
  } finally {
    if (zip.isOpen) zip.close()
  }

  return { extracted, skipped, totalBytes }
}

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pipeline } from 'stream/promises'
import * as yazl from 'yazl'
import { archiveOutputPaths, extractZipArchive, inspectZipArchive } from '../archiveStore'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-archive-'))
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

async function writeZip(name: string, files: Record<string, string>): Promise<string> {
  const target = path.join(root, name)
  const zip = new yazl.ZipFile()
  for (const [entry, content] of Object.entries(files)) zip.addBuffer(Buffer.from(content), entry)
  zip.end()
  await pipeline(zip.outputStream, fs.createWriteStream(target))
  return target
}

describe('archiveStore', () => {
  it('lists and extracts every regular entry while preserving nested paths', async () => {
    const archive = await writeZip('orders.zip', {
      'orders/one.json': '{"id":1}',
      'orders/two.csv': 'id,total\n2,9.50\n',
      'README.txt': 'source notes',
    })
    const inspection = await inspectZipArchive(archive)
    expect(inspection.fileCount).toBe(3)
    expect(inspection.entries.map((entry) => entry.name)).toEqual([
      'orders/one.json', 'orders/two.csv', 'README.txt',
    ])

    const output = path.join(root, 'out')
    const extracted = await extractZipArchive(archive, output)
    expect(extracted.extracted).toHaveLength(3)
    expect(fs.readFileSync(path.join(output, 'orders', 'one.json'), 'utf8')).toBe('{"id":1}')
    expect(archiveOutputPaths(output, inspection)).toContain(path.join(output, 'README.txt'))
  })

  it('does not overwrite an existing file unless overwrite is explicit', async () => {
    const archive = await writeZip('existing.zip', { 'data.txt': 'from zip' })
    const output = path.join(root, 'out')
    fs.mkdirSync(output)
    fs.writeFileSync(path.join(output, 'data.txt'), 'keep me')

    const skipped = await extractZipArchive(archive, output)
    expect(skipped.skipped).toEqual(['data.txt'])
    expect(fs.readFileSync(path.join(output, 'data.txt'), 'utf8')).toBe('keep me')

    await extractZipArchive(archive, output, { overwrite: true })
    expect(fs.readFileSync(path.join(output, 'data.txt'), 'utf8')).toBe('from zip')
  })

  it('rejects zip-slip paths before writing outside the destination', async () => {
    const archive = await writeZip('unsafe.zip', { 'safe.txt': 'blocked' })
    const bytes = fs.readFileSync(archive)
    const safe = Buffer.from('safe.txt')
    const unsafe = Buffer.from('../x.txt')
    let replaced = 0
    for (let offset = 0; offset <= bytes.length - safe.length; offset++) {
      if (bytes.subarray(offset, offset + safe.length).equals(safe)) {
        unsafe.copy(bytes, offset)
        replaced++
      }
    }
    expect(replaced).toBe(2)
    fs.writeFileSync(archive, bytes)

    const output = path.join(root, 'out')
    await expect(extractZipArchive(archive, output)).rejects.toThrow(/invalid relative path|unsafe|escape/i)
    expect(fs.existsSync(path.join(root, 'x.txt'))).toBe(false)
  })

  it('rejects non-ZIP inputs before extraction', async () => {
    const text = path.join(root, 'orders.txt')
    fs.writeFileSync(text, 'not a zip')
    await expect(inspectZipArchive(text)).rejects.toThrow('Only .zip archives are supported')
  })

  it('rejects Windows-dangerous entry names on every platform', async () => {
    const archive = await writeZip('reserved.zip', { 'orders/CON.txt': 'unsafe' })
    await expect(inspectZipArchive(archive)).rejects.toThrow(/Unsafe ZIP entry path/)
  })

  it('rejects case-colliding entries before creating the output directory', async () => {
    const archive = await writeZip('duplicates.zip', { 'orders/a.json': '{}', 'orders/A.json': '{}' })
    const output = path.join(root, 'not-created')
    await expect(extractZipArchive(archive, output)).rejects.toThrow(/duplicate or case-colliding/i)
    expect(fs.existsSync(output)).toBe(false)
  })
})

// @vitest-environment node
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractPdfTextFromBuffer, extractPdfTextFile, formatDataRows, parseCsv, queryPostgres,
  querySqlite, readCsvFile, readExcelFile, runOfflineOcr, serializeCsv, validateSql,
  validateTabularRows, writeCsvFile, writeExcelFile,
} from '../dataTools'

const require = createRequire(import.meta.url)
const roots: string[] = []
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-data-tools-'))
  roots.push(root)
  return root
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

describe('data tool validation', () => {
  it('allows one read query and blocks writes, maintenance, and multiple statements', () => {
    expect(validateSql('SELECT name FROM users WHERE id = $1;')).toEqual({ ok: true })
    expect(validateSql('WITH rows AS (SELECT 1) SELECT * FROM rows')).toEqual({ ok: true })
    expect(validateSql('UPDATE users SET name = \'secret\'')).toMatchObject({ ok: false })
    expect(validateSql('SELECT 1; DELETE FROM users')).toMatchObject({ ok: false })
    expect(validateSql('SELECT load_extension(\'x\')')).toMatchObject({ ok: false })
  })

  it('bounds and validates tabular rows', () => {
    expect(validateTabularRows([[1, 'two', null, true]])).toEqual({ ok: true })
    expect(validateTabularRows([{ value: 'not an array' }])).toMatchObject({ ok: false })
    expect(formatDataRows([[1, 'two']])).toBe('[[1,"two"]]')
  })
})

describe('CSV tools', () => {
  it('round-trips quoted cells and escaped formula-like values', () => {
    const csv = serializeCsv([['name', 'notes'], ['Ada', 'line 1, line 2\nnext'], ['formula', '=SUM(A1:A2)']])
    expect(csv).toContain('"line 1, line 2\nnext"')
    expect(csv).toContain("'=SUM(A1:A2)")
    expect(parseCsv(csv)).toEqual([['name', 'notes'], ['Ada', 'line 1, line 2\nnext'], ['formula', "'=SUM(A1:A2)"]])
  })

  it('writes and reads a bounded workspace CSV', async () => {
    const root = tempRoot()
    const file = path.join(root, 'rows.csv')
    await writeCsvFile(file, [['id', 'value'], [1, 'ok']])
    await expect(readCsvFile(file)).resolves.toEqual([['id', 'value'], ['1', 'ok']])
  })
})

describe('SQLite and Postgres tools', () => {
  it('queries SQLite through an installed runtime in read-only mode', async () => {
    const root = tempRoot()
    const file = path.join(root, 'sample.db')
    const DatabaseSync = require('node:sqlite').DatabaseSync
    const db = new DatabaseSync(file)
    db.exec('CREATE TABLE users (id INTEGER, name TEXT); INSERT INTO users VALUES (1, \'Ada\');')
    db.close()
    await expect(querySqlite(file, 'SELECT id, name FROM users WHERE id = ?', [1])).resolves.toEqual([[1, 'Ada']])
    await expect(querySqlite(file, 'DELETE FROM users', [])).rejects.toThrow(/read-only|SELECT|write/i)
  })

  it('reports a clear unavailable error when pg is not installed', async () => {
    await expect(queryPostgres('postgresql://readonly@localhost/db', 'SELECT 1', [])).rejects.toThrow(/Postgres unavailable/i)
  })
})

describe('Excel and PDF tools', () => {
  const xlsxInstalled = (() => {
    try {
      require.resolve('xlsx')
      return true
    } catch {
      return false
    }
  })()

  if (xlsxInstalled) {
    it('round-trips Excel through the installed optional xlsx driver', async () => {
      const root = tempRoot()
      const file = path.join(root, 'rows.xlsx')
      const rows = [['name', 'count', 'active'], ['Ada', 2, true], ['Grace', 3, false]] as const
      await expect(writeExcelFile(file, rows, 'Data')).resolves.toBeGreaterThan(0)
      await expect(readExcelFile(file, 'Data')).resolves.toEqual(rows)
    })
  } else {
    it('reports Excel unavailable without an optional xlsx driver', async () => {
      const root = tempRoot()
      const file = path.join(root, 'rows.xlsx')
      await expect(readExcelFile(file)).rejects.toThrow(/Excel unavailable/i)
      await expect(writeExcelFile(file, [['a']])).rejects.toThrow(/Excel unavailable/i)
    })
  }

  it('extracts common uncompressed and Flate-compressed PDF text', async () => {
    const plain = Buffer.from('%PDF-1.4\nBT\n(Hello ) Tj\n(World) Tj\n[( from) 20 (PDF)] TJ\nET\n%%EOF')
    expect(extractPdfTextFromBuffer(plain)).toBe('Hello World fromPDF')
    const content = Buffer.from('BT\n(Compressed PDF) Tj\nET')
    const compressed = zlib.deflateSync(content)
    const pdf = Buffer.concat([
      Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
      compressed,
      Buffer.from('\nendstream\nendobj', 'latin1'),
    ])
    expect(extractPdfTextFromBuffer(pdf)).toContain('Compressed PDF')
    const root = tempRoot()
    const file = path.join(root, 'sample.pdf')
    await fs.promises.writeFile(file, plain)
    await expect(extractPdfTextFile(file)).resolves.toContain('Hello World')
  })
})

describe('offline OCR', () => {
  it('requires a local traineddata directory before starting tesseract', async () => {
    const root = tempRoot()
    const image = path.join(root, 'image.png')
    await fs.promises.writeFile(image, Buffer.from('not an image'))
    await expect(runOfflineOcr(image, 'eng', root)).rejects.toThrow(/language data unavailable|OCR unavailable/i)
    await expect(runOfflineOcr(image, 'eng')).rejects.toThrow(/language data path is unavailable/i)
  })
})

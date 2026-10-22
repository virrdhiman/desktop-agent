/**
 * Pure validation and bounded implementations for the optional data tools.
 *
 * The main-process tool handler is intentionally thin: this module owns the
 * input bounds, SQL read-only checks, CSV quoting, and optional-dependency
 * loading so those rules can be tested without an Electron window.
 */
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { createRequire } from 'module'

export const MAX_DATA_FILE_BYTES = 10 * 1024 * 1024
export const MAX_DATA_WRITE_BYTES = 5 * 1024 * 1024
export const MAX_DATA_ROWS = 10_000
export const MAX_DATA_COLUMNS = 256
export const MAX_DATA_CELL_CHARS = 100_000
export const MAX_DATA_RESULT_CHARS = 100_000
export const MAX_SQL_CHARS = 16_000
export const MAX_SQL_PARAMS = 100

export type DataCell = string | number | boolean | null
export type DataRows = DataCell[][]

export type ValidationResult = { ok: true } | { ok: false; error: string }

const require = createRequire(import.meta.url)

/** CommonJS loading keeps optional native/data packages out of the default bundle. */
export async function loadOptionalModule(name: string): Promise<any | null> {
  try { return require(name) } catch { return null }
}

export function validateWorkspaceDataPath(workspace: string | undefined, target: string | undefined): ValidationResult {
  if (!workspace) return { ok: false, error: 'An open workspace is required for data tools.' }
  if (!target || typeof target !== 'string') return { ok: false, error: 'A workspace-relative path is required.' }
  const root = path.resolve(workspace)
  const resolved = path.isAbsolute(target) ? path.resolve(target) : path.resolve(workspace, target)
  const relative = path.relative(root, resolved)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, error: 'Data tool paths must stay inside the open workspace.' }
  }
  return { ok: true }
}

/** Tokenize strings/comments before checking SQL so keyword text in data is harmless. */
function sqlTokens(sql: string): string {
  const tokens = sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\r\n]*|\/\*[\s\S]*?\*\/|[a-z_][a-z_0-9$]*|\S/gi) || []
  return tokens.map((token) => {
    if (token.startsWith('--') || token.startsWith('/*')) return ' '
    if (token.startsWith("'")) return ' ? '
    // Quoted function names and dialect-specific escape strings are rejected.
    if (token.startsWith('"') || token === "'" || token === '\\' || token === '`') throw new Error('Unsupported SQL quoting. Use simple identifiers and bound params.')
    return token
  }).join(' ')
}

/**
 * SQL is deliberately conservative. A read query is one SELECT/WITH
 * statement; PRAGMA and server-side session commands are not accepted because
 * they can mutate connection or database state on some engines.
 */
export function validateSql(sql: unknown): ValidationResult {
  if (typeof sql !== 'string' || !sql.trim()) return { ok: false, error: 'A non-empty SQL query is required.' }
  if (sql.length > MAX_SQL_CHARS) return { ok: false, error: `SQL query exceeds the ${MAX_SQL_CHARS}-character limit.` }
  let cleaned: string
  try { cleaned = sqlTokens(sql).replace(/;\s*$/, '').trim() } catch (error: any) { return { ok: false, error: error.message } }
  if (!cleaned) return { ok: false, error: 'A non-empty SQL query is required.' }
  if (cleaned.includes(';')) return { ok: false, error: 'Only one SQL statement is allowed.' }
  if (/\b(?:attach|detach|pragma|vacuum|reindex|copy|into)\b/i.test(cleaned)) {
    return { ok: false, error: 'Database session or maintenance statements are not allowed.' }
  }
  {
    if (!/^(?:select|with)\b/i.test(cleaned)) {
      return { ok: false, error: 'Read-only database queries must start with SELECT or WITH. Database writes are unsupported.' }
    }
    if (/\b(?:insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|set|reset)\b/i.test(cleaned)) {
      return { ok: false, error: 'The query contains a write or schema-changing keyword.' }
    }
  }
  // Read-only transactions alone do not stop SELECT calling network/file/session
  // functions. Permit only a small set of ordinary, unqualified SQL functions.
  const safeFunctions = new Set(['count', 'sum', 'avg', 'min', 'max', 'abs', 'round', 'lower', 'upper', 'length', 'coalesce', 'nullif', 'cast', 'substr', 'substring', 'trim', 'replace'])
  for (const match of cleaned.matchAll(/([a-z_][a-z_0-9$]*)\s*\(/gi)) {
    const word = match[1].toLowerCase()
    if (!safeFunctions.has(word) && !['as', 'in', 'exists', 'over', 'filter', 'from', 'select', 'where', 'and', 'or', 'not', 'on'].includes(word)) {
      return { ok: false, error: `SQL function or construct is not allowed: ${word}.` }
    }
    if (/\.\s*$/.test(cleaned.slice(0, match.index))) return { ok: false, error: 'Schema-qualified functions are not allowed.' }
  }
  return { ok: true }
}

export function normalizeSqlParams(params: unknown): DataCell[] | { error: string } {
  if (params === undefined) return []
  if (!Array.isArray(params)) return { error: 'SQL params must be an array.' }
  if (params.length > MAX_SQL_PARAMS) return { error: `SQL params are limited to ${MAX_SQL_PARAMS} values.` }
  const allowed = params.every((value) => value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
  if (!allowed || params.some((value) => typeof value === 'number' && !Number.isFinite(value))) {
    return { error: 'SQL params may only contain finite numbers, strings, booleans, or null.' }
  }
  if (params.some((value) => typeof value === 'string' && value.length > MAX_DATA_CELL_CHARS)) return { error: 'SQL parameter exceeds cell size limit.' }
  return params as DataCell[]
}

function validateRows(rows: unknown, label: string): ValidationResult {
  if (!Array.isArray(rows)) return { ok: false, error: `${label} must be an array of rows.` }
  if (rows.length > MAX_DATA_ROWS) return { ok: false, error: `${label} is limited to ${MAX_DATA_ROWS} rows.` }
  let cells = 0
  let chars = 0
  for (const row of rows) {
    if (!Array.isArray(row)) return { ok: false, error: `${label} must contain arrays of cells.` }
    if (row.length > MAX_DATA_COLUMNS) return { ok: false, error: `${label} is limited to ${MAX_DATA_COLUMNS} columns.` }
    cells += row.length
    if (cells > 50_000) return { ok: false, error: `${label} is limited to 50000 cells.` }
    for (const cell of row) {
      if (!(cell === null || typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean')) {
        return { ok: false, error: `${label} cells must be strings, numbers, booleans, or null.` }
      }
      if (typeof cell === 'string' && cell.length > MAX_DATA_CELL_CHARS) {
        return { ok: false, error: `${label} contains a cell larger than ${MAX_DATA_CELL_CHARS} characters.` }
      }
      if (typeof cell === 'number' && !Number.isFinite(cell)) return { ok: false, error: `${label} contains a non-finite number.` }
      chars += String(cell ?? '').length
      if (chars > MAX_DATA_WRITE_BYTES) return { ok: false, error: `${label} exceeds the output size limit.` }
    }
  }
  return { ok: true }
}

export function validateTabularRows(rows: unknown, label = 'rows'): ValidationResult {
  return validateRows(rows, label)
}

/** RFC 4180-compatible parser with CRLF support and bounded output. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  if (delimiter.length !== 1) throw new Error('CSV delimiter must be one character.')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++ }
        else quoted = false
      } else cell += char
      continue
    }
    if (char === '"' && cell.length === 0) { quoted = true; continue }
    if (char === delimiter) { row.push(cell); cell = ''; continue }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(cell); cell = ''
      if (rows.length >= MAX_DATA_ROWS) throw new Error(`CSV is limited to ${MAX_DATA_ROWS} rows.`)
      rows.push(row); row = []
      continue
    }
    cell += char
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted cell.')
  if (cell.length > 0 || row.length > 0 || text.endsWith(delimiter)) {
    row.push(cell)
    if (rows.length >= MAX_DATA_ROWS) throw new Error(`CSV is limited to ${MAX_DATA_ROWS} rows.`)
    rows.push(row)
  }
  for (const parsed of rows) {
    if (parsed.length > MAX_DATA_COLUMNS) throw new Error(`CSV is limited to ${MAX_DATA_COLUMNS} columns.`)
    if (parsed.some((value) => value.length > MAX_DATA_CELL_CHARS)) throw new Error(`CSV contains a cell larger than ${MAX_DATA_CELL_CHARS} characters.`)
  }
  return rows
}

function csvValue(value: DataCell): string {
  if (value === null) return ''
  const text = String(value)
  // Prevent a CSV opened in a spreadsheet from turning user data into a formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function serializeCsv(rows: unknown, delimiter = ','): string {
  const checked = validateRows(rows, 'rows')
  if (!checked.ok) throw new Error(checked.error)
  if (delimiter.length !== 1) throw new Error('CSV delimiter must be one character.')
  const output = (rows as DataRows).map((row) => row.map(csvValue).join(delimiter)).join('\r\n')
  if (Buffer.byteLength(output, 'utf8') > MAX_DATA_WRITE_BYTES) throw new Error(`CSV output is limited to ${MAX_DATA_WRITE_BYTES} bytes.`)
  return output
}

function toDataCell(cell: unknown): DataCell {
  if (cell === null || typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') return cell
  if (cell instanceof Date) return cell.toISOString()
  if (typeof cell === 'bigint') return cell.toString()
  return String(cell)
}

function boundedRows(rows: unknown, maxRows = MAX_DATA_ROWS): DataRows {
  if (!Array.isArray(rows)) throw new Error('The data source did not return rows.')
  const selected = rows.slice(0, Math.min(maxRows, MAX_DATA_ROWS)).map((row: any) => {
    if (Array.isArray(row)) return row.map(toDataCell)
    return Object.values(row || {}).map(toDataCell)
  })
  const checked = validateRows(selected, 'result')
  if (!checked.ok) throw new Error(checked.error)
  return selected
}

export async function readCsvFile(filePath: string, maxRows = MAX_DATA_ROWS, delimiter = ','): Promise<DataRows> {
  const stat = await fs.promises.stat(filePath)
  if (stat.size > MAX_DATA_FILE_BYTES) throw new Error(`CSV file is limited to ${MAX_DATA_FILE_BYTES} bytes.`)
  return parseCsv(await fs.promises.readFile(filePath, 'utf8'), delimiter).slice(0, Math.min(maxRows, MAX_DATA_ROWS))
}

export async function writeCsvFile(filePath: string, rows: unknown, delimiter = ','): Promise<number> {
  const text = serializeCsv(rows, delimiter)
  await fs.promises.writeFile(filePath, text, 'utf8')
  return Buffer.byteLength(text, 'utf8')
}

function xlsxApi(module: any): any {
  return module?.default?.utils ? module.default : module
}

export async function readExcelFile(filePath: string, sheetName?: string, maxRows = MAX_DATA_ROWS): Promise<DataRows> {
  const xlsx = xlsxApi(await loadOptionalModule('xlsx'))
  if (!xlsx?.read || !xlsx?.utils?.sheet_to_json) throw new Error('Excel unavailable: the optional "xlsx" package is not installed.')
  const stat = await fs.promises.stat(filePath)
  if (stat.size > MAX_DATA_FILE_BYTES) throw new Error(`Excel file is limited to ${MAX_DATA_FILE_BYTES} bytes.`)
  const workbook = xlsx.read(await fs.promises.readFile(filePath), { type: 'buffer', cellDates: true })
  const selected = sheetName || workbook.SheetNames?.[0]
  if (!selected || !workbook.Sheets?.[selected]) throw new Error(`Excel sheet not found: ${selected || '(first sheet)'}`)
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[selected], { header: 1, raw: true, defval: null })
  return boundedRows(rows, maxRows)
}

export async function writeExcelFile(filePath: string, rows: unknown, sheetName = 'Sheet1'): Promise<number> {
  const xlsx = xlsxApi(await loadOptionalModule('xlsx'))
  if (!xlsx?.write || !xlsx?.utils?.aoa_to_sheet) throw new Error('Excel unavailable: the optional "xlsx" package is not installed.')
  const checked = validateRows(rows, 'rows')
  if (!checked.ok) throw new Error(checked.error)
  const safeRows = (rows as DataRows).map((row) => row.map((cell) => typeof cell === 'string' && /^[=+\-@]/.test(cell) ? `'${cell}` : cell))
  const workbook = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(safeRows), String(sheetName || 'Sheet1').slice(0, 31))
  const output = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const bytes = Buffer.byteLength(output)
  if (bytes > MAX_DATA_WRITE_BYTES) throw new Error(`Excel output is limited to ${MAX_DATA_WRITE_BYTES} bytes.`)
  await fs.promises.writeFile(filePath, output)
  return bytes
}

function decodePdfLiteral(value: string): string {
  if (value.startsWith('<') && value.endsWith('>')) {
    const hex = value.slice(1, -1).replace(/\s/g, '')
    try { return Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex').toString('utf16le').replace(/\u0000/g, '') } catch { return '' }
  }
  return value.slice(1, -1)
    .replace(/\\([\\()nrtbf])/g, (_match, escaped: string) => ({ '\\': '\\', '(': '(', ')': ')', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[escaped] || escaped))
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)))
}

function extractPdfOperators(text: string): string[] {
  const chunks: Array<{ index: number; text: string }> = []
  const tj = /((?:\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]+>))\s*Tj/g
  let match: RegExpExecArray | null
  while ((match = tj.exec(text))) chunks.push({ index: match.index, text: decodePdfLiteral(match[1]) })
  const tjArray = /\[((?:\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]+>|[^\]])*)\]\s*TJ/g
  while ((match = tjArray.exec(text))) {
    const pieces = [...match[1].matchAll(/\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]+>/g)].map((part) => decodePdfLiteral(part[0]))
    chunks.push({ index: match.index, text: pieces.join('') })
  }
  return chunks.sort((a, b) => a.index - b.index).map((chunk) => chunk.text)
}

/** Basic PDF text extraction for unencrypted PDFs, including common Flate streams. */
export function extractPdfTextFromBuffer(input: Uint8Array, maxChars = MAX_DATA_RESULT_CHARS): string {
  if (input.byteLength > MAX_DATA_FILE_BYTES) throw new Error(`PDF file is limited to ${MAX_DATA_FILE_BYTES} bytes.`)
  const source = Buffer.from(input)
  const candidates = [source.toString('latin1')]
  const sourceText = candidates[0]
  // Locate streams by byte offsets rather than a regex over compressed bytes;
  // compressed data may contain the same delimiters as PDF syntax.
  let streamIndex = 0
  while ((streamIndex = sourceText.indexOf('stream', streamIndex)) >= 0) {
    const dataStart = streamIndex + 'stream'.length + (sourceText[streamIndex + 6] === '\r' && sourceText[streamIndex + 7] === '\n' ? 2 : sourceText[streamIndex + 6] === '\n' ? 1 : 0)
    const endIndex = sourceText.indexOf('endstream', dataStart)
    if (endIndex < 0) break
    const dictionary = sourceText.slice(Math.max(0, sourceText.lastIndexOf('<<', streamIndex - 1)), streamIndex)
    streamIndex = endIndex + 'endstream'.length
    if (!/\/FlateDecode/.test(dictionary)) continue
    try {
      let bytes = Buffer.from(sourceText.slice(dataStart, endIndex), 'latin1')
      while (bytes.length > 0 && (bytes[bytes.length - 1] === 10 || bytes[bytes.length - 1] === 13)) bytes = bytes.subarray(0, -1)
      for (const decoder of [zlib.inflateSync, zlib.inflateRawSync]) {
        try { candidates.push(decoder(bytes).toString('latin1')); break } catch { /* try the other PDF stream form */ }
      }
    } catch { /* malformed streams are skipped; other pages may still be readable */ }
  }
  const pieces = candidates.flatMap(extractPdfOperators)
  const result = pieces.join('').replace(/[ \t]+/g, ' ').replace(/\r?\n\s*/g, '\n').trim()
  return result.slice(0, maxChars)
}

export async function extractPdfTextFile(filePath: string, maxChars = MAX_DATA_RESULT_CHARS): Promise<string> {
  const stat = await fs.promises.stat(filePath)
  if (stat.size > MAX_DATA_FILE_BYTES) throw new Error(`PDF file is limited to ${MAX_DATA_FILE_BYTES} bytes.`)
  return extractPdfTextFromBuffer(await fs.promises.readFile(filePath), maxChars)
}

export async function runOfflineOcr(filePath: string, language = 'eng', languagePath = ''): Promise<string> {
  if (!/^[a-z0-9_+-]+$/i.test(language)) throw new Error('OCR language must contain only letters, numbers, underscores, plus, or hyphens.')
  if (!languagePath) throw new Error('OCR language data path is unavailable. The bundled English asset may be missing; custom languages require language_path.')
  for (const code of language.split('+')) {
    const trainedData = path.join(languagePath, `${code}.traineddata`)
    try {
      const dataStat = await fs.promises.stat(trainedData)
      if (!dataStat.isFile()) throw new Error('not a file')
    } catch {
      throw new Error(`OCR language data unavailable: ${trainedData}. Downloads are disabled for offline OCR.`)
    }
  }
  const tesseract = await loadOptionalModule('tesseract.js')
  const createWorker = tesseract?.createWorker || tesseract?.default?.createWorker
  if (typeof createWorker !== 'function') {
    throw new Error('OCR unavailable: the optional "tesseract.js" package is not installed.')
  }
  // cacheMethod=none and a local langPath prevent tesseract.js from fetching or
  // persisting trained data. English ships with the app; other languages remain
  // explicit local workspace assets.
  const worker = await createWorker(language, undefined, {
    langPath: path.resolve(languagePath),
    cacheMethod: 'none',
    gzip: false,
  })
  try {
    const result = await worker.recognize(filePath)
    return String(result?.data?.text || '').slice(0, MAX_DATA_RESULT_CHARS)
  } finally {
    if (typeof worker.terminate === 'function') await worker.terminate()
  }
}

function rowsFromResult(result: any): DataRows {
  if (Array.isArray(result)) return boundedRows(result)
  return boundedRows(result?.rows || [])
}

export async function querySqlite(databasePath: string, sql: string, params: unknown): Promise<DataRows> {
  const valid = validateSql(sql)
  if (!valid.ok) throw new Error(valid.error)
  const normalized = normalizeSqlParams(params)
  if ('error' in normalized) throw new Error(normalized.error)

  const sqlite = await loadOptionalModule('node:sqlite')
  const betterSqlite = sqlite ? null : await loadOptionalModule('better-sqlite3')
  const DatabaseSync = sqlite?.DatabaseSync
  if (DatabaseSync) {
    const db = new DatabaseSync(databasePath, { readOnly: true, timeout: 15_000 })
    try {
      const statement = db.prepare(sql)
      return rowsFromResult(statement.all(...normalized))
    } finally { db.close() }
  }
  const BetterDatabase = betterSqlite?.default || betterSqlite
  if (typeof BetterDatabase === 'function') {
    const db = new BetterDatabase(databasePath, { readonly: true, fileMustExist: true, timeout: 15_000 })
    try {
      const statement = db.prepare(sql)
      return rowsFromResult(statement.all(...normalized))
    } finally { db.close() }
  }
  throw new Error('SQLite unavailable: install an optional SQLite driver (node:sqlite or better-sqlite3) to use this tool.')
}

export async function queryPostgres(connectionString: string, sql: string, params: unknown): Promise<DataRows> {
  const valid = validateSql(sql)
  if (!valid.ok) throw new Error(valid.error)
  if (!connectionString || typeof connectionString !== 'string') throw new Error('Postgres requires a connection_string.')
  const normalized = normalizeSqlParams(params)
  if ('error' in normalized) throw new Error(normalized.error)
  const pg = await loadOptionalModule('pg')
  const Client = pg?.Client || pg?.default?.Client
  if (typeof Client !== 'function') throw new Error('Postgres unavailable: the optional "pg" package is not installed.')

  const client = new Client({ connectionString, statement_timeout: 15_000 })
  let transactionStarted = false
  try {
    await client.connect()
    await client.query('BEGIN READ ONLY')
    transactionStarted = true
    const result = await client.query({ text: sql, values: normalized })
    await client.query('ROLLBACK')
    transactionStarted = false
    return rowsFromResult(result?.rows || [{ rowCount: result?.rowCount ?? 0 }])
  } catch (error) {
    if (transactionStarted) { try { await client.query('ROLLBACK') } catch { /* preserve query error */ } }
    throw error
  } finally {
    await client.end().catch(() => {})
  }
}

export function formatDataRows(rows: DataRows, maxChars = MAX_DATA_RESULT_CHARS): string {
  const json = JSON.stringify(rows)
  return json.length > maxChars ? `${json.slice(0, maxChars)}\n[... result truncated]` : json
}

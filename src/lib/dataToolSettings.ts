/** Shared opt-ins. Missing or non-boolean values never enable a capability. */
export const DATA_TOOL_SETTINGS = [
  { key: 'sqliteToolEnabled', label: 'SQLite read-only queries', detail: 'Read workspace databases using the bundled Node SQLite runtime. Database writes are unsupported.' },
  { key: 'postgresToolEnabled', label: 'Postgres read-only queries', detail: 'Requires the optional pg driver. Uses read-only transactions; no passwords or connection URLs accepted in tool arguments.' },
  { key: 'spreadsheetToolEnabled', label: 'CSV / Excel tools', detail: 'CSV is built in. Excel requires an installed xlsx driver. File contents may be sent to your AI provider.' },
  { key: 'dataWriteEnabled', label: 'Allow spreadsheet writes', detail: 'Separate opt-in for bounded CSV / Excel writes inside the workspace. Existing files require overwrite: true; dangerous-tool approval still applies.' },
  { key: 'pdfToolEnabled', label: 'PDF text extraction', detail: 'Extract bounded text from local PDFs. Scanned pages need OCR; layout is not preserved.' },
  { key: 'ocrToolEnabled', label: 'Offline OCR', detail: 'Uses bundled English data or local, uncompressed workspace language data. No model downloads or cache writes.' },
] as const

export type DataToolFlag = typeof DATA_TOOL_SETTINGS[number]['key']
export type DataToolSettings = Partial<Record<DataToolFlag, boolean>>
export const DATA_TOOL_FLAGS = DATA_TOOL_SETTINGS.map((setting) => setting.key)

export function normalizeDataToolSettings(settings: Record<string, unknown> = {}): Record<DataToolFlag, boolean> {
  return Object.fromEntries(DATA_TOOL_FLAGS.map((key) => [key, settings[key] === true])) as Record<DataToolFlag, boolean>
}

export const DATA_TOOL_FLAGS_BY_NAME: Record<string, DataToolFlag> = {
  sqlite_query: 'sqliteToolEnabled', postgres_query: 'postgresToolEnabled',
  spreadsheet_read: 'spreadsheetToolEnabled', spreadsheet_write: 'spreadsheetToolEnabled',
  pdf_extract_text: 'pdfToolEnabled', ocr_image: 'ocrToolEnabled',
}

export function dataToolDisabledReason(name: string, settings: Record<string, unknown>): string | undefined {
  const flag = DATA_TOOL_FLAGS_BY_NAME[name]
  if (flag && settings[flag] !== true) return `${name} is disabled. Enable it in Settings > Tool permissions.`
  if (name === 'spreadsheet_write' && settings.dataWriteEnabled !== true) {
    return 'Spreadsheet writes are disabled. Enable Allow spreadsheet writes in Settings > Tool permissions.'
  }
}

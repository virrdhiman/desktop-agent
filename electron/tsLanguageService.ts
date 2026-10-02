import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import type * as tsTypes from 'typescript'

const require = createRequire(import.meta.url)
const ts = require('typescript') as typeof tsTypes

export type LspLocation = { path: string; line: number; column: number; preview: string }
export type LspDiagnostic = LspLocation & { message: string; severity: 'error' | 'warning' | 'info' }
export type LspRenameResult = { replacements: number; updatedFiles: string[]; errors: { path: string; error: string }[] }

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'])
const SKIP = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release', 'coverage', 'build', '.vite'])

function isTsFile(file: string) {
  return EXTS.has(path.extname(file).toLowerCase())
}

function safe(root: string, file: string) {
  const rel = path.relative(path.resolve(root), path.resolve(file))
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

async function walk(root: string) {
  const out: string[] = []
  async function visit(dir: string, depth: number) {
    if (depth > 10 || out.length > 2500) return
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIP.has(entry.name)) await visit(path.join(dir, entry.name), depth + 1)
      } else {
        const file = path.join(dir, entry.name)
        if (isTsFile(file)) out.push(file)
      }
    }
  }
  await visit(path.resolve(root), 0)
  return out
}

async function project(root: string, extraFile: string) {
  const files = new Set(await walk(root))
  files.add(path.resolve(extraFile))
  const versions = new Map<string, string>()
  const compilerOptions: tsTypes.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2020,
    strict: false,
    skipLibCheck: true,
    noEmit: true,
  }
  const config = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')
  if (config) {
    const read = ts.readConfigFile(config, ts.sys.readFile)
    if (!read.error) {
      const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config))
      Object.assign(compilerOptions, parsed.options)
      for (const file of parsed.fileNames.filter(isTsFile)) files.add(path.resolve(file))
    }
  }
  const host: tsTypes.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => [...files],
    getScriptVersion: (file) => versions.get(path.resolve(file)) || '1',
    getScriptSnapshot: (file) => {
      const text = ts.sys.readFile(file)
      return text == null ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getCurrentDirectory: () => path.resolve(root),
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  }
  return ts.createLanguageService(host, ts.createDocumentRegistry())
}

function offset(service: tsTypes.LanguageService, file: string, line: number, column: number) {
  const program = service.getProgram()
  const source = program?.getSourceFile(file)
  if (!source) return 0
  return ts.getPositionOfLineAndCharacter(source, Math.max(0, line - 1), Math.max(0, column - 1))
}

function loc(service: tsTypes.LanguageService, file: string, start: number): LspLocation {
  const program = service.getProgram()
  const source = program?.getSourceFile(file)
  const text = source?.getFullText() || fs.readFileSync(file, 'utf8')
  const pos = source ? ts.getLineAndCharacterOfPosition(source, start) : { line: 0, character: 0 }
  const preview = text.split(/\r?\n/)[pos.line]?.trim() || ''
  return { path: path.resolve(file), line: pos.line + 1, column: pos.character + 1, preview }
}

export async function tsDiagnostics(root: string, file: string): Promise<LspDiagnostic[] | { error: string }> {
  if (!safe(root, file) || !isTsFile(file)) return []
  const service = await project(root, file)
  return service.getSemanticDiagnostics(file).concat(service.getSyntacticDiagnostics(file)).slice(0, 80).map((diag) => ({
    ...loc(service, file, diag.start || 0),
    message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
    severity: diag.category === ts.DiagnosticCategory.Error ? 'error' : diag.category === ts.DiagnosticCategory.Warning ? 'warning' : 'info',
  }))
}

export async function tsDefinition(root: string, file: string, line: number, column: number): Promise<LspLocation | null | { error: string }> {
  if (!safe(root, file) || !isTsFile(file)) return null
  const service = await project(root, file)
  const def = service.getDefinitionAtPosition(file, offset(service, file, line, column))?.[0]
  return def ? loc(service, def.fileName, def.textSpan.start) : null
}

export async function tsReferences(root: string, file: string, line: number, column: number): Promise<LspLocation[] | { error: string }> {
  if (!safe(root, file) || !isTsFile(file)) return []
  const service = await project(root, file)
  const refs = service.getReferencesAtPosition(file, offset(service, file, line, column)) || []
  return refs.slice(0, 250).map((ref) => loc(service, ref.fileName, ref.textSpan.start))
}

export async function tsRename(root: string, file: string, line: number, column: number, newName: string): Promise<LspRenameResult | { error: string }> {
  if (!safe(root, file) || !isTsFile(file)) return { error: 'TypeScript rename supports only TS/JS files' }
  if (!/^[A-Za-z_$][\w$]*$/.test(newName)) return { error: 'Invalid identifier' }
  const service = await project(root, file)
  const pos = offset(service, file, line, column)
  const info = service.getRenameInfo(file, pos)
  if (!info.canRename) return { error: info.localizedErrorMessage || 'Symbol cannot be renamed' }
  const locations = service.findRenameLocations(file, pos, false, false) || []
  const byFile = new Map<string, tsTypes.RenameLocation[]>()
  for (const item of locations) {
    if (!safe(root, item.fileName)) continue
    byFile.set(item.fileName, [...(byFile.get(item.fileName) || []), item])
  }
  const updatedFiles: string[] = []
  const errors: LspRenameResult['errors'] = []
  let replacements = 0
  for (const [target, edits] of byFile) {
    try {
      let text = await fs.promises.readFile(target, 'utf8')
      for (const edit of edits.sort((a, b) => b.textSpan.start - a.textSpan.start)) {
        text = `${text.slice(0, edit.textSpan.start)}${newName}${text.slice(edit.textSpan.start + edit.textSpan.length)}`
        replacements++
      }
      await fs.promises.writeFile(target, text, 'utf8')
      updatedFiles.push(path.resolve(target))
    } catch (err: any) {
      errors.push({ path: target, error: err?.message || String(err) })
    }
  }
  return { replacements, updatedFiles, errors }
}

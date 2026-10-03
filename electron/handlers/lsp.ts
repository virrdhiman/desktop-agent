import { ipcMain } from 'electron'
import { externalDefinition, externalDiagnostics, externalReferences, externalRename, supportsExternalLsp } from '../externalLanguageService'
import { isTsFile, tsDefinition, tsDiagnostics, tsReferences, tsRename } from '../tsLanguageService'

export function registerLspHandlers() {
  ipcMain.handle('lsp:diagnostics', async (_event, root: string, file: string) => {
    try {
      if (isTsFile(file)) return await tsDiagnostics(root, file)
      if (supportsExternalLsp(file)) return await externalDiagnostics(root, file)
      return []
    } catch (err: any) { return { error: err?.message || String(err) } }
  })
  ipcMain.handle('lsp:definition', async (_event, root: string, file: string, line: number, column: number) => {
    try {
      if (isTsFile(file)) return await tsDefinition(root, file, line, column)
      if (supportsExternalLsp(file)) return await externalDefinition(root, file, line, column)
      return null
    } catch (err: any) { return { error: err?.message || String(err) } }
  })
  ipcMain.handle('lsp:references', async (_event, root: string, file: string, line: number, column: number) => {
    try {
      if (isTsFile(file)) return await tsReferences(root, file, line, column)
      if (supportsExternalLsp(file)) return await externalReferences(root, file, line, column)
      return []
    } catch (err: any) { return { error: err?.message || String(err) } }
  })
  ipcMain.handle('lsp:rename', async (_event, root: string, file: string, line: number, column: number, newName: string) => {
    try {
      if (isTsFile(file)) return await tsRename(root, file, line, column, newName)
      if (supportsExternalLsp(file)) return await externalRename(root, file, line, column, newName)
      return { error: 'No language server is configured for this file type' }
    } catch (err: any) { return { error: err?.message || String(err) } }
  })
}

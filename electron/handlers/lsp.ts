import { ipcMain } from 'electron'
import { tsDefinition, tsDiagnostics, tsReferences, tsRename } from '../tsLanguageService'

export function registerLspHandlers() {
  ipcMain.handle('lsp:diagnostics', async (_event, root: string, file: string) => {
    try { return await tsDiagnostics(root, file) } catch (err: any) { return { error: err?.message || String(err) } }
  })
  ipcMain.handle('lsp:definition', async (_event, root: string, file: string, line: number, column: number) => {
    try { return await tsDefinition(root, file, line, column) } catch (err: any) { return { error: err?.message || String(err) } }
  })
  ipcMain.handle('lsp:references', async (_event, root: string, file: string, line: number, column: number) => {
    try { return await tsReferences(root, file, line, column) } catch (err: any) { return { error: err?.message || String(err) } }
  })
  ipcMain.handle('lsp:rename', async (_event, root: string, file: string, line: number, column: number, newName: string) => {
    try { return await tsRename(root, file, line, column, newName) } catch (err: any) { return { error: err?.message || String(err) } }
  })
}

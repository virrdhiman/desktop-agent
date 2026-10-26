/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Tool Execution IPC Handler
 * Agent tools: file ops, git ops, code search, web search, Web3, image/video, speech
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { simpleGit, SimpleGit } from 'simple-git'
import { loadRuntimeSettings } from './settings'
import { confirmAgentAction } from '../approvalDialog'
import { geminiGenerateContentRequest } from '../geminiRequest'
import { COMMAND_TIMEOUT_MS, formatCommandResult, resolveToolArgs } from '../toolSupport'
import { assessToolPolicy, checkpointTargets, resolvesInsideWorkspace, toolApprovalDetail, type PermissionMode } from '../toolPolicy'
import { createCheckpoint, finalizeCheckpoint, listCheckpoints, type WorkspaceCheckpoint } from '../checkpointStore'
import { archiveOutputPaths, extractZipArchive, inspectZipArchive, type ArchiveInspection } from '../archiveStore'
import { buildRepoIndex, buildRepoMap, findRepoUsages, goToRepoDefinition, onRepoIndexStatus, repoIndexStats, searchCode, searchRepo, startRepoIndexWatcher } from '../repoIndex'
import { planRepoChange } from '../repoPlanner'
import { previewEdits } from '../patchPreview'
import { formatVsCodeContext, installVsCodeBridge, openWorkspaceInVsCode, readVsCodeBridgeStatus, sendVsCodeBridgeCommand } from '../vscodeBridge'
import { executeApiRequest } from '../apiTesting'
import { closeBrowserSessions, executeBrowserTool } from '../browserTool'
import { validateBrowserRequest } from '../browserToolValidation'
import {
  extractPdfTextFile, formatDataRows, readCsvFile, readExcelFile, runOfflineOcr,
  validateWorkspaceDataPath, writeCsvFile, writeExcelFile, querySqlite, queryPostgres,
  MAX_DATA_FILE_BYTES, MAX_DATA_RESULT_CHARS,
} from '../dataTools'
import { dataToolDisabledReason } from '../../src/lib/dataToolSettings'

/** Git instances cache for tool execution */
const toolGitInstances: Map<string, SimpleGit> = new Map()
function getToolGit(dirPath: string): SimpleGit {
  if (!toolGitInstances.has(dirPath)) {
    toolGitInstances.set(dirPath, simpleGit(dirPath))
  }
  return toolGitInstances.get(dirPath)!
}

/** Decrypted settings for speech/image tools. The renderer never receives these keys. */
async function loadToolSettings(): Promise<any> {
  return loadRuntimeSettings()
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const candidate = Number(value)
  return Number.isFinite(candidate) ? Math.max(min, Math.min(max, Math.floor(candidate))) : fallback
}

async function validateDataTarget(workspace: string | undefined, target: unknown, write = false): Promise<string | null> {
  const candidate = typeof target === 'string' ? target : ''
  const validation = validateWorkspaceDataPath(workspace, candidate)
  if (!validation.ok) return validation.error
  if (!workspace || !await resolvesInsideWorkspace(workspace, candidate)) {
    return `Blocked data tool: the real path must stay inside the open workspace: ${candidate}`
  }
  if (write) {
    const parent = path.dirname(candidate)
    if (!await resolvesInsideWorkspace(workspace, parent)) return `Blocked data tool: destination parent escapes the workspace: ${parent}`
  }
  return null
}

function dataToolError(name: string, settings: any): string | null {
  return dataToolDisabledReason(name, settings) || null
}

async function indexRoot(tool: { workspace?: string; args: Record<string, any> }): Promise<string | { error: string }> {
  const root = tool.args.path || tool.workspace || '.'
  if (tool.workspace && !await resolvesInsideWorkspace(tool.workspace, root)) {
    return { error: `Blocked index query: the index root must stay inside the open workspace: ${root}` }
  }
  return root
}

function bundledOcrLanguagePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tessdata')
    : path.join(app.getAppPath(), 'assets', 'tessdata')
}

type AgentPreview = { detail: string; editable?: string }

async function buildAgentPreview(tool: { name: string; args: Record<string, any> }): Promise<AgentPreview | undefined> {
  if (tool.name === 'run_command') return { detail: `Exact command:\n${String(tool.args.command || '')}`, editable: String(tool.args.command || '') }
  if (tool.name === 'write_file' || tool.name === 'create_file') {
    let before = ''
    try { before = await fs.promises.readFile(tool.args.path, 'utf-8') } catch {}
    const after = String(tool.args.content || '')
    return { detail: `Exact file preview: ${tool.args.path}\n\n--- before ---\n${before}\n--- after ---\n${after}`, editable: after }
  }
  if (tool.name === 'edit_file') {
    const before = await fs.promises.readFile(tool.args.path, 'utf-8')
    const after = before.replace(String(tool.args.old_string || ''), String(tool.args.new_string || ''))
    return { detail: `Exact file preview: ${tool.args.path}\n\n--- before ---\n${before}\n--- after ---\n${after}`, editable: after }
  }
  if (tool.name === 'multi_file_edit') {
    return { detail: await previewEdits(tool.args.path || '.', tool.args.edits), editable: JSON.stringify(tool.args.edits, null, 2) }
  }
  if (tool.name === 'vscode_apply_edit') {
    const before = await fs.promises.readFile(tool.args.path, 'utf-8')
    const after = before.replace(String(tool.args.old_string || ''), String(tool.args.new_string || ''))
    return { detail: `Exact file preview: ${tool.args.path}\n\n--- before ---\n${before}\n--- after ---\n${after}`, editable: after }
  }
  return undefined
}

export function registerToolHandlers() {
  onRepoIndexStatus((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('repo-index:status', status)
    }
  })

  ipcMain.handle('vscode:status', async (_event, workspace: string) => {
    try {
      return await readVsCodeBridgeStatus(workspace)
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('vscode:installBridge', async () => {
    try {
      return { result: await installVsCodeBridge() }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('vscode:openWorkspace', async (_event, workspace: string) => {
    try {
      return { result: await openWorkspaceInVsCode(workspace) }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle(
    'tool:execute',
    async (event, tool: { name: string; args: Record<string, any>; workspace?: string; sessionId?: string; taskId?: string; workingMode?: 'plan' | 'build' | 'multitask' | 'ask' | 'review' | 'debug' }) => {
      try {
        tool.args = resolveToolArgs(tool.name, tool.args, tool.workspace)
        const policySettings = await loadToolSettings()
        const permissionMode = (policySettings.permissionMode || 'ask-risky') as PermissionMode
        const decision = assessToolPolicy(tool.name, tool.args, tool.workspace, permissionMode, policySettings.restrictedCommandMode === true, policySettings.browserToolEnabled, tool.workingMode)

        // Capability flags are checked before an approval prompt so an opt-out
        // cannot accidentally turn into a confusing approval request.
        const disabledDataTool = dataToolError(tool.name, policySettings)
        if (disabledDataTool) return { error: disabledDataTool }

        // This setting is independent of both Trusted mode and the QA approval override.
        if (decision.browserToolBlocked) {
          closeBrowserSessions()
          return { error: 'The browser tool is disabled. Enable it in Settings > Tool permissions before using browser operations.' }
        }
        if (tool.name === 'browser') {
          const validation = validateBrowserRequest(tool.args)
          if (!validation.ok) return { error: validation.error }
        }

        if (decision.restrictedCommandBlocked) {
          return { error: `Restricted command mode blocked this command: ${decision.restrictedCommandReason}. This is a command policy, not an OS sandbox.` }
        }

        if (decision.workingModeBlocked) return { error: decision.reason }

        if (decision.risk !== 'read' && tool.name !== 'run_command' && !tool.workspace) {
          return { error: `Blocked ${tool.name}: open a workspace before allowing agent mutations.` }
        }
        if (decision.risk !== 'read' && decision.outsideWorkspace.length > 0) {
          return { error: `Blocked ${tool.name}: writes must stay inside the open workspace. Outside path: ${decision.outsideWorkspace[0]}` }
        }
        if (decision.risk !== 'read' && tool.workspace) {
          for (const target of decision.targets) {
            if (!await resolvesInsideWorkspace(tool.workspace, target)) {
              return { error: `Blocked ${tool.name}: the real destination escapes the open workspace through a symlink or junction. Path: ${target}` }
            }
          }
        }

        const preview = decision.previewRequired ? await buildAgentPreview(tool) : undefined
        let approvedContent: string | undefined
        if (decision.needsApproval && process.env.VD_AGENT_AUTO_APPROVE_TOOLS !== '1') {
          const owner = BrowserWindow.fromWebContents(event.sender)
          let detail = preview?.detail || toolApprovalDetail(tool.name, tool.args, decision)
          let editable = preview?.editable
          while (true) {
            const approval = await confirmAgentAction(owner, `Review VD Agent ${tool.name}`, detail, editable)
            if (approval.action === 'reject') return { error: `User declined ${tool.name}` }
            if (approval.action === 'approve') break
            if (approval.payload === undefined) return { error: `User declined ${tool.name}` }
            if (tool.name === 'run_command') {
              tool.args.command = approval.payload
              const commandCheck = assessToolPolicy(tool.name, tool.args, tool.workspace, permissionMode, policySettings.restrictedCommandMode === true, policySettings.browserToolEnabled)
              if (commandCheck.restrictedCommandBlocked) return { error: `Restricted command mode blocked this edited command: ${commandCheck.restrictedCommandReason}` }
              detail = `Exact command:\n${approval.payload}`
              editable = approval.payload
            } else if (tool.name === 'write_file' || tool.name === 'create_file' || tool.name === 'edit_file') {
              approvedContent = approval.payload
              detail = `${preview?.detail || ''}\n\n--- edited proposal ---\n${approval.payload}`
              editable = approval.payload
            } else if (tool.name === 'multi_file_edit') {
              try {
                const edits = JSON.parse(approval.payload)
                if (!Array.isArray(edits) || edits.some((edit) => !edit || typeof edit.path !== 'string' || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string')) throw new Error('expected an array of file edits')
                tool.args.edits = edits
                detail = await previewEdits(tool.args.path || '.', edits)
                editable = JSON.stringify(edits, null, 2)
              } catch (error: any) {
                return { error: `Edited file proposal is invalid: ${error?.message || String(error)}` }
              }
            } else if (tool.name === 'vscode_apply_edit') {
              approvedContent = approval.payload
              detail = `${preview?.detail || ''}\n\n--- edited proposal ---\n${approval.payload}`
              editable = approval.payload
            } else {
              return { error: `Editing is not supported for ${tool.name}` }
            }
          }
        }

        let archiveInspection: ArchiveInspection | undefined
        let targets = checkpointTargets(tool.name, tool.args)
        if (tool.name === 'archive_extract') {
          if (!tool.args.archive_path || !tool.args.output_path) {
            return { error: 'archive_extract requires archive_path and output_path' }
          }
          archiveInspection = await inspectZipArchive(tool.args.archive_path)
          targets = archiveOutputPaths(tool.args.output_path, archiveInspection)
        }
        let checkpoint: WorkspaceCheckpoint | undefined
        if (tool.workspace && tool.sessionId && targets.length > 0 && (await listCheckpoints(path.join(app.getPath('userData'), 'checkpoints'), tool.sessionId)).length === 0) {
          const created = await createCheckpoint(path.join(app.getPath('userData'), 'checkpoints'), {
            sessionId: tool.sessionId,
            workspace: tool.workspace,
            label: `${tool.name}${tool.taskId ? ` for task ${tool.taskId}` : ''}`,
            paths: targets,
          })
          if (created) {
            checkpoint = created
            event.sender.send('checkpoint:created', {
              id: checkpoint.id,
              sessionId: checkpoint.sessionId,
              createdAt: checkpoint.createdAt,
              label: checkpoint.label,
              files: checkpoint.files.map((file) => file.relativePath),
            })
          }
        }
        switch (tool.name) {
          // ═══ FILE SYSTEM ═══════════════════════════════════════════════════
          case 'read_file': {
            const content = await fs.promises.readFile(tool.args.path, 'utf-8')
            return { result: content }
          }
          case 'write_file': {
            await fs.promises.writeFile(tool.args.path, approvedContent ?? tool.args.content, 'utf-8')
            if (checkpoint) await finalizeCheckpoint(path.join(app.getPath('userData'), 'checkpoints'), checkpoint)
            return { result: `File written: ${tool.args.path}` }
          }
          case 'edit_file': {
            const content = await fs.promises.readFile(tool.args.path, 'utf-8')
            if (!content.includes(tool.args.old_string)) {
              return { error: `old_string not found in ${tool.args.path}` }
            }
            const newContent = approvedContent ?? content.replace(tool.args.old_string, tool.args.new_string)
            await fs.promises.writeFile(tool.args.path, newContent, 'utf-8')
            if (checkpoint) await finalizeCheckpoint(path.join(app.getPath('userData'), 'checkpoints'), checkpoint)
            return { result: `Edited ${tool.args.path}: replaced ${tool.args.old_string.length} chars` }
          }
          case 'create_file': {
            await fs.promises.writeFile(tool.args.path, approvedContent ?? (tool.args.content || ''), 'utf-8')
            if (checkpoint) await finalizeCheckpoint(path.join(app.getPath('userData'), 'checkpoints'), checkpoint)
            return { result: `Created: ${tool.args.path}` }
          }
          case 'delete_file': {
            await fs.promises.unlink(tool.args.path)
            if (checkpoint) await finalizeCheckpoint(path.join(app.getPath('userData'), 'checkpoints'), checkpoint)
            return { result: `Deleted: ${tool.args.path}` }
          }
          case 'list_files': {
            const dirPath = tool.args.path || '.'
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
            const listing = entries
              .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
              .map((e) => `${e.isDirectory() ? '[DIR]' : '     '} ${e.name}`)
              .join('\n')
            return { result: listing || 'Directory is empty' }
          }
          case 'search_files': {
            const pattern = tool.args.pattern
            const searchRoot = tool.args.path || '.'
            const results: string[] = []
            async function doSearch(dir: string, depth: number) {
              if (depth > 5) return
              const entries = await fs.promises.readdir(dir, { withFileTypes: true })
              for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
                const fullPath = path.join(dir, entry.name)
                if (entry.isDirectory()) await doSearch(fullPath, depth + 1)
                else if (entry.name.includes(pattern) || fullPath.includes(pattern)) results.push(fullPath)
              }
            }
            await doSearch(searchRoot, 0)
            return { result: results.length ? results.join('\n') : 'No matches found' }
          }
          case 'search_code': {
            const searchPattern = tool.args.pattern
            const root = await indexRoot(tool)
            if (typeof root !== 'string') return root
            const hits = await searchCode(root, String(searchPattern || ''), Number(tool.args.limit || 100))
            return { result: hits.length ? hits.map((hit) => `${path.join(root, hit.path)}:${hit.line}:${hit.column}: ${hit.snippet}`).join('\n') : 'No matches found' }
          }
          case 'repo_map': {
            const rootValue = await indexRoot(tool)
            if (typeof rootValue !== 'string') return rootValue
            const root = rootValue
            const entries = await buildRepoMap(root, Number(tool.args.limit || 160))
            const lines = entries.map((entry) => {
              const symbols = entry.symbols.length ? ` — ${entry.symbols.join(', ')}` : ''
              const imports = entry.imports.length ? ` imports=${entry.imports.slice(0, 4).join(', ')}` : ''
              const kind = entry.testLike ? ' test' : ''
              return `${entry.path} (${entry.language}${kind}, ${entry.bytes} bytes)${symbols}${imports}`
            })
            return { result: lines.length ? `Repo map (${lines.length} files):\n${lines.join('\n')}` : 'No indexable text files found.' }
          }
          case 'repo_index': {
            const rootValue = await indexRoot(tool)
            if (typeof rootValue !== 'string') return rootValue
            const root = rootValue
            const stats = tool.args.once
              ? tool.args.force ? await buildRepoIndex(root, true) : await repoIndexStats(root)
              : tool.args.force ? await buildRepoIndex(root, true) : await startRepoIndexWatcher(root)
            return {
              result: [
                `Repo index ${stats.cached ? 'reused' : 'built'}: ${stats.files} files, ${stats.bytes} bytes.`,
                `Background watcher: ${stats.watching ? 'on' : 'off'}`,
                `Updated: ${new Date(stats.updatedAt).toISOString()}`,
                `Duration: ${stats.durationMs ?? 0} ms (reused ${stats.reusedFiles ?? 0}, updated ${stats.updatedFiles ?? 0})`,
                `Fingerprint: ${stats.fingerprint.slice(0, 12)}`,
                `Root: ${stats.root}`,
              ].join('\n'),
            }
          }
          case 'repo_plan': {
            const rootValue = await indexRoot(tool)
            if (typeof rootValue !== 'string') return rootValue
            const root = rootValue
            const query = String(tool.args.query || '').trim()
            if (!query) return { error: 'repo_plan requires query' }
            return { result: await planRepoChange(root, query, Number(tool.args.limit || 12)) }
          }
          case 'repo_search': {
            const rootValue = await indexRoot(tool)
            if (typeof rootValue !== 'string') return rootValue
            const root = rootValue
            const query = String(tool.args.query || '').trim()
            if (!query) return { error: 'repo_search requires query' }
            const hits = await searchRepo(root, query, Number(tool.args.limit || 30))
            const lines = hits.map((hit, index) => [
              `${index + 1}. ${hit.path}:${hit.line} score=${hit.score} reason=${hit.reason}`,
              hit.snippet,
            ].join('\n'))
            return { result: lines.length ? `Repo search for "${query}" (${lines.length} hits):\n\n${lines.join('\n\n')}` : 'No matches found.' }
          }
          case 'go_to_definition': {
            const rootValue = await indexRoot(tool)
            if (typeof rootValue !== 'string') return rootValue
            const result = await goToRepoDefinition(rootValue, tool.args.path, Number(tool.args.line || 1), Number(tool.args.column || 1), tool.args.symbol)
            return { result: result ? `${result.symbol}: ${path.join(rootValue, result.path)}:${result.line}` : 'No definition found.' }
          }
          case 'find_usages': {
            const rootValue = await indexRoot(tool)
            if (typeof rootValue !== 'string') return rootValue
            const usages = await findRepoUsages(rootValue, tool.args.path, Number(tool.args.line || 1), Number(tool.args.column || 1), tool.args.symbol, Number(tool.args.limit || 250))
            return { result: usages.length ? usages.map((usage) => `${path.join(rootValue, usage.path)}:${usage.line}: ${usage.symbol} (definition: ${usage.definition})`).join('\n') : 'No usages found.' }
          }
          case 'vscode_context': {
            const root = tool.args.path || tool.workspace || '.'
            return { result: await formatVsCodeContext(root) }
          }
          case 'vscode_open': {
            const root = tool.workspace || path.dirname(tool.args.path || process.cwd())
            const result = await sendVsCodeBridgeCommand(root, {
              action: 'open_file',
              args: { path: tool.args.path, line: tool.args.line, column: tool.args.column },
            })
            return { result }
          }
          case 'vscode_apply_edit': {
            const root = tool.workspace || path.dirname(tool.args.path || process.cwd())
            if (approvedContent !== undefined) tool.args.new_string = approvedContent
            const result = await sendVsCodeBridgeCommand(root, {
              action: 'apply_edit',
              args: { path: tool.args.path, old_string: tool.args.old_string, new_string: tool.args.new_string },
            })
            if (checkpoint) await finalizeCheckpoint(path.join(app.getPath('userData'), 'checkpoints'), checkpoint)
            return { result }
          }
          case 'vscode_show_diff': {
            const root = tool.workspace || path.dirname(tool.args.path || process.cwd())
            const result = await sendVsCodeBridgeCommand(root, {
              action: 'show_diff',
              args: {
                path: tool.args.path,
                old_string: tool.args.old_string,
                new_string: tool.args.new_string,
                content: tool.args.content,
                title: tool.args.title,
              },
            })
            return { result }
          }
          case 'vscode_command': {
            const root = tool.workspace || tool.args.path || process.cwd()
            const result = await sendVsCodeBridgeCommand(root, {
              action: 'run_command',
              args: { command: tool.args.command, args: tool.args.args },
            })
            return { result }
          }
          case 'run_command': {
            const { exec } = await import('child_process')
            return new Promise((resolve) => {
              exec(tool.args.command, { cwd: tool.args.cwd || process.cwd(), timeout: COMMAND_TIMEOUT_MS }, (error, stdout, stderr) => {
                resolve(formatCommandResult(tool.args.command, error, String(stdout), String(stderr)))
              })
            })
          }
          case 'api_request': {
            return { result: await executeApiRequest(tool.args as any) }
          }
          case 'browser': {
            // Settings can change while the approval dialog is open.
            if ((await loadToolSettings()).browserToolEnabled !== true) {
              closeBrowserSessions()
              return { error: 'The browser tool was disabled before the operation started.' }
            }
            return { result: await executeBrowserTool(tool.args, tool.workspace, tool.sessionId) }
          }

          // ═══ OPTIONAL LOCAL DATA ════════════════════════════════════════════
          // Every data tool is independently disabled by default. Database reads
          // stay in a read-only transaction and file data never leaves this
          // handler except as the bounded result returned to the model.
          case 'sqlite_query': {
            const disabled = dataToolError(tool.name, policySettings)
            if (disabled) return { error: disabled }
            const targetError = await validateDataTarget(tool.workspace, tool.args.path)
            if (targetError) return { error: targetError }
            const maxRows = boundedNumber(tool.args.maxRows, 100, 1, 500)
            try {
              const rows = await querySqlite(tool.args.path, String(tool.args.query || ''), tool.args.params)
              return { result: formatDataRows(rows.slice(0, maxRows)) }
            } catch (error: any) {
              return { error: error?.message || String(error) }
            }
          }
          case 'postgres_query': {
            const disabled = dataToolError(tool.name, policySettings)
            if (disabled) return { error: disabled }
            if (!tool.workspace) return { error: 'An open workspace is required for Postgres tools.' }
            const host = String(tool.args.host || '').trim()
            const database = String(tool.args.database || '').trim()
            const user = String(tool.args.user || '').trim()
            const port = boundedNumber(tool.args.port, 5432, 1, 65535)
            if (!host || !database || !user) return { error: 'Postgres requires host, database, and user. Passwords and connection strings are not accepted.' }
            if (tool.args.password || tool.args.connection_string || tool.args.connectionString) {
              return { error: 'Postgres passwords and connection strings are not accepted. Use a restricted passwordless role or local authentication.' }
            }
            if (!/^(?:localhost|127\.0\.0\.1|::1|[a-z0-9.-]+)$/i.test(host)) return { error: 'Postgres host must be a hostname or IP address.' }
            const localHost = /^(?:localhost|127\.0\.0\.1|::1)$/i.test(host)
            const connection = `postgresql://${encodeURIComponent(user)}@${host}:${port}/${encodeURIComponent(database)}${localHost ? '' : '?sslmode=require'}`
            const maxRows = boundedNumber(tool.args.maxRows, 100, 1, 500)
            try {
              const rows = await queryPostgres(connection, String(tool.args.query || ''), tool.args.params)
              return { result: formatDataRows(rows.slice(0, maxRows)) }
            } catch (error: any) {
              return { error: error?.message || String(error) }
            }
          }
          case 'spreadsheet_read': {
            const disabled = dataToolError(tool.name, policySettings)
            if (disabled) return { error: disabled }
            const targetError = await validateDataTarget(tool.workspace, tool.args.path)
            if (targetError) return { error: targetError }
            const extension = path.extname(tool.args.path).toLowerCase()
            const startRow = boundedNumber(tool.args.startRow, 1, 1, 10_000) - 1
            const maxRows = boundedNumber(tool.args.maxRows, 100, 1, 500)
            try {
              const rows = extension === '.csv'
                ? await readCsvFile(tool.args.path, Math.min(10_000, startRow + maxRows), tool.args.delimiter || ',')
                : ['.xlsx', '.xlsm', '.xls'].includes(extension)
                  ? await readExcelFile(tool.args.path, tool.args.sheet, Math.min(10_000, startRow + maxRows))
                  : (() => { throw new Error('Spreadsheet format unavailable. Use .csv or .xlsx.') })()
              return { result: formatDataRows(rows.slice(startRow, startRow + maxRows)) }
            } catch (error: any) {
              return { error: error?.message || String(error) }
            }
          }
          case 'spreadsheet_write': {
            const disabled = dataToolError(tool.name, policySettings)
            if (disabled) return { error: disabled }
            if (policySettings.dataWriteEnabled !== true) return { error: 'Spreadsheet writes are disabled. Enable Allow spreadsheet writes in Settings > Tool permissions.' }
            const targetError = await validateDataTarget(tool.workspace, tool.args.path, true)
            if (targetError) return { error: targetError }
            const extension = path.extname(tool.args.path).toLowerCase()
            if (!Array.isArray(tool.args.rows)) return { error: 'spreadsheet_write requires rows as an array of scalar-cell arrays.' }
            if (fs.existsSync(tool.args.path) && tool.args.overwrite !== true) return { error: 'Refusing to overwrite an existing spreadsheet without overwrite: true.' }
            try {
              const bytes = extension === '.csv'
                ? await writeCsvFile(tool.args.path, tool.args.rows, tool.args.delimiter || ',')
                : ['.xlsx', '.xlsm'].includes(extension)
                  ? await writeExcelFile(tool.args.path, tool.args.rows, tool.args.sheet || 'Sheet1')
                  : (() => { throw new Error('Spreadsheet format unavailable. Use .csv or .xlsx.') })()
              return { result: `Wrote ${bytes} bytes to ${tool.args.path}.` }
            } catch (error: any) {
              return { error: error?.message || String(error) }
            }
          }
          case 'pdf_extract_text': {
            const disabled = dataToolError(tool.name, policySettings)
            if (disabled) return { error: disabled }
            const targetError = await validateDataTarget(tool.workspace, tool.args.path)
            if (targetError) return { error: targetError }
            if (path.extname(tool.args.path).toLowerCase() !== '.pdf') return { error: 'pdf_extract_text requires a .pdf file.' }
            try {
              const maxChars = boundedNumber(tool.args.maxChars, MAX_DATA_RESULT_CHARS, 1, MAX_DATA_RESULT_CHARS)
              const text = await extractPdfTextFile(tool.args.path, maxChars)
              return { result: text || '(No extractable text found. The PDF may be scanned, encrypted, or use unsupported text encoding.)' }
            } catch (error: any) {
              return { error: error?.message || String(error) }
            }
          }
          case 'ocr_image': {
            const disabled = dataToolError(tool.name, policySettings)
            if (disabled) return { error: disabled }
            const targetError = await validateDataTarget(tool.workspace, tool.args.path)
            if (targetError) return { error: targetError }
            const languagePath = typeof tool.args.language_path === 'string' && tool.args.language_path.trim()
              ? tool.args.language_path
              : bundledOcrLanguagePath()
            if (tool.args.language_path) {
              const languageError = await validateDataTarget(tool.workspace, tool.args.language_path)
              if (languageError) return { error: languageError }
            }
            if (!/\.(?:png|jpe?g|webp)$/i.test(tool.args.path)) return { error: 'ocr_image supports PNG, JPEG, or WebP files.' }
            try {
              const stat = await fs.promises.stat(tool.args.path)
              if (stat.size > MAX_DATA_FILE_BYTES) return { error: `OCR input is limited to ${MAX_DATA_FILE_BYTES} bytes.` }
              const text = await runOfflineOcr(tool.args.path, String(tool.args.language || 'eng'), languagePath)
              return { result: text || '(No text detected.)' }
            } catch (error: any) {
              return { error: error?.message || String(error) }
            }
          }

          // ═══ GIT ════════════════════════════════════════════════════════════
          case 'git_status': {
            const git = getToolGit(tool.args.path || '.')
            const status = await git.status()
            return { result: `Branch: ${status.current}\nStaged: ${status.staged.join(', ') || 'none'}\nModified: ${status.modified.join(', ') || 'none'}\nUntracked: ${status.not_added.join(', ') || 'none'}` }
          }
          case 'git_diff': {
            const git = getToolGit(tool.args.path || '.')
            const diff = tool.args.file ? await git.diff([tool.args.file]) : await git.diff()
            return { result: diff || 'No changes' }
          }
          case 'git_commit': {
            const git = getToolGit(tool.args.path || '.')
            if (tool.args.add) await git.add('.')
            const result = await git.commit(tool.args.message)
            return { result: `Committed: ${result.summary}` }
          }
          case 'git_log': {
            const git = getToolGit(tool.args.path || '.')
            const log = await git.log({ maxCount: tool.args.count || 10 })
            return { result: log.all.map((e) => `${e.hash.slice(0, 7)} ${e.message}`).join('\n') }
          }
          case 'git_branch': {
            const git = getToolGit(tool.args.path || '.')
            if (tool.args.create) { await git.checkoutLocalBranch(tool.args.branch); return { result: `Created and switched to branch: ${tool.args.branch}` } }
            else if (tool.args.switch) { await git.checkout(tool.args.branch); return { result: `Switched to branch: ${tool.args.branch}` } }
            const branches = await git.branchLocal()
            return { result: `Current: ${branches.current}\nBranches: ${branches.all.join(', ')}` }
          }
          case 'git_stash': {
            const git = getToolGit(tool.args.path || '.')
            if (tool.args.pop) { await git.stash(['pop']); return { result: 'Stash popped' } }
            const result = await git.stash()
            return { result: `Stashed: ${result}` }
          }
          case 'git_generate_commit': {
            const git = getToolGit(tool.args.path || '.')
            const diff = tool.args.file ? await git.diff([tool.args.file]) : await git.diff()
            if (!diff) return { result: 'No changes to generate commit message for' }
            return { result: `Git diff for commit message generation:\n\n${diff.slice(0, 2000)}` }
          }
          case 'git_undo_last': {
            const git = getToolGit(tool.args.path || '.')
            await git.reset(['--soft', 'HEAD~1'])
            return { result: 'Last commit undone (changes kept in staging)' }
          }
          case 'git_discard_changes': {
            const git = getToolGit(tool.args.path || '.')
            await git.checkout(['--', '.'])
            await git.clean('f', ['-d'])
            return { result: 'All uncommitted changes discarded' }
          }

          // ═══ MULTI-FILE ════════════════════════════════════════════════════
          case 'multi_file_edit': {
            const edits = tool.args.edits as { path: string; old_string: string; new_string: string }[]
            if (!edits || !Array.isArray(edits)) return { error: 'edits must be an array of {path, old_string, new_string}' }
            const results: string[] = []
            for (const edit of edits) {
              try {
                const content = await fs.promises.readFile(edit.path, 'utf-8')
                if (!content.includes(edit.old_string)) { results.push(`${edit.path}: old_string not found`); continue }
                await fs.promises.writeFile(edit.path, content.replace(edit.old_string, edit.new_string), 'utf-8')
                results.push(`${edit.path}: ✓ edited`)
              } catch (err: any) { results.push(`${edit.path}: ✕ ${err.message}`) }
            }
            if (checkpoint) await finalizeCheckpoint(path.join(app.getPath('userData'), 'checkpoints'), checkpoint)
            return { result: results.join('\n') }
          }
          case 'preview_edits': {
            const root = tool.args.path || tool.workspace || '.'
            return { result: await previewEdits(root, tool.args.edits) }
          }
          case 'read_directory_tree': {
            const dirPath = tool.args.path || '.'
            const treeLines: string[] = []
            async function buildTree(dir: string, prefix: string, depth: number) {
              if (depth > 3) return
              const entries = await fs.promises.readdir(dir, { withFileTypes: true })
              const filtered = entries.filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist').sort((a, b) => (a.isDirectory() ? 0 : 1) - (b.isDirectory() ? 0 : 1))
              for (let i = 0; i < filtered.length; i++) {
                const entry = filtered[i]
                const isLast = i === filtered.length - 1
                treeLines.push(`${prefix}${isLast ? '└── ' : '├── '}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`)
                if (entry.isDirectory()) await buildTree(path.join(dir, entry.name), prefix + (isLast ? '    ' : '│   '), depth + 1)
              }
            }
            treeLines.push(dirPath)
            await buildTree(dirPath, '', 0)
            return { result: treeLines.join('\n') }
          }
          case 'archive_list': {
            if (!tool.args.archive_path) return { error: 'archive_list requires archive_path' }
            const inspection = await inspectZipArchive(tool.args.archive_path)
            const listing = inspection.entries.map((entry) => (
              `${entry.directory ? '[DIR] ' : '[FILE]'} ${entry.name}${entry.directory ? '' : ` (${entry.uncompressedBytes} bytes)`}`
            ))
            return {
              result: [
                `ZIP: ${inspection.fileCount} files, ${inspection.directoryCount} directories, ${inspection.totalUncompressedBytes} uncompressed bytes`,
                ...listing,
              ].join('\n'),
            }
          }
          case 'archive_extract': {
            const result = await extractZipArchive(tool.args.archive_path, tool.args.output_path, {
              overwrite: tool.args.overwrite === true,
              inspection: archiveInspection,
            })
            if (checkpoint) await finalizeCheckpoint(path.join(app.getPath('userData'), 'checkpoints'), checkpoint)
            const shown = result.extracted.slice(0, 200)
            const omitted = result.extracted.length - shown.length
            return {
              result: [
                `Extracted ${result.extracted.length} files (${result.totalBytes} bytes) to ${tool.args.output_path}.`,
                result.skipped.length ? `Skipped ${result.skipped.length} existing files because overwrite was disabled.` : '',
                ...shown,
                omitted > 0 ? `... ${omitted} more extracted files; use read_directory_tree to inspect them.` : '',
              ].filter(Boolean).join('\n'),
            }
          }

          // ═══ WEB SEARCH ═════════════════════════════════════════════════════
          case 'web_search': {
            const query = encodeURIComponent(tool.args.query)
            const resp = await fetch(`https://html.duckduckgo.com/html/?q=${query}`)
            const html = await resp.text()
            const snippets: string[] = []
            const resultRegex = /<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
            let m
            while ((m = resultRegex.exec(html)) && snippets.length < 5) {
              snippets.push(`**${m[1].trim()}**\n${m[2].replace(/<[^>]+>/g, '').trim()}`)
            }
            if (snippets.length === 0) {
              const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000)
              return { result: `Search results for: ${tool.args.query}\n\n${plainText.slice(0, 1000)}` }
            }
            return { result: `Search results for: ${tool.args.query}\n\n${snippets.join('\n\n---\n\n')}` }
          }

          // ═══ WEB3 ═══════════════════════════════════════════════════════════
          case 'web3_balance': {
            const address = tool.args.address
            const chain = tool.args.chain || 'ethereum'
            const rpcUrls: Record<string, string> = {
              ethereum: 'https://eth.llamarpc.com', polygon: 'https://polygon-rpc.com',
              arbitrum: 'https://arb1.arbitrum.io/rpc', optimism: 'https://mainnet.optimism.io',
              base: 'https://mainnet.base.org', bsc: 'https://bsc-dataseed.binance.org', sepolia: 'https://rpc.sepolia.org',
            }
            const resp = await fetch(rpcUrls[chain] || rpcUrls.ethereum, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
            })
            const data = await resp.json()
            const balanceWei = BigInt(data.result || '0')
            return { result: `Balance on ${chain}:\nAddress: ${address}\nBalance: ${(Number(balanceWei) / 1e18).toFixed(4)} ETH\nRaw: ${balanceWei.toString()} wei` }
          }
          case 'web3_explorer': {
            const chain = tool.args.chain || 'ethereum'
            const explorers: Record<string, string> = { ethereum: 'https://etherscan.io', polygon: 'https://polygonscan.com', arbitrum: 'https://arbiscan.io', optimism: 'https://optimistic.etherscan.io', base: 'https://basescan.org', bsc: 'https://bscscan.com', sepolia: 'https://sepolia.etherscan.io' }
            const explorer = explorers[chain] || explorers.ethereum
            if (tool.args.tx) return { result: `Transaction ${tool.args.tx}:\nView: ${explorer}/tx/${tool.args.tx}` }
            if (tool.args.address) return { result: `Address ${tool.args.address}:\nView: ${explorer}/address/${tool.args.address}` }
            if (tool.args.block) return { result: `Block ${tool.args.block}:\nView: ${explorer}/block/${tool.args.block}` }
            return { result: `Explorer: ${explorer}\nProvide tx, address, or block parameter.` }
          }
          // ═══ IMAGE / VIDEO / SPEECH ════════════════════════════════════════
          case 'speech_to_text': {
            const audioPath = tool.args.audio_path
            const lang = tool.args.language || 'en'
            const sttSettings = await loadToolSettings()
            const groqKey = sttSettings.providers?.find((p: any) => p.id === 'groq')?.apiKey
            if (groqKey && audioPath) {
              const audioBuffer = await fs.promises.readFile(audioPath)
              const formData = new FormData()
              formData.append('file', new Blob([audioBuffer]), path.basename(audioPath))
              formData.append('model', 'whisper-large-v3')
              formData.append('language', lang)
              formData.append('response_format', 'json')
              const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + groqKey }, body: formData })
              if (resp.ok) { const data = await resp.json() as any; return { result: `Transcription (Groq Whisper):\n\n${data.text}\n\nLanguage: ${data.language || lang}\nDuration: ${data.duration ? Math.round(data.duration) + 's' : 'unknown'}` } }
            }
            const hfKey = sttSettings.providers?.find((p: any) => p.id === 'huggingface')?.apiKey
            if (hfKey && audioPath) {
              const audioBuffer = await fs.promises.readFile(audioPath)
              const formData = new FormData()
              formData.append('file', new Blob([audioBuffer]), path.basename(audioPath))
              formData.append('parameters', JSON.stringify({ language: lang }))
              const resp = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3', { method: 'POST', headers: { 'Authorization': 'Bearer ' + hfKey }, body: formData })
              if (resp.ok) { const data = await resp.json() as any; return { result: `Transcription (Whisper via HuggingFace):\n\n${data.text || JSON.stringify(data)}` } }
            }
            return { result: 'Speech-to-Text requires:\n1. A Groq or Hugging Face API key (Settings)\n2. An audio file path (audio_path)' }
          }
          case 'text_to_speech': {
            const text = tool.args.text || 'Hello world'
            const voice = tool.args.voice || 'alloy'
            const rate = tool.args.rate || 1
            const ttsUrl = `https://text.pollinations.ai/audio?text=${encodeURIComponent(text)}&voice=${voice}`
            return { result: `Text-to-Speech:\n\nVoice: ${voice}\nRate: ${rate}x\nText: ${text.slice(0, 300)}${text.length > 300 ? '...' : ''}\n\n🔊 Audio URL (click to play):\n${ttsUrl}` }
          }
          case 'image_analysis': {
            const imageUrl = tool.args.image_url
            const question = tool.args.question || 'Describe this image in detail'
            if (!imageUrl) return { result: 'Image analysis requires an image URL or local file path.' }
            const analysisSettings = await loadToolSettings()
            const geminiKey = analysisSettings.providers?.find((p: any) => p.id === 'gemini')?.apiKey
            if (geminiKey) {
              let base64Image = '', mimeType = 'image/png'
              if (imageUrl.startsWith('http')) {
                const imgResp = await fetch(imageUrl)
                const buf = Buffer.from(await imgResp.arrayBuffer())
                base64Image = buf.toString('base64')
                mimeType = imgResp.headers.get('content-type') || 'image/png'
              } else if (fs.existsSync(imageUrl)) {
                const buf = await fs.promises.readFile(imageUrl)
                base64Image = buf.toString('base64')
                mimeType = imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'
              }
              const request = geminiGenerateContentRequest(geminiKey, {
                contents: [{ parts: [{ text: question }, { inlineData: { mimeType, data: base64Image } }] }],
              })
              const resp = await fetch(request.url, request.init)
              if (resp.ok) { const data = await resp.json() as any; return { result: `Image Analysis (Gemini):\n\n${data.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis returned'}` } }
            }
            return { result: `Image Analysis:\n\nImage: ${imageUrl}\nQuestion: ${question}\n\nSet up a Gemini API key (free) in Settings for image analysis.` }
          }
          case 'code_review': {
            const filePath = tool.args.path
            const focus = tool.args.focus || 'all'
            const content = await fs.promises.readFile(filePath, 'utf-8')
            const ext = path.extname(filePath).toLowerCase()
            const lines = content.split('\n')
            const issues: string[] = []
            // Static analysis checks
            const longFunctions = content.match(/function\s+(\w+)[\s\S]{1000,}?\}/g)
            if (longFunctions) issues.push(`Long functions (${longFunctions.length}): Consider splitting into smaller functions`)
            const todos = content.match(/TODO|FIXME|HACK|XXX/gi)
            if (todos) issues.push(`Unresolved TODOs/FIXMEs: ${todos.length} found`)
            const consoleLogs = content.match(/console\.(log|debug|info)\(/g)
            if (consoleLogs) issues.push(`console.log statements: ${consoleLogs.length} (remove before production)`)
            const anyTypes = content.match(/:\s*any[\s;)/,]/g)
            if (anyTypes && ext.endsWith('ts')) issues.push(`any types: ${anyTypes.length} (use specific types)`)
            const emptyCatch = content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g)
            if (emptyCatch) issues.push(`Empty catch blocks: ${emptyCatch.length} (handle errors properly)`)
            const longLines = lines.filter(l => l.length > 120)
            if (longLines.length > 0) issues.push(`Lines >120 chars: ${longLines.length} (consider breaking up)`)
            const unusedImports = content.match(/^import.*from.*;$/gm)
            if (unusedImports && unusedImports.length > 15) issues.push(`Many imports (${unusedImports.length}): check for unused`)
            const complexity = (content.match(/(if|else|for|while|switch|case|&&|\|\|)/g) || []).length
            if (complexity > 50) issues.push(`High cyclomatic complexity (${complexity}): consider refactoring`)
            // Security checks
            if (focus === 'security' || focus === 'all') {
              if (content.includes('eval(')) issues.push('Security: eval() detected — potential code injection')
              if (content.includes('innerHTML') && !content.includes('DOMPurify')) issues.push('Security: innerHTML without sanitization')
              if (content.match(/password|secret|token/i) && !content.includes('process.env')) issues.push('Security: Hardcoded secrets detected')
              if (content.includes('dangerouslySetInnerHTML')) issues.push('Security: dangerouslySetInnerHTML used — XSS risk')
            }
            const summary = [
              `Code Review: ${filePath}`,
              `Language: ${ext} | Lines: ${lines.length} | Chars: ${content.length}`,
              `Complexity score: ${complexity}`,
              issues.length > 0 ? `\nIssues found (${issues.length}):\n${issues.map((i, n) => `  ${n + 1}. ${i}`).join('\n')}` : '\nNo issues detected! Code looks clean.',
              `\n\n\`\`\`${ext.slice(1)}\n${content.slice(0, 6000)}${content.length > 6000 ? '\n... (truncated)' : ''}\n\`\`\`\n\nPlease provide a detailed review focusing on: ${focus === 'all' ? 'bugs, security, performance, style, error handling, and test coverage' : focus + ' issues'}`,
            ].join('\n')
            return { result: summary }
          }
          case 'generate_image': {
            const prompt = encodeURIComponent(tool.args.prompt || 'a beautiful landscape')
            const width = tool.args.width || 1024, height = tool.args.height || 1024
            const seed = tool.args.seed || Math.floor(Math.random() * 999999)
            const model = tool.args.model || 'flux'
            const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=true`
            return { result: `Image generated!\n\nPrompt: ${tool.args.prompt}\nModel: ${model}\nSize: ${width}x${height}\nSeed: ${seed}\n\nView: ${imageUrl}\n\nDownload: ${imageUrl}&download=true` }
          }
          case 'generate_video': {
            const prompt = tool.args.prompt || 'a beautiful sunset over mountains'
            return { result: `Video URL (Pollinations):\n\nPrompt: ${prompt}\n\nhttps://video.pollinations.ai/prompt/${encodeURIComponent(prompt)}` }
          }

          default:
            return { error: `Unknown tool: ${tool.name}` }
        }
      } catch (err: any) {
        return { error: err.message }
      }
    }
  )
}

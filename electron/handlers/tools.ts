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
import { createCheckpoint } from '../checkpointStore'
import { archiveOutputPaths, extractZipArchive, inspectZipArchive, type ArchiveInspection } from '../archiveStore'
import { buildRepoIndex, buildRepoMap, repoIndexStats, searchRepo, startRepoIndexWatcher } from '../repoIndex'
import { planRepoChange } from '../repoPlanner'
import { previewEdits } from '../patchPreview'
import { formatVsCodeContext, readVsCodeBridgeStatus, sendVsCodeBridgeCommand } from '../vscodeBridge'

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

export function registerToolHandlers() {
  ipcMain.handle('vscode:status', async (_event, workspace: string) => {
    try {
      return await readVsCodeBridgeStatus(workspace)
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle(
    'tool:execute',
    async (event, tool: { name: string; args: Record<string, any>; workspace?: string; sessionId?: string; taskId?: string }) => {
      try {
        tool.args = resolveToolArgs(tool.name, tool.args, tool.workspace)
        const policySettings = await loadToolSettings()
        const permissionMode = (policySettings.permissionMode || 'ask-risky') as PermissionMode
        const decision = assessToolPolicy(tool.name, tool.args, tool.workspace, permissionMode)

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

        if (decision.needsApproval && process.env.VD_AGENT_AUTO_APPROVE_TOOLS !== '1') {
          const owner = BrowserWindow.fromWebContents(event.sender)
          const allowed = await confirmAgentAction(
            owner,
            `Allow VD Agent to run ${tool.name}?`,
            toolApprovalDetail(tool.name, tool.args, decision),
          )
          if (!allowed) return { error: `User declined ${tool.name}` }
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
        if (tool.workspace && tool.sessionId && targets.length > 0) {
          const checkpoint = await createCheckpoint(path.join(app.getPath('userData'), 'checkpoints'), {
            sessionId: tool.sessionId,
            workspace: tool.workspace,
            label: `${tool.name}${tool.taskId ? ` for task ${tool.taskId}` : ''}`,
            paths: targets,
          })
          if (checkpoint) {
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
            await fs.promises.writeFile(tool.args.path, tool.args.content, 'utf-8')
            return { result: `File written: ${tool.args.path}` }
          }
          case 'edit_file': {
            const content = await fs.promises.readFile(tool.args.path, 'utf-8')
            if (!content.includes(tool.args.old_string)) {
              return { error: `old_string not found in ${tool.args.path}` }
            }
            const newContent = content.replace(tool.args.old_string, tool.args.new_string)
            await fs.promises.writeFile(tool.args.path, newContent, 'utf-8')
            return { result: `Edited ${tool.args.path}: replaced ${tool.args.old_string.length} chars` }
          }
          case 'create_file': {
            await fs.promises.writeFile(tool.args.path, tool.args.content || '', 'utf-8')
            return { result: `Created: ${tool.args.path}` }
          }
          case 'delete_file': {
            await fs.promises.unlink(tool.args.path)
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
            const searchDir = tool.args.path || '.'
            const codeResults: string[] = []
            const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.yaml', '.yml', '.md', '.sh', '.sql', '.rb', '.php', '.swift', '.kt']
            async function doCodeSearch(dir: string, depth: number) {
              if (depth > 6) return
              const entries = await fs.promises.readdir(dir, { withFileTypes: true })
              for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
                const fullPath = path.join(dir, entry.name)
                if (entry.isDirectory()) { await doCodeSearch(fullPath, depth + 1) }
                else if (codeExts.includes(path.extname(entry.name))) {
                  try {
                    const content = await fs.promises.readFile(fullPath, 'utf-8')
                    const lines = content.split('\n')
                    for (let i = 0; i < lines.length; i++) {
                      if (lines[i].includes(searchPattern)) codeResults.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`)
                    }
                  } catch {}
                }
              }
            }
            await doCodeSearch(searchDir, 0)
            return { result: codeResults.length ? codeResults.slice(0, 100).join('\n') : 'No matches found' }
          }
          case 'repo_map': {
            const root = tool.args.path || tool.workspace || '.'
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
            const root = tool.args.path || tool.workspace || '.'
            const stats = tool.args.once
              ? tool.args.force ? await buildRepoIndex(root, true) : await repoIndexStats(root)
              : tool.args.force ? await buildRepoIndex(root, true) : await startRepoIndexWatcher(root)
            return {
              result: [
                `Repo index ${stats.cached ? 'reused' : 'built'}: ${stats.files} files, ${stats.bytes} bytes.`,
                `Background watcher: ${stats.watching ? 'on' : 'off'}`,
                `Updated: ${new Date(stats.updatedAt).toISOString()}`,
                `Fingerprint: ${stats.fingerprint.slice(0, 12)}`,
                `Root: ${stats.root}`,
              ].join('\n'),
            }
          }
          case 'repo_plan': {
            const root = tool.args.path || tool.workspace || '.'
            const query = String(tool.args.query || '').trim()
            if (!query) return { error: 'repo_plan requires query' }
            return { result: await planRepoChange(root, query, Number(tool.args.limit || 12)) }
          }
          case 'repo_search': {
            const root = tool.args.path || tool.workspace || '.'
            const query = String(tool.args.query || '').trim()
            if (!query) return { error: 'repo_search requires query' }
            const hits = await searchRepo(root, query, Number(tool.args.limit || 30))
            const lines = hits.map((hit, index) => [
              `${index + 1}. ${hit.path}:${hit.line} score=${hit.score} reason=${hit.reason}`,
              hit.snippet,
            ].join('\n'))
            return { result: lines.length ? `Repo search for "${query}" (${lines.length} hits):\n\n${lines.join('\n\n')}` : 'No matches found.' }
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
            const result = await sendVsCodeBridgeCommand(root, {
              action: 'apply_edit',
              args: { path: tool.args.path, old_string: tool.args.old_string, new_string: tool.args.new_string },
            })
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

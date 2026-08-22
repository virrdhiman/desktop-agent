import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { simpleGit, SimpleGit } from 'simple-git'
import { spawn as ptySpawn } from 'node-pty'

let mainWindow: BrowserWindow | null = null
const gitInstances: Map<string, SimpleGit> = new Map()
const terminals: Map<string, IPtyInstance> = new Map()

interface IPtyInstance {
  pty: any
  buffer: string
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  terminals.forEach((t) => t.pty.kill())
  terminals.clear()
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── Git Helpers ─────────────────────────────────────────────────────────────

function getGit(dirPath: string): SimpleGit {
  if (!gitInstances.has(dirPath)) {
    gitInstances.set(dirPath, simpleGit(dirPath))
  }
  return gitInstances.get(dirPath)!
}

// ─── File System IPC ─────────────────────────────────────────────────────────

ipcMain.handle('fs:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('fs:readDirectory', async (_event, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== '__pycache__' && e.name !== '.git')
      .map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try {
    const stat = await fs.promises.stat(filePath)
    if (stat.size > 4 * 1024 * 1024) {
      return { error: 'File too large (>4MB)' }
    }
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return { content, path: filePath }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('fs:getParentPath', async (_event, dirPath: string) => {
  return path.dirname(dirPath)
})

ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
  try {
    await fs.promises.writeFile(filePath, '', 'utf-8')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('fs:createDirectory', async (_event, dirPath: string) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('fs:deleteFile', async (_event, filePath: string) => {
  try {
    await fs.promises.unlink(filePath)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
  try {
    await fs.promises.rename(oldPath, newPath)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

// Recursive file listing for search
ipcMain.handle('fs:walkDirectory', async (_event, dirPath: string) => {
  const results: { name: string; path: string; isDirectory: boolean }[] = []
  async function walk(dir: string, depth: number) {
    if (depth > 8) return
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
        const fullPath = path.join(dir, entry.name)
        results.push({ name: entry.name, path: fullPath, isDirectory: entry.isDirectory() })
        if (entry.isDirectory()) await walk(fullPath, depth + 1)
      }
    } catch {}
  }
  await walk(dirPath, 0)
  return results
})

// ─── Git IPC ─────────────────────────────────────────────────────────────────

ipcMain.handle('git:status', async (_event, repoPath: string) => {
  try {
    const git = getGit(repoPath)
    const status = await git.status()
    return {
      branch: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      modified: status.modified,
      not_added: status.not_added,
      deleted: status.deleted,
      renamed: status.renamed,
      isClean: status.isClean(),
    }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:diff', async (_event, repoPath: string, filePath?: string) => {
  try {
    const git = getGit(repoPath)
    if (filePath) {
      return await git.diff([filePath])
    }
    return await git.diff()
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:diffStaged', async (_event, repoPath: string) => {
  try {
    const git = getGit(repoPath)
    return await git.diff(['--cached'])
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:commit', async (_event, repoPath: string, message: string) => {
  try {
    const git = getGit(repoPath)
    await git.add('.')
    const result = await git.commit(message)
    return { success: true, summary: result.summary }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:commitStaged', async (_event, repoPath: string, message: string) => {
  try {
    const git = getGit(repoPath)
    const result = await git.commit(message)
    return { success: true, summary: result.summary }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:push', async (_event, repoPath: string, branch?: string) => {
  try {
    const git = getGit(repoPath)
    const status = await git.status()
    await git.push('origin', branch || status.current!)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:pull', async (_event, repoPath: string) => {
  try {
    const git = getGit(repoPath)
    const result = await git.pull()
    return { success: true, summary: result.summary }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:init', async (_event, repoPath: string) => {
  try {
    const git = getGit(repoPath)
    await git.init()
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:log', async (_event, repoPath: string, count: number = 20) => {
  try {
    const git = getGit(repoPath)
    const log = await git.log({ maxCount: count })
    return log.all.map((entry) => ({
      hash: entry.hash,
      date: entry.date,
      message: entry.message,
      author: entry.author_name,
    }))
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:isRepo', async (_event, dirPath: string) => {
  try {
    const git = getGit(dirPath)
    await git.status()
    return true
  } catch {
    return false
  }
})

// NEW: Branch operations
ipcMain.handle('git:branches', async (_event, repoPath: string) => {
  try {
    const git = getGit(repoPath)
    const branches = await git.branchLocal()
    return {
      current: branches.current,
      branches: branches.all,
    }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:createBranch', async (_event, repoPath: string, branchName: string) => {
  try {
    const git = getGit(repoPath)
    await git.checkoutLocalBranch(branchName)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:switchBranch', async (_event, repoPath: string, branchName: string) => {
  try {
    const git = getGit(repoPath)
    await git.checkout(branchName)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:deleteBranch', async (_event, repoPath: string, branchName: string) => {
  try {
    const git = getGit(repoPath)
    await git.deleteLocalBranch(branchName)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:stash', async (_event, repoPath: string) => {
  try {
    const git = getGit(repoPath)
    const result = await git.stash()
    return { success: true, message: result }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:stashPop', async (_event, repoPath: string) => {
  try {
    const git = getGit(repoPath)
    await git.stash(['pop'])
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:stage', async (_event, repoPath: string, files: string[]) => {
  try {
    const git = getGit(repoPath)
    await git.add(files)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('git:unstage', async (_event, repoPath: string, files: string[]) => {
  try {
    const git = getGit(repoPath)
    await git.reset(['HEAD', ...files])
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

// ─── Terminal PTY IPC ────────────────────────────────────────────────────────

ipcMain.handle('terminal:create', async (_event, termId: string, cwd: string) => {
  try {
    const shellPath = process.platform === 'win32' ? 'powershell.exe' : 'bash'
    const pty = ptySpawn(shellPath, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: cwd || process.env.HOME || process.cwd(),
      env: process.env as Record<string, string>,
    })

    const termInstance: IPtyInstance = { pty, buffer: '' }
    terminals.set(termId, termInstance)

    pty.onData((data: string) => {
      termInstance.buffer += data
      mainWindow?.webContents.send('terminal:data', termId, data)
    })

    pty.onExit(({ exitCode }: { exitCode: number }) => {
      mainWindow?.webContents.send('terminal:exit', termId, exitCode)
      terminals.delete(termId)
    })

    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('terminal:write', async (_event, termId: string, data: string) => {
  const term = terminals.get(termId)
  if (term) term.pty.write(data)
})

ipcMain.handle('terminal:resize', async (_event, termId: string, cols: number, rows: number) => {
  const term = terminals.get(termId)
  if (term) term.pty.resize(cols, rows)
})

ipcMain.handle('terminal:kill', async (_event, termId: string) => {
  const term = terminals.get(termId)
  if (term) {
    term.pty.kill()
    terminals.delete(termId)
  }
})

// ─── Tool Execution IPC ──────────────────────────────────────────────────────

ipcMain.handle(
  'tool:execute',
  async (_event, tool: { name: string; args: Record<string, any> }) => {
    try {
      switch (tool.name) {
        case 'read_file': {
          const content = await fs.promises.readFile(tool.args.path, 'utf-8')
          return { result: content }
        }
        case 'write_file': {
          await fs.promises.writeFile(tool.args.path, tool.args.content, 'utf-8')
          return { result: `File written: ${tool.args.path}` }
        }
        case 'edit_file': {
          // Replace a specific string in a file
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
              if (entry.isDirectory()) {
                await doSearch(fullPath, depth + 1)
              } else if (entry.name.includes(pattern) || fullPath.includes(pattern)) {
                results.push(fullPath)
              }
            }
          }
          await doSearch(searchRoot, 0)
          return { result: results.length ? results.join('\n') : 'No matches found' }
        }
        case 'search_code': {
          // Grep-like search through file contents
          const searchPattern = tool.args.pattern
          const searchDir = tool.args.path || '.'
          const codeResults: string[] = []
          async function doCodeSearch(dir: string, depth: number) {
            if (depth > 6) return
            const entries = await fs.promises.readdir(dir, { withFileTypes: true })
            for (const entry of entries) {
              if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
              const fullPath = path.join(dir, entry.name)
              if (entry.isDirectory()) {
                await doCodeSearch(fullPath, depth + 1)
              } else {
                try {
                  const ext = path.extname(entry.name)
                  if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.yaml', '.yml', '.md', '.sh', '.sql', '.rb', '.php', '.swift', '.kt'].includes(ext)) {
                    const content = await fs.promises.readFile(fullPath, 'utf-8')
                    const lines = content.split('\n')
                    for (let i = 0; i < lines.length; i++) {
                      if (lines[i].includes(searchPattern)) {
                        codeResults.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`)
                      }
                    }
                  }
                } catch {}
              }
            }
          }
          await doCodeSearch(searchDir, 0)
          return { result: codeResults.length ? codeResults.slice(0, 100).join('\n') : 'No matches found' }
        }
        case 'run_command': {
          const { exec } = await import('child_process')
          return new Promise((resolve) => {
            exec(
              tool.args.command,
              { cwd: tool.args.cwd || process.cwd(), timeout: 30000 },
              (error, stdout, stderr) => {
                resolve({
                  result: stdout || stderr || (error ? error.message : 'Command completed'),
                })
              }
            )
          })
        }
        case 'git_status': {
          const git = getGit(tool.args.path || '.')
          const status = await git.status()
          return {
            result: `Branch: ${status.current}\nStaged: ${status.staged.join(', ') || 'none'}\nModified: ${status.modified.join(', ') || 'none'}\nUntracked: ${status.not_added.join(', ') || 'none'}`,
          }
        }
        case 'git_diff': {
          const git = getGit(tool.args.path || '.')
          const diff = tool.args.file ? await git.diff([tool.args.file]) : await git.diff()
          return { result: diff || 'No changes' }
        }
        case 'git_commit': {
          const git = getGit(tool.args.path || '.')
          if (tool.args.add) await git.add('.')
          const result = await git.commit(tool.args.message)
          return { result: `Committed: ${result.summary}` }
        }
        case 'git_log': {
          const git = getGit(tool.args.path || '.')
          const log = await git.log({ maxCount: tool.args.count || 10 })
          const logStr = log.all.map((e) => `${e.hash.slice(0, 7)} ${e.message}`).join('\n')
          return { result: logStr }
        }
        case 'git_branch': {
          const git = getGit(tool.args.path || '.')
          if (tool.args.create) {
            await git.checkoutLocalBranch(tool.args.branch)
            return { result: `Created and switched to branch: ${tool.args.branch}` }
          } else if (tool.args.switch) {
            await git.checkout(tool.args.branch)
            return { result: `Switched to branch: ${tool.args.branch}` }
          } else {
            const branches = await git.branchLocal()
            return { result: `Current: ${branches.current}\nBranches: ${branches.all.join(', ')}` }
          }
        }
        case 'git_stash': {
          const git = getGit(tool.args.path || '.')
          if (tool.args.pop) {
            await git.stash(['pop'])
            return { result: 'Stash popped' }
          }
          const result = await git.stash()
          return { result: `Stashed: ${result}` }
        }
        case 'web_search': {
          try {
            const query = encodeURIComponent(tool.args.query)
            const resp = await fetch(`https://html.duckduckgo.com/html/?q=${query}`)
            const html = await resp.text()
            // Extract snippets from DuckDuckGo HTML
            const snippets: string[] = []
            const resultRegex = /<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
            let m
            while ((m = resultRegex.exec(html)) && snippets.length < 5) {
              snippets.push(`**${m[1].trim()}**\n${m[2].replace(/<[^>]+>/g, '').trim()}`)
            }
            if (snippets.length === 0) {
              // Fallback: try to get any text snippets
              const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000)
              return { result: `Search results for: ${tool.args.query}\n\n${plainText.slice(0, 1000)}` }
            }
            return { result: `Search results for: ${tool.args.query}\n\n${snippets.join('\n\n---\n\n')}` }
          } catch (err: any) {
            return { error: `Web search failed: ${err.message}` }
          }
        }
        case 'git_generate_commit': {
          // AI-assisted commit message generation from diff
          try {
            const git = getGit(tool.args.path || '.')
            const diff = tool.args.file ? await git.diff([tool.args.file]) : await git.diff()
            if (!diff) return { result: 'No changes to generate commit message for' }
            const diffPreview = diff.slice(0, 2000)
            return { result: `Git diff for commit message generation:\n\n${diffPreview}` }
          } catch (err: any) {
            return { error: err.message }
          }
        }
        case 'git_undo_last': {
          // Undo the last commit, keeping changes
          try {
            const git = getGit(tool.args.path || '.')
            await git.reset(['--soft', 'HEAD~1'])
            return { result: 'Last commit undone (changes kept in staging)' }
          } catch (err: any) {
            return { error: err.message }
          }
        }
        case 'git_discard_changes': {
          // Discard all uncommitted changes
          try {
            const git = getGit(tool.args.path || '.')
            await git.checkout(['--', '.'])
            await git.clean('f', ['-d'])
            return { result: 'All uncommitted changes discarded' }
          } catch (err: any) {
            return { error: err.message }
          }
        }
        case 'multi_file_edit': {
          // Edit multiple files at once
          const edits = tool.args.edits as { path: string; old_string: string; new_string: string }[]
          if (!edits || !Array.isArray(edits)) return { error: 'edits must be an array of {path, old_string, new_string}' }
          const results: string[] = []
          for (const edit of edits) {
            try {
              const content = await fs.promises.readFile(edit.path, 'utf-8')
              if (!content.includes(edit.old_string)) {
                results.push(`${edit.path}: old_string not found`)
                continue
              }
              const newContent = content.replace(edit.old_string, edit.new_string)
              await fs.promises.writeFile(edit.path, newContent, 'utf-8')
              results.push(`${edit.path}: ✓ edited`)
            } catch (err: any) {
              results.push(`${edit.path}: ✕ ${err.message}`)
            }
          }
          return { result: results.join('\n') }
        }
        case 'read_directory_tree': {
          // Get a tree view of the project structure
          try {
            const dirPath = tool.args.path || '.'
            const lines: string[] = []
            async function buildTree(dir: string, prefix: string, depth: number) {
              if (depth > 3) return
              const entries = await fs.promises.readdir(dir, { withFileTypes: true })
              const filtered = entries
                .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
                .sort((a, b) => (a.isDirectory() ? 0 : 1) - (b.isDirectory() ? 0 : 1))
              for (let i = 0; i < filtered.length; i++) {
                const entry = filtered[i]
                const isLast = i === filtered.length - 1
                const connector = isLast ? '└── ' : '├── '
                const icon = entry.isDirectory() ? '📁' : '📄'
                lines.push(`${prefix}${connector}${icon} ${entry.name}`)
                if (entry.isDirectory()) {
                  const newPrefix = prefix + (isLast ? '    ' : '│   ')
                  await buildTree(path.join(dir, entry.name), newPrefix, depth + 1)
                }
              }
            }
            lines.push(dirPath)
            await buildTree(dirPath, '', 0)
            return { result: lines.join('\n') }
          } catch (err: any) {
            return { error: err.message }
          }
        }
        case 'web3_balance': {
          // Check crypto balance via public RPC
          try {
            const address = tool.args.address
            const chain = tool.args.chain || 'ethereum'
            const rpcUrls: Record<string, string> = {
              ethereum: 'https://eth.llamarpc.com',
              polygon: 'https://polygon-rpc.com',
              arbitrum: 'https://arb1.arbitrum.io/rpc',
              optimism: 'https://mainnet.optimism.io',
              base: 'https://mainnet.base.org',
              bsc: 'https://bsc-dataseed.binance.org',
              sepolia: 'https://rpc.sepolia.org',
            }
            const rpcUrl = rpcUrls[chain] || rpcUrls.ethereum
            const resp = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
                params: [address, 'latest'],
              }),
            })
            const data = await resp.json()
            const balanceWei = BigInt(data.result || '0')
            const balanceEth = (Number(balanceWei) / 1e18).toFixed(4)
            return { result: `Balance on ${chain}:\nAddress: ${address}\nBalance: ${balanceEth} ETH (or native token)\nRaw: ${balanceWei.toString()} wei` }
          } catch (err: any) {
            return { error: `Balance check failed: ${err.message}` }
          }
        }
        case 'web3_explorer': {
          // Check transaction or address on block explorer
          try {
            const chain = tool.args.chain || 'ethereum'
            const explorers: Record<string, string> = {
              ethereum: 'https://etherscan.io', polygon: 'https://polygonscan.com',
              arbitrum: 'https://arbiscan.io', optimism: 'https://optimistic.etherscan.io',
              base: 'https://basescan.org', bsc: 'https://bscscan.com', sepolia: 'https://sepolia.etherscan.io',
            }
            const explorer = explorers[chain] || explorers.ethereum
            if (tool.args.tx) {
              return { result: `Transaction ${tool.args.tx}:\nView: ${explorer}/tx/${tool.args.tx}\n\nUse web_fetch to get full details from the explorer page.` }
            }
            if (tool.args.address) {
              return { result: `Address ${tool.args.address}:\nView: ${explorer}/address/${tool.args.address}\n\nUse web_fetch to get full details from the explorer page.` }
            }
            if (tool.args.block) {
              return { result: `Block ${tool.args.block}:\nView: ${explorer}/block/${tool.args.block}` }
            }
            return { result: `Explorer: ${explorer}\nProvide tx, address, or block parameter.` }
          } catch (err: any) {
            return { error: err.message }
          }
        }
        case 'web3_ipfs': {
          // Upload to IPFS via public gateway (pinata alternative: use web3.storage free tier)
          try {
            if (tool.args.action === 'upload' && tool.args.content) {
              // Use a public IPFS pinning service
              const resp = await fetch('https://api.web3.storage/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: tool.args.name || 'freebuff-upload', content: tool.args.content }),
              })
              if (resp.ok) {
                const data = await resp.json()
                return { result: `Uploaded to IPFS:\nCID: ${data.cid}\nURL: https://ipfs.io/ipfs/${data.cid}\nPinata: https://gateway.pinata.cloud/ipfs/${data.cid}` }
              }
              // Fallback: use a simpler approach
              return { result: `IPFS Upload (manual):\nTo upload to IPFS, you can:\n1. Use https://app.pinata.cloud (free tier)
2. Use https://web3.storage (free tier)
3. Run a local IPFS node: ipfs add <file>` }
            }
            if (tool.args.action === 'fetch' && tool.args.cid) {
              const resp = await fetch(`https://ipfs.io/ipfs/${tool.args.cid}`)
              const text = await resp.text()
              return { result: `IPFS Content (CID: ${tool.args.cid}):\n\n${text.slice(0, 3000)}` }
            }
            return { result: `IPFS Tool:\n- action: upload (content, name)\n- action: fetch (cid)\n\nFree IPFS services: Pinata, web3.storage, Infura IPFS` }
          } catch (err: any) {
            return { error: `IPFS operation failed: ${err.message}` }
          }
        }
        case 'web3_contract': {
          // Smart contract interaction info
          try {
            const chain = tool.args.chain || 'ethereum'
            const explorers: Record<string, string> = {
              ethereum: 'https://etherscan.io', polygon: 'https://polygonscan.com',
              arbitrum: 'https://arbiscan.io', optimism: 'https://optimistic.etherscan.io',
              base: 'https://basescan.org', bsc: 'https://bscscan.com', sepolia: 'https://sepolia.etherscan.io',
            }
            const explorer = explorers[chain] || explorers.ethereum
            if (tool.args.action === 'verify' && tool.args.address) {
              return { result: `Verify contract on ${chain}:\n1. Go to ${explorer}/address/${tool.args.address}#code
2. Click 'Verify and Publish'\n3. Enter compiler version and constructor args\n\nOr use hardhat: npx hardhat verify --network ${chain} ${tool.args.address}` }
            }
            if (tool.args.action === 'abi' && tool.args.address) {
              return { result: `Get ABI for ${tool.args.address}:\n${explorer}/address/${tool.args.address}#code\n\nOr use etherscan API: ${explorer}/api?module=contract&action=getabi&address=${tool.args.address}` }
            }
            return { result: `Smart Contract Tool:\n- action: verify (address, chain)\n- action: abi (address, chain)\n\nSupported chains: ethereum, polygon, arbitrum, optimism, base, bsc, sepolia` }
          } catch (err: any) {
            return { error: err.message }
          }
        }
        case 'web3_deploy': {
          // Smart contract deployment info
          try {
            const chain = tool.args.chain || 'sepolia'
            const file = tool.args.file || 'contracts/Contract.sol'
            return { result: `Deploy Smart Contract (${chain}):\nContract: ${file}\n\n1. Compile: npx hardhat compile\n2. Write deploy script in scripts/deploy.ts\n3. Deploy: npx hardhat run scripts/deploy.ts --network ${chain}\n4. Verify: npx hardhat verify --network ${chain} <address>\n\nFor testnet:\n- Sepolia ETH: https://sepoliafaucet.com\n- Mumbai MATIC: https://faucet.polygon.technology\n\nMake sure hardhat.config.ts has the network configured.` }
          } catch (err: any) {
            return { error: err.message }
          }
        }
        default:
          return { error: `Unknown tool: ${tool.name}` }
      }
    } catch (err: any) {
      return { error: err.message }
    }
  }
)

// ─── Settings / API Keys IPC ─────────────────────────────────────────────────

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

ipcMain.handle('settings:load', async () => {
  try {
    const data = await fs.promises.readFile(SETTINGS_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {
      providers: [
        // ═══════════════════════════════════════════════════════════════════
        // 🆓 FREE OFFICIAL TIER — No cost, generous limits
        // ═══════════════════════════════════════════════════════════════════
        { id: 'groq', name: 'Groq ⚡', apiKey: '', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', freeTier: true, signupUrl: 'https://console.groq.com/keys', notes: 'Free: 30 req/min. Ultra-fast inference on custom LPU hardware. Top speed for free LLMs.' },
        { id: 'cerebras', name: 'Cerebras 🧠', apiKey: '', baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', freeTier: true, signupUrl: 'https://cloud.cerebras.ai/', notes: 'Free: $5 credits. 20x faster inference than GPU. Wafer-scale chip technology.' },
        { id: 'sambanova', name: 'SambaNova 🟣', apiKey: '', baseUrl: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.3-70B-Instruct', freeTier: true, signupUrl: 'https://cloud.sambanova.ai/apis', notes: 'Free tier: generous rate limits. Enterprise-grade AI hardware for free.' },
        { id: 'huggingface', name: 'Hugging Face 🤗', apiKey: '', baseUrl: 'https://api-inference.huggingface.co/v1', model: 'openai/gpt-oss-120b', freeTier: true, signupUrl: 'https://huggingface.co/settings/tokens', notes: 'Free tier: 1000+ models, OpenAI-compatible. The HuggingFace of inference APIs.' },
        { id: 'deepseek', name: 'DeepSeek 🔍', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', freeTier: true, signupUrl: 'https://platform.deepseek.com/api_keys', notes: 'Free tier available. Top-tier Chinese LLM. Excellent at coding and reasoning.' },
        { id: 'gemini', name: 'Google Gemini ✨', apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', freeTier: true, signupUrl: 'https://aistudio.google.com/apikey', notes: 'Free: 15 req/min. Multimodal (text, image, video, audio). Google\'s flagship AI.' },
        { id: 'github', name: 'GitHub Models 🐙', apiKey: '', baseUrl: 'https://models.inference.ai.azure.com', model: 'gpt-4o-mini', freeTier: true, signupUrl: 'https://github.com/settings/tokens', notes: 'Free: 15 req/min. GPT-4o-mini via GitHub. Use a GitHub PAT.' },
        { id: 'openrouter', name: 'OpenRouter 🌐', apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', freeTier: true, signupUrl: 'https://openrouter.ai/keys', notes: 'Aggregator with many free models. Route to the best provider automatically.' },
        { id: 'mistral', name: 'Mistral AI 🌊', apiKey: '', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', freeTier: true, signupUrl: 'https://console.mistral.ai/api-keys/', notes: 'Free tier: La Plateforme. European AI leader. Mistral Small is free. Excellent at code.' },
        { id: 'together', name: 'Together AI 🤝', apiKey: '', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3-70b-chat-hf', freeTier: true, signupUrl: 'https://api.together.xyz/settings/api-keys', notes: 'Free: $1 credits on signup. Hosts 200+ open-source models. Great variety.' },
        { id: 'fireworks', name: 'Fireworks AI 🔥', apiKey: '', baseUrl: 'https://api.fireworks.ai/inference/v1', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', freeTier: true, signupUrl: 'https://fireworks.ai/account/api-keys', notes: 'Free tier: $1 credits on signup. Blazing fast open-source model serving.' },
        { id: 'deepinfra', name: 'DeepInfra 🌌', apiKey: '', baseUrl: 'https://api.deepinfra.com/v1/openai', model: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo', freeTier: true, signupUrl: 'https://deepinfra.com/dash/api_keys', notes: 'Free: $1 credits on signup. Serverless inference at scale. Many models.' },
        { id: 'siliconflow', name: 'SiliconFlow 🇨🇳', apiKey: '', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct', freeTier: true, signupUrl: 'https://cloud.siliconflow.cn/account/ak', notes: 'Free tier. Chinese inference cloud. Qwen, DeepSeek, and more. Very generous.' },
        { id: 'xiai', name: 'xAI (Grok) 🚀', apiKey: '', baseUrl: 'https://api.x.ai/v1', model: 'grok-2-1212', freeTier: true, signupUrl: 'https://console.x.ai/', notes: 'Free: $25 credits on signup. Elon Musk\'s AI lab. Grok models. Generous trial.' },
        { id: 'novita', name: 'Novita AI 🎯', apiKey: '', baseUrl: 'https://api.novita.ai/v3/openai', model: 'meta-llama/llama-3.3-70b-instruct', freeTier: true, signupUrl: 'https://novita.ai/settings/api-keys', notes: 'Free tier. Fast inference, many open-source models. Decent free limits.' },

        // ═══════════════════════════════════════════════════════════════════
        // 🏠 LOCAL — Always free, runs on your machine
        // ═══════════════════════════════════════════════════════════════════
        { id: 'ollama', name: 'Ollama (Local) 🏠', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.3', freeTier: true, signupUrl: 'https://ollama.com/download', notes: '100% free & private. Runs locally. 100+ models via `ollama pull`. No API key needed.' },
        { id: 'lmstudio', name: 'LM Studio (Local) 💻', apiKey: 'lm-studio', baseUrl: 'http://localhost:1234/v1', model: 'local-model', freeTier: true, signupUrl: 'https://lmstudio.ai/', notes: '100% free & private. Beautiful GUI for local models. Drag-and-drop model loading.' },
        { id: 'llamacpp', name: 'llama.cpp Server 📦', apiKey: 'llama-cpp', baseUrl: 'http://localhost:8080/v1', model: 'local', freeTier: true, signupUrl: 'https://github.com/ggml-org/llama.cpp', notes: '100% free. Compile and run any GGUF model. Maximum performance.' },

        // ═══════════════════════════════════════════════════════════════════
        // 🏴‍☠️ GITHUB / COMMUNITY — Free via Discord or self-host
        // ═══════════════════════════════════════════════════════════════════
        { id: 'g4f', name: 'gpt4free (g4f) 🏴‍☠️', apiKey: '', baseUrl: 'http://localhost:8080/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://github.com/xtekky/gpt4free', notes: '12K+ GitHub stars. Access GPT-4, Claude, Gemini, DeepSeek for free. Run `pip install g4f` → `python -m g4f`.' },
        { id: 'pollinations', name: 'Pollinations 🌻', apiKey: '', baseUrl: 'https://text.pollinations.ai/openai', model: 'openai', freeTier: true, signupUrl: 'https://github.com/pollinations/pollinations', notes: 'Open-source gen-AI platform. Free text, image, video, audio. 500+ projects. No key needed.' },
        { id: 'chatgpt2api', name: 'ChatGPT-to-API 🔄', apiKey: '', baseUrl: 'http://localhost:8080/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://github.com/acheong08/ChatGPT-to-API', notes: 'Convert ChatGPT website to API format. Needs OpenAI account. Run with Go.' },
        { id: 'zukijourney', name: 'Zukijourney 🌐', apiKey: '', baseUrl: 'https://api.zukijourney.com/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/zukijourney', notes: 'Largest free AI API community (8,058 users). GPT-4.1, Claude-3.5, Gemini-2.5, DeepSeek-R1. Discord for key.' },
        { id: 'electronhub', name: 'ElectronHub ⚡', apiKey: '', baseUrl: 'https://api.electronhub.org/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/electronhub', notes: 'RP-friendly AI API (5,898 users). GPT-4.1, Claude-3.5, Gemini. Discord for key.' },
        { id: 'voidai', name: 'VoidAI 👻', apiKey: '', baseUrl: 'https://api.voidai.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/voidai', notes: 'Established API (2,089 users). GPT-4.1, Claude-3.5, Gemini, DeepSeek-R1. Discord for key.' },
        { id: 'nagaai', name: 'NagaAI 🐉', apiKey: '', baseUrl: 'https://api.nagaapi.com/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/nagaai', notes: 'Successor to ChimeraGPT (3,582 users). Claude-3.5 free tier. Discord for key.' },
        { id: 'helixmind', name: 'HelixMind 🔮', apiKey: '', baseUrl: 'https://api.helixmind.dev/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/helixmind', notes: 'Subscription-based with free tier (2,651 users). TTS, STT, embeddings included.' },
        { id: 'navyapi', name: 'NavyAPI 🚢', apiKey: '', baseUrl: 'https://api.navyai.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/navyai', notes: 'Small community API (1,543 users). GPT-4.1, Gemini, DeepSeek, image gen free.' },
        { id: 'mnn', name: 'MNN API 🧊', apiKey: '', baseUrl: 'https://api.mnapi.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/mnn', notes: 'Long-standing community API (479 users). GPT-4.1, Gemini, DeepSeek, Flux.' },
        { id: 'webraftai', name: 'WebraftAI 🕸️', apiKey: '', baseUrl: 'https://api.webraft.ai/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/webraftai', notes: 'Recovering community API (1,506 users). Some instability but improving.' },
        { id: 'voltai', name: 'VoltAI ⚡', apiKey: '', baseUrl: 'https://api.voltai.top/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/voltai', notes: 'Small experimental API (249 users). DeepSeek-R1, image gen. Discord for key.' },
        { id: 'hcap', name: 'hcap.ai 🧢', apiKey: '', baseUrl: 'https://api.hcap.ai/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/hcap', notes: 'New developer API (219 users). GPT-4.1, DeepSeek-R1, image gen.' },
        { id: 'zanityai', name: 'ZanityAI 😈', apiKey: '', baseUrl: 'https://api.zanity.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/zanityai', notes: 'RP-focused API (1,699 users). GPT-4.1, Claude-3.5, DeepSeek-R1. Free tier available.' },
        { id: 'kimetsu', name: 'Kimetsu 🔥', apiKey: '', baseUrl: 'https://api.kimetsu.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/kimetsu', notes: 'Community API (2,014 users). Claude-3.5, DeepSeek-R1. Has lore.' },

        // ═══════════════════════════════════════════════════════════════════
        // 💰 PAID — Industry leaders
        // ═══════════════════════════════════════════════════════════════════
        { id: 'openai', name: 'OpenAI 💰', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', notes: 'The industry standard. GPT-4o, o1, o3. Best overall quality.' },
        { id: 'anthropic', name: 'Anthropic 💰', apiKey: '', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', notes: 'Claude models. Best at long context, safety, and coding.' },
        { id: 'cohere', name: 'Cohere 💰', apiKey: '', baseUrl: 'https://api.cohere.com/v2', model: 'command-a-03-2025', notes: 'Enterprise RAG leader. Command models. Free trial available.' },
        { id: 'perplexity', name: 'Perplexity 💰', apiKey: '', baseUrl: 'https://api.perplexity.ai', model: 'sonar-pro', notes: 'Search-augmented LLM. Real-time web knowledge. $5 free credits.' },
      ],
      activeProvider: 'groq',
      workspacePath: '',
    }
  }
})

ipcMain.handle('settings:save', async (_event, settings: any) => {
  try {
    await fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

// ─── Streaming AI IPC ────────────────────────────────────────────────────────

ipcMain.handle(
  'ai:chat',
  async (_event, config: { provider: string; apiKey: string; baseUrl: string; model: string; messages: any[]; stream: boolean }) => {
    try {
      if (config.provider === 'anthropic') {
        const response = await fetch(`${config.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 8192,
            stream: !!config.stream,
            messages: config.messages.map((m: any) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: typeof m.content === 'string' ? m.content : m.content,
            })),
          }),
        })

        if (config.stream && response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let fullContent = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') break
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                    fullContent += parsed.delta.text
                    mainWindow?.webContents.send('ai:stream', parsed.delta.text)
                  }
                } catch {}
              }
            }
          }
          return { content: fullContent }
        }

        const data = await response.json()
        if (data.error) throw new Error(data.error.message)
        return { content: data.content?.[0]?.text || '' }
      }

      // OpenAI-compatible (works for most providers)
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: config.messages,
          max_tokens: 8192,
          stream: !!config.stream,
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`API error (${response.status}): ${errorBody.slice(0, 200)}`)
      }

      if (config.stream && response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') break
              try {
                const parsed = JSON.parse(data)
                const token = parsed.choices?.[0]?.delta?.content
                if (token) {
                  fullContent += token
                  mainWindow?.webContents.send('ai:stream', token)
                }
              } catch {}
            }
          }
        }
        return { content: fullContent }
      }

      const data = await response.json()
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
      return { content: data.choices?.[0]?.message?.content || '' }
    } catch (err: any) {
      return { error: err.message }
    }
  }
)

// ─── Conversation History IPC ────────────────────────────────────────────────

ipcMain.handle('conversations:save', async (_event, data: { messages: any[]; taskId: string }) => {
  try {
    const convPath = path.join(app.getPath('userData'), 'conversations')
    await fs.promises.mkdir(convPath, { recursive: true })
    const filename = path.join(convPath, `${Date.now()}.json`)
    await fs.promises.writeFile(filename, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('conversations:load', async () => {
  try {
    const convPath = path.join(app.getPath('userData'), 'conversations')
    const files = await fs.promises.readdir(convPath).catch(() => [])
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 50)
    const conversations = []
    for (const f of jsonFiles) {
      try {
        const data = JSON.parse(await fs.promises.readFile(path.join(convPath, f), 'utf-8'))
        conversations.push({ ...data, id: f.replace('.json', '') })
      } catch {}
    }
    return conversations
  } catch (err: any) {
    return { error: err.message }
  }
})

// ─── Shell IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
  await shell.openPath(targetPath)
})

ipcMain.handle('shell:showItemInFolder', async (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath)
})

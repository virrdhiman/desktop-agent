/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Tool Execution IPC Handler
 * 33 autonomous agent tools: file ops, git ops, code search, Web3, image/video, speech
 */
import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { simpleGit, SimpleGit } from 'simple-git'
import { SETTINGS_PATH } from './settings'

/** Git instances cache for tool execution */
const toolGitInstances: Map<string, SimpleGit> = new Map()
function getToolGit(dirPath: string): SimpleGit {
  if (!toolGitInstances.has(dirPath)) {
    toolGitInstances.set(dirPath, simpleGit(dirPath))
  }
  return toolGitInstances.get(dirPath)!
}

/** Load settings to get API keys for speech/image tools */
async function loadToolSettings(): Promise<any> {
  try {
    const data = await fs.promises.readFile(SETTINGS_PATH, 'utf-8')
    return JSON.parse(data)
  } catch { return { providers: [] } }
}

export function registerToolHandlers() {
  ipcMain.handle(
    'tool:execute',
    async (_event, tool: { name: string; args: Record<string, any> }) => {
      try {
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
          case 'run_command': {
            const { exec } = await import('child_process')
            return new Promise((resolve) => {
              exec(tool.args.command, { cwd: tool.args.cwd || process.cwd(), timeout: 30000 }, (error, stdout, stderr) => {
                resolve({ result: stdout || stderr || (error ? error.message : 'Command completed') })
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
          case 'web3_ipfs': {
            if (tool.args.action === 'upload' && tool.args.content) {
              const resp = await fetch('https://api.web3.storage/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tool.args.name || 'freebuff-upload', content: tool.args.content }) })
              if (resp.ok) { const data = await resp.json(); return { result: `Uploaded to IPFS:\nCID: ${data.cid}\nURL: https://ipfs.io/ipfs/${data.cid}` } }
              return { result: 'IPFS Upload: Use https://app.pinata.cloud (free tier) or https://web3.storage (free tier)' }
            }
            if (tool.args.action === 'fetch' && tool.args.cid) {
              const resp = await fetch(`https://ipfs.io/ipfs/${tool.args.cid}`)
              const text = await resp.text()
              return { result: `IPFS Content (CID: ${tool.args.cid}):\n\n${text.slice(0, 3000)}` }
            }
            return { result: 'IPFS Tool:\n- action: upload (content, name)\n- action: fetch (cid)' }
          }
          case 'web3_contract': {
            const chain = tool.args.chain || 'ethereum'
            const explorers: Record<string, string> = { ethereum: 'https://etherscan.io', polygon: 'https://polygonscan.com', arbitrum: 'https://arbiscan.io', optimism: 'https://optimistic.etherscan.io', base: 'https://basescan.org', bsc: 'https://bscscan.com', sepolia: 'https://sepolia.etherscan.io' }
            const explorer = explorers[chain] || explorers.ethereum
            if (tool.args.action === 'verify' && tool.args.address) return { result: `Verify on ${chain}:\n1. ${explorer}/address/${tool.args.address}#code\n2. Click 'Verify and Publish'\n3. Or: npx hardhat verify --network ${chain} ${tool.args.address}` }
            if (tool.args.action === 'abi' && tool.args.address) return { result: `ABI for ${tool.args.address}:\n${explorer}/api?module=contract&action=getabi&address=${tool.args.address}` }
            return { result: 'Smart Contract Tool:\n- action: verify (address, chain)\n- action: abi (address, chain)' }
          }
          case 'web3_deploy': {
            const chain = tool.args.chain || 'sepolia'
            return { result: `Deploy Smart Contract (${chain}):\n1. npx hardhat compile\n2. Write deploy script in scripts/deploy.ts\n3. npx hardhat run scripts/deploy.ts --network ${chain}\n4. npx hardhat verify --network ${chain} <address>` }
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
            return { result: 'Speech-to-Text requires:\n1. A Groq API key (free) — Settings → Groq\n2. An audio file path\n\nGroq Whisper: 14,400 min/day, 99 languages.' }
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
              const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: question }, { inlineData: { mimeType, data: base64Image } }] }] }),
              })
              if (resp.ok) { const data = await resp.json() as any; return { result: `Image Analysis (Gemini):\n\n${data.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis returned'}` } }
            }
            return { result: `Image Analysis:\n\nImage: ${imageUrl}\nQuestion: ${question}\n\nSet up a Gemini API key (free) in Settings for image analysis.` }
          }
          case 'code_review': {
            const filePath = tool.args.path
            const focus = tool.args.focus || 'all'
            const content = await fs.promises.readFile(filePath, 'utf-8')
            const ext = path.extname(filePath).toLowerCase()
            return { result: `Code to review (${focus} focus):\n\nFile: ${filePath}\nLanguage: ${ext}\nLines: ${content.split('\n').length}\n\n\`\`\`${ext.slice(1)}\n${content.slice(0, 8000)}${content.length > 8000 ? '\n... (truncated)' : ''}\n\`\`\`\n\nPlease analyze for: ${focus === 'all' ? 'bugs, security, performance, style, error handling, test coverage' : focus + ' issues'}` }
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
            const provider = tool.args.provider || 'pollinations'
            const prompt = tool.args.prompt || 'a beautiful sunset over mountains'
            if (provider === 'pollinations' || provider === 'wan') {
              return { result: `Video Generation (Pollinations - Free):\n\nPrompt: ${prompt}\n\n🎥 Video URL:\nhttps://video.pollinations.ai/prompt/${encodeURIComponent(prompt)}` }
            }
            if (provider === 'runway') return { result: `Runway Video:\n1. https://runwayml.com/\n2. Sign up for free tier\n3. Gen-3 Alpha for text-to-video\n\nPrompt: ${prompt}` }
            if (provider === 'kling') return { result: `Kling Video:\n1. https://klingai.com/\n2. Sign up for free credits\n\nPrompt: ${prompt}` }
            return { result: `Video options:\n1. pollinations — Free: https://video.pollinations.ai/prompt/${encodeURIComponent(prompt)}\n2. runway — Free tier at runwayml.com\n3. kling — Free credits at klingai.com` }
          }
          case 'comfyui_workflow': {
            return { result: `ComfyUI Workflow:\n\n1. git clone https://github.com/comfyanonymous/ComfyUI\n2. cd ComfyUI && pip install -r requirements.txt\n3. python main.py\n4. Open http://127.0.0.1:8188\n\nSupports: FLUX, SDXL, Wan, ControlNet, LoRA, Video.` }
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

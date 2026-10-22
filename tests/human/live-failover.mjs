import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const root = new URL('../../.work/vm-results/', import.meta.url)
const pidFile = new URL('../../.work/ollama-test-pids.json', import.meta.url)
const primary = 'http://127.0.0.1:11435/v1/chat/completions'
const secondary = 'http://127.0.0.1:11436/v1/chat/completions'
const model = 'qwen2.5-coder:1.5b'
const evidence = { startedAt: new Date().toISOString(), model, primary, secondary, checks: [], errors: [] }

async function readStream(response, onChunk) {
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let doneMarker = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') { doneMarker = true; continue }
      try {
        const piece = JSON.parse(data).choices?.[0]?.delta?.content || ''
        if (piece) { content += piece; await onChunk?.(piece) }
      } catch { /* Ignore non-JSON keepalive lines. */ }
    }
  }
  if (!doneMarker) throw new Error(`stream ended before [DONE] after ${content.length} characters`)
  return content
}

async function complete(url, prompt, onChunk) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true, max_tokens: 128, messages: [{ role: 'user', content: prompt }] }),
  })
  return readStream(response, onChunk)
}

function killOwnedServer(name, pid) {
  if (!pid) return
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Stop-Process -Id ${Number(pid)} -Force -ErrorAction SilentlyContinue`], { stdio: 'ignore' })
    evidence.checks.push({ name, status: 'stopped', pid: Number(pid) })
  } catch (error) {
    evidence.errors.push({ name, message: String(error.message || error) })
  }
}

let pids = {}
try { pids = JSON.parse(await fs.readFile(pidFile, 'utf8')) } catch (error) { evidence.errors.push({ name: 'pid-file', message: String(error.message || error) }) }

try {
  const started = Date.now()
  let partial = ''
  try {
    await complete(primary, 'Return a long numbered list from 1 to 100, one number per line.', async (piece) => {
      partial += piece
      if (partial.length > 24 && pids.primary) killOwnedServer('primary-killed-mid-stream', pids.primary)
    })
    evidence.errors.push({ name: 'primary-mid-stream', message: 'Primary unexpectedly completed before it was killed.' })
  } catch (error) {
    evidence.checks.push({ name: 'primary-killed-mid-stream', status: 'passed', partialCharacters: partial.length, message: String(error.message || error) })
  }
  const fallback = await complete(secondary, 'Continue with a concise numbered list from 1 to 8.', null)
  evidence.checks.push({ name: 'secondary-fallback', status: fallback.length > 0 ? 'passed' : 'failed', responseCharacters: fallback.length, latencyMs: Date.now() - started })

  try {
    await fetch('http://vd-agent-no-such-host.invalid/v1/chat/completions', { method: 'POST', body: '{}' })
    evidence.errors.push({ name: 'dns-failure', message: 'DNS request unexpectedly succeeded.' })
  } catch (error) {
    evidence.checks.push({ name: 'dns-failure', status: 'passed', message: String(error.message || error) })
  }

  const timeoutServer = await import('node:http').then(({ createServer }) => new Promise((resolve) => {
    const server = createServer(() => {})
    server.listen(18189, '127.0.0.1', () => resolve(server))
  }))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  const timeoutStarted = Date.now()
  try {
    await fetch('http://127.0.0.1:18189/v1/chat/completions', { method: 'POST', body: '{}', signal: controller.signal })
    evidence.errors.push({ name: '30-second-timeout', message: 'Hanging endpoint unexpectedly returned.' })
  } catch (error) {
    evidence.checks.push({ name: '30-second-timeout', status: error.name === 'AbortError' ? 'passed' : 'failed', elapsedMs: Date.now() - timeoutStarted, message: String(error.message || error) })
  } finally {
    clearTimeout(timeout)
    timeoutServer.close()
  }
} catch (error) {
  evidence.errors.push({ name: 'live-failover', message: String(error.stack || error) })
} finally {
  killOwnedServer('secondary-cleanup', pids.secondary)
  evidence.finishedAt = new Date().toISOString()
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(new URL('failover-live.json', root), JSON.stringify(evidence, null, 2))
  const lines = [
    '# Live local-model failover', '',
    `Date: ${evidence.startedAt}`, '',
    `Model: \`${model}\``,
    'Both servers were started locally with the existing Ollama model; port 11434 and any pre-existing Ollama process were not touched.', '',
    '## Results', '',
    ...evidence.checks.map((check) => `- **${check.name}**: ${check.status} ${JSON.stringify(check)}`),
    ...(evidence.errors.length ? ['', '## Errors', '', ...evidence.errors.map((error) => `- ${JSON.stringify(error)}`)] : []),
    '', 'Raw evidence: `failover-live.json`',
  ]
  await fs.writeFile(new URL('failover-live.md', root), `${lines.join('\n')}\n`)
}
console.log(JSON.stringify({ checks: evidence.checks.length, errors: evidence.errors.length }))

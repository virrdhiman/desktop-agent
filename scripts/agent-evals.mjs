/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Local AI-agent evaluation gate.
 *
 * This deliberately avoids hosted judge/trace products by default. It runs the
 * deterministic unit layer, typecheck, production build, and real Electron smoke
 * trajectory/visual checks against a throwaway profile.
 */
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from './local-env.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadLocalEnv(repo)
const goldenPath = path.join(repo, 'evals', 'agent-golden.json')
const smokePath = path.join(repo, 'scripts', 'smoke.mjs')
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))

function fail(message) {
  console.error(`\nAgent eval failed: ${message}`)
  process.exit(1)
}

function loadGolden() {
  if (!fs.existsSync(goldenPath)) fail(`missing ${path.relative(repo, goldenPath)}`)
  const data = JSON.parse(fs.readFileSync(goldenPath, 'utf8'))
  if (data.version !== 1) fail('unsupported golden dataset version')
  if (!Array.isArray(data.tiers) || data.tiers.length !== 3) fail('golden dataset must define exactly 3 tiers')
  if (!Array.isArray(data.cases) || data.cases.length === 0) fail('golden dataset has no cases')
  if (data.cases.length < Number(data.minimums?.goldenCases || 0)) {
    fail(`golden dataset has ${data.cases.length} cases, below baseline ${data.minimums.goldenCases}`)
  }

  const ids = new Set()
  const prompts = new Set()
  for (const testCase of data.cases) {
    if (!testCase.id || ids.has(testCase.id)) fail(`duplicate or missing case id: ${testCase.id}`)
    ids.add(testCase.id)
    if (![1, 2, 3].includes(testCase.tier)) fail(`${testCase.id}: invalid tier`)
    if (typeof testCase.prompt !== 'string' || !testCase.prompt.trim()) fail(`${testCase.id}: missing prompt`)
    const promptKey = testCase.prompt.trim().toLowerCase()
    if (prompts.has(promptKey)) fail(`${testCase.id}: duplicate prompt`)
    prompts.add(promptKey)
    if (!Array.isArray(testCase.checks) || testCase.checks.length === 0) fail(`${testCase.id}: missing checks`)
    if (!Array.isArray(testCase.coveredBy) || testCase.coveredBy.length === 0) fail(`${testCase.id}: missing coveredBy`)
    for (const relative of testCase.coveredBy) {
      const resolved = path.resolve(repo, relative)
      if (!resolved.startsWith(`${repo}${path.sep}`) || !fs.existsSync(resolved)) {
        fail(`${testCase.id}: coveredBy file does not exist: ${relative}`)
      }
    }
  }

  const tierCounts = Object.fromEntries([1, 2, 3].map((tier) => [tier, data.cases.filter((item) => item.tier === tier).length]))
  if (tierCounts[1] < 25 || tierCounts[2] < 10 || tierCounts[3] < 3) {
    fail(`golden tier coverage is too narrow: ${JSON.stringify(tierCounts)}`)
  }

  const smoke = fs.readFileSync(smokePath, 'utf8')
  for (const testCase of data.cases.filter((c) => c.marker)) {
    if (!smoke.includes(testCase.marker)) fail(`${testCase.id}: marker ${testCase.marker} is not covered by smoke.mjs`)
  }
  return data
}

function killProcessTree(pid) {
  if (!pid) return
  if (process.platform === 'win32') {
    try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }) } catch {}
    return
  }
  try { process.kill(-pid, 'SIGTERM') } catch {}
}

function run(label, command, args, opts = {}) {
  console.log(`\n== ${label} ==`)
  console.log(`${command} ${args.join(' ')}`)
  let executable = command
  let finalArgs = args
  if (process.platform === 'win32' && command === 'npm' && process.env.npm_execpath) {
    executable = process.execPath
    finalArgs = [process.env.npm_execpath, ...args]
  }
  return new Promise((resolve) => {
    const child = spawn(executable, finalArgs, {
      cwd: repo,
      env: { ...process.env, ...opts.env },
      detached: process.platform !== 'win32',
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeoutMs = opts.timeoutMs ?? 300_000
    const timer = setTimeout(() => {
      timedOut = true
      console.error(`\n${label} timed out after ${Math.round(timeoutMs / 1000)}s`)
      killProcessTree(child.pid)
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      const text = String(chunk)
      stdout += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      stderr += text
      process.stderr.write(text)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      fail(`${label} could not start: ${error.message}`)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) fail(`${label} timed out`)
      if (code !== 0) fail(`${label} exited with ${code ?? signal}`)
      resolve(`${stdout}\n${stderr}`)
    })
  })
}

function parseVitest(output, minimum) {
  const match = output.match(/Tests\s+(\d+)\s+passed/)
  if (!match) fail('could not find Vitest passed-test count')
  const count = Number(match[1])
  if (count < minimum) fail(`Vitest passed ${count} tests, below baseline ${minimum}`)
  return count
}

function parseSmoke(output, minimum) {
  const match = output.match(/(\d+)\/(\d+) checks passed/)
  if (!match) fail('could not find smoke passed-check count')
  const passed = Number(match[1])
  const total = Number(match[2])
  if (passed !== total) fail(`smoke only passed ${passed}/${total}`)
  if (total < minimum) fail(`smoke checks ${total}, below baseline ${minimum}`)
  return total
}

const golden = loadGolden()

console.log(`VD Agent AI evaluation gate (${pkg.name}@${pkg.version})`)
console.log(`Golden cases: ${golden.cases.length}`)
console.log(`Golden sources: ${golden.cases.filter((item) => item.source === 'real-user').length} real-user, ${golden.cases.filter((item) => item.source !== 'real-user').length} maintained regression cases`)
console.log('Borrowed idea, not code: golden tasks + trajectory checks + release smoke gates from public agent-eval practice.')

const testOutput = await run('Tier 1: functional/component tests', 'npm', ['test'])
const passedTests = parseVitest(testOutput, golden.minimums.vitestPassed)

await run('TypeScript contract check', 'npm', ['run', 'lint'])
await run('Production build', 'npm', ['run', 'build'])

const smokeOutput = await run('Tier 2+3: trajectory and visual smoke', 'node', ['scripts/smoke.mjs'], {
  timeoutMs: Number(process.env.AGENT_EVAL_SMOKE_TIMEOUT_MS || 480_000),
})
const smokeChecks = parseSmoke(smokeOutput, golden.minimums.smokeChecks)

if (process.env.VD_EVAL_TRACE_EXPORT === '1') {
  await run('Optional hosted-eval JSONL export', 'node', [
    'scripts/hosted-eval-export.mjs',
    '--provider',
    process.env.VD_EVAL_TRACE_PROVIDER || 'generic',
    '--out',
    process.env.VD_EVAL_TRACE_OUT || `evals/hosted/${process.env.VD_EVAL_TRACE_PROVIDER || 'generic'}-golden-evals.jsonl`,
  ])
}

console.log('\nAgent eval summary')
console.log(`- Tier 1 functional/component: ${passedTests} Vitest tests passed`)
console.log(`- Tier 2 trajectory/tool: covered by smoke mock-provider scenarios`)
console.log(`- Tier 3 visual/end-to-end: ${smokeChecks} smoke checks passed`)
console.log('- External hosted/vision frameworks: optional, documented/exportable but not required for release')

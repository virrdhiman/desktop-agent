/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Export the local golden eval dataset into portable JSONL records for optional
 * hosted dashboards. This script never uploads by itself; it prepares a clean
 * import artifact and checks whether the expected environment variables exist.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
const golden = JSON.parse(fs.readFileSync(path.join(repo, 'evals', 'agent-golden.json'), 'utf8'))

const args = new Map()
for (let i = 2; i < process.argv.length; i++) {
  const item = process.argv[i]
  if (!item.startsWith('--')) continue
  const [rawKey, inlineValue] = item.slice(2).split('=')
  const value = inlineValue ?? (process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i] ?? 'true')
  args.set(rawKey, value)
}

const provider = String(args.get('provider') || 'generic').toLowerCase()
if (!['generic', 'langsmith', 'arize'].includes(provider)) {
  console.error('Unsupported provider. Use --provider generic, langsmith, or arize.')
  process.exit(1)
}

function resolveInsideRepo(value) {
  const resolved = path.resolve(repo, value)
  if (resolved !== repo && !resolved.startsWith(`${repo}${path.sep}`)) {
    console.error(`Refusing to write outside the repository: ${value}`)
    process.exit(1)
  }
  return resolved
}

const outPath = resolveInsideRepo(String(args.get('out') || `evals/hosted/${provider}-golden-evals.jsonl`))

function envStatus() {
  if (provider === 'langsmith') {
    return {
      enabled: process.env.LANGSMITH_TRACING === 'true' || process.env.LANGCHAIN_TRACING_V2 === 'true',
      key: Boolean(process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY),
      project: Boolean(process.env.LANGSMITH_PROJECT),
      endpoint: Boolean(process.env.LANGSMITH_ENDPOINT),
    }
  }
  if (provider === 'arize') {
    return {
      key: Boolean(process.env.ARIZE_API_KEY || process.env.PHOENIX_API_KEY),
      space: Boolean(process.env.ARIZE_SPACE_ID),
      endpoint: Boolean(process.env.PHOENIX_COLLECTOR_ENDPOINT),
    }
  }
  return {}
}

function commonMetadata(testCase) {
  return {
    app: pkg.productName || pkg.name,
    appVersion: pkg.version,
    suite: golden.name,
    caseId: testCase.id,
    tier: testCase.tier,
    source: testCase.source || 'synthetic',
    marker: testCase.marker,
    coveredBy: testCase.coveredBy,
  }
}

function toRecord(testCase) {
  const metadata = commonMetadata(testCase)
  if (provider === 'langsmith') {
    return {
      id: testCase.id,
      inputs: { prompt: testCase.prompt },
      outputs: { acceptanceCriteria: testCase.checks },
      metadata,
    }
  }
  if (provider === 'arize') {
    return {
      id: testCase.id,
      'input.value': testCase.prompt,
      'output.value': testCase.checks.join('\n'),
      'metadata': metadata,
      'eval.expected_checks': testCase.checks,
    }
  }
  return {
    id: testCase.id,
    input: { messages: [{ role: 'user', content: testCase.prompt }] },
    expected: { checks: testCase.checks },
    metadata,
  }
}

const records = golden.cases.map(toRecord)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8')

console.log(`Exported ${records.length} ${provider} eval records to ${path.relative(repo, outPath)}`)
console.log(`Environment readiness: ${JSON.stringify(envStatus())}`)
console.log('No data was uploaded. Import this JSONL manually or wire it into a consented CI job.')

/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Upload the local golden eval dataset to an explicitly configured hosted
 * dashboard. This command is intentionally manual so VD Agent does not silently
 * send prompts, traces, code, or screenshots to a third party.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from './local-env.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadLocalEnv(repo)

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

const provider = String(args.get('provider') || '').toLowerCase()
const dryRun = args.get('dry-run') === 'true'
const limit = Number(args.get('limit') || golden.cases.length)

function fail(message) {
  console.error(`Hosted eval import failed: ${message}`)
  process.exit(1)
}

if (!['arize', 'langsmith'].includes(provider)) {
  fail('Use --provider arize or --provider langsmith.')
}

function configuredSecrets() {
  return Object.entries(process.env)
    .filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value && value.length >= 8)
    .map(([, value]) => value)
}

function redact(text) {
  let out = String(text || '')
  for (const secret of configuredSecrets()) out = out.split(secret).join('<redacted>')
  return out
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...options.headers,
    },
  })

  const bodyText = await response.text()
  let body = null
  if (bodyText) {
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = bodyText
    }
  }

  if (!response.ok) {
    const preview = redact(typeof body === 'string' ? body.slice(0, 800) : JSON.stringify(body).slice(0, 800))
    throw new Error(`${response.status} ${response.statusText}${preview ? `: ${preview}` : ''}`)
  }
  return body
}

function selectedCases() {
  const cases = golden.cases.slice(0, Number.isFinite(limit) && limit > 0 ? limit : golden.cases.length)
  if (!cases.length) fail('No golden cases selected.')
  return cases
}

function commonMetadata(testCase) {
  return {
    app: pkg.productName || pkg.name,
    appVersion: pkg.version,
    suite: golden.name,
    caseId: testCase.id,
    tier: testCase.tier,
    source: testCase.source || 'synthetic',
    marker: testCase.marker || null,
    coveredBy: testCase.coveredBy,
  }
}

async function importArize() {
  const apiKey = process.env.ARIZE_API_KEY || process.env.PHOENIX_API_KEY
  if (!apiKey) fail('ARIZE_API_KEY is missing. Add it to .env.local or your shell environment.')

  const baseUrl = (process.env.ARIZE_BASE_URL || 'https://api.arize.com/v2').replace(/\/$/, '')
  const datasetName = String(args.get('name') || process.env.ARIZE_DATASET_NAME || `VD Agent Golden Evals ${pkg.version}`)
  const datasetId = args.get('dataset-id')
  const spaceId = args.get('space-id') || process.env.ARIZE_SPACE_ID
  const cases = selectedCases()
  const examples = cases.map((testCase) => ({
    case_id: testCase.id,
    prompt: testCase.prompt,
    acceptance_criteria: testCase.checks,
    tier: testCase.tier,
    source: testCase.source || 'synthetic',
    marker: testCase.marker || null,
    covered_by: testCase.coveredBy,
    app_version: pkg.version,
    suite: golden.name,
  }))

  if (dryRun) {
    console.log(`Dry run: would upload ${examples.length} examples to Arize ${datasetId ? `dataset ${datasetId}` : `dataset "${datasetName}"`}.`)
    return
  }

  const authHeaders = { authorization: `Bearer ${apiKey}` }
  if (datasetId) {
    await requestJson(`${baseUrl}/datasets/${encodeURIComponent(datasetId)}/examples`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ examples }),
    })
    console.log(`Uploaded ${examples.length} examples to existing Arize dataset ${datasetId}.`)
    return
  }

  const resolvedSpaceId = String(spaceId || await inferArizeSpaceIdFromDatasets(baseUrl, authHeaders) || '').trim()
  if (!resolvedSpaceId) {
    fail('ARIZE_SPACE_ID is missing and could not be inferred from existing datasets. Add it to .env.local, pass --space-id, or copy it from the /spaces/{SPACE_ID}/... URL in Arize.')
  }

  const result = await requestJson(`${baseUrl}/datasets`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: datasetName, spaceId: resolvedSpaceId, examples }),
  })
  const createdId = result?.id || result?.dataset?.id || result?.data?.id || '<not returned>'
  console.log(`Created Arize dataset "${datasetName}" with ${examples.length} examples. Dataset id: ${createdId}`)
}

async function inferArizeSpaceIdFromDatasets(baseUrl, authHeaders) {
  try {
    const result = await requestJson(`${baseUrl}/datasets?limit=100`, { headers: authHeaders })
    const datasets = Array.isArray(result?.datasets) ? result.datasets : []
    const spaceIds = [...new Set(datasets.map((item) => item.spaceId || item.space_id).filter(Boolean))]
    if (spaceIds.length === 1) {
      console.log('Inferred ARIZE_SPACE_ID from existing Arize datasets.')
      return spaceIds[0]
    }
    if (spaceIds.length > 1) {
      fail(`Multiple Arize spaces were found from existing datasets (${spaceIds.length}). Pass --space-id or set ARIZE_SPACE_ID in .env.local.`)
    }
    return ''
  } catch {
    return ''
  }
}

async function importLangSmith() {
  const apiKey = process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY
  if (!apiKey) fail('LANGSMITH_API_KEY is missing. The Desktop Agent workbook did not include a LangSmith key.')

  const endpoint = (process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com').replace(/\/$/, '')
  const datasetName = String(args.get('name') || process.env.LANGSMITH_DATASET_NAME || `VD Agent Golden Evals ${pkg.version}`)
  const datasetIdArg = args.get('dataset-id')
  const cases = selectedCases()
  const headers = { 'x-api-key': apiKey }

  if (dryRun) {
    console.log(`Dry run: would upload ${cases.length} examples to LangSmith ${datasetIdArg ? `dataset ${datasetIdArg}` : `dataset "${datasetName}"`}.`)
    return
  }

  const dataset = datasetIdArg
    ? { id: datasetIdArg }
    : await requestJson(`${endpoint}/api/v1/datasets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: datasetName,
          description: `Golden eval prompts for ${pkg.productName || pkg.name}.`,
          metadata: { app: pkg.productName || pkg.name, appVersion: pkg.version, suite: golden.name },
        }),
      })

  const datasetId = dataset?.id
  if (!datasetId) fail('LangSmith did not return a dataset id. Pass --dataset-id for an existing dataset.')

  for (const testCase of cases) {
    await requestJson(`${endpoint}/api/v1/examples`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dataset_id: datasetId,
        inputs: { prompt: testCase.prompt },
        outputs: { acceptanceCriteria: testCase.checks },
        metadata: commonMetadata(testCase),
      }),
    })
  }
  console.log(`Uploaded ${cases.length} examples to LangSmith dataset ${datasetId}.`)
}

try {
  if (provider === 'arize') await importArize()
  if (provider === 'langsmith') await importLangSmith()
} catch (error) {
  fail(redact(error.message))
}

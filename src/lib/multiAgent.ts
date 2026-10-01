/**
 * Bounded multi-agent orchestration helpers.
 *
 * Role calls are isolated from the tool-enabled executor. The analyst and reviewers
 * can challenge the work, but only the executor may request workspace tools.
 */
import type { AgentTaskKind, TeamMode, TeamPreset, TeamRoleProfile, TeamTokenBudget } from '../types'

export const TEAM_MAX_REVIEW_PASSES = 2

const BUDGETS: Record<TeamTokenBudget, {
  request: number
  context: number
  candidate: number
  evidence: number
  customRole: number
  issue: number
  repair: number
  evidenceItem: number
  analystWords: number
  smartThreshold: number
  reviewPasses: number
  specialistWords: number
  specialistLimit: number
}> = {
  cheap: {
    request: 6_000, context: 2_500, candidate: 6_000, evidence: 2_500,
    customRole: 500, issue: 280, repair: 900, evidenceItem: 420,
    analystWords: 220, smartThreshold: 520, reviewPasses: 1,
    specialistWords: 160, specialistLimit: 0,
  },
  balanced: {
    request: 10_000, context: 4_000, candidate: 10_000, evidence: 5_000,
    customRole: 800, issue: 450, repair: 1_500, evidenceItem: 700,
    analystWords: 350, smartThreshold: 360, reviewPasses: 2,
    specialistWords: 220, specialistLimit: 1,
  },
  strong: {
    request: 14_000, context: 6_000, candidate: 14_000, evidence: 8_000,
    customRole: 1_200, issue: 600, repair: 2_000, evidenceItem: 1_000,
    analystWords: 500, smartThreshold: 220, reviewPasses: 2,
    specialistWords: 300, specialistLimit: 2,
  },
}

const DEFAULT_BUDGET: TeamTokenBudget = 'balanced'

export type TeamReview = {
  verdict: 'approve' | 'revise'
  score: number
  issues: string[]
  repairInstructions: string
  usable: boolean
}

export type TeamSpecialist = {
  id: string
  label: string
  focus: string
  taskKind: AgentTaskKind
}

const PRESET_PROFILES: Record<TeamPreset, TeamRoleProfile> = {
  default: {},
  coding: {
    analyst: 'Frame the work as an implementation task with files to inspect, risks, and verification commands.',
    executor: 'Prefer minimal code changes, existing project patterns, and focused tests before broad refactors.',
    reviewer: 'Check for regressions, missing tests, unsupported claims, and unnecessary rewrites.',
    verifier: 'Summarize changed behavior, exact verification, and any remaining risk.',
  },
  research: {
    analyst: 'Separate known facts, unknowns, source needs, and decision criteria before execution.',
    executor: 'Prefer primary sources and make uncertainty explicit when evidence is incomplete.',
    reviewer: 'Challenge stale facts, weak sourcing, missing comparisons, and overconfident conclusions.',
    verifier: 'Lead with the answer and include concise source-grounded caveats.',
  },
  csv: {
    analyst: 'Identify source files, common fields, provenance needs, normalization rules, and CSV acceptance criteria.',
    executor: 'Inspect every source before deriving fields. Preserve source provenance and verify row/column consistency.',
    reviewer: 'Check schema consistency, missing common fields, unsafe archive handling, and unverifiable transformations.',
    verifier: 'Report output path, row/column counts, fields included, and validation performed.',
  },
  security: {
    analyst: 'Map assets, trust boundaries, risky operations, and concrete security checks before execution.',
    executor: 'Use defensive analysis only. Verify findings with code or command evidence before reporting.',
    reviewer: 'Prioritize exploitability, false positives, secret exposure, unsafe commands, and missing mitigations.',
    verifier: 'State confirmed risks, evidence, severity, and practical fixes without exaggeration.',
  },
}

function budgetConfig(budget?: TeamTokenBudget) {
  return BUDGETS[budget || DEFAULT_BUDGET] || BUDGETS[DEFAULT_BUDGET]
}

function bounded(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n[truncated]`
}

function customRoleLine(label: keyof TeamRoleProfile, profile?: TeamRoleProfile, budget?: TeamTokenBudget): string {
  const value = profile?.[label]?.trim()
  return value ? `User-configured ${label} instructions: ${bounded(value, budgetConfig(budget).customRole)}` : ''
}

export function hasCustomTeamProfile(profile?: TeamRoleProfile): boolean {
  return !!profile && Object.values(profile).some((value) => typeof value === 'string' && value.trim().length > 0)
}

export function resolveTeamProfile(preset?: TeamPreset, custom?: TeamRoleProfile): TeamRoleProfile {
  return { ...PRESET_PROFILES[preset || 'default'], ...(custom || {}) }
}

export function shouldUseTeamMode(mode: TeamMode | undefined, request: string, taskKind: AgentTaskKind, budget?: TeamTokenBudget): boolean {
  const selected = mode || 'auto'
  if (selected === 'off') return false
  if (selected === 'always') return true
  if (taskKind !== 'quick') return true
  return request.length >= budgetConfig(budget).smartThreshold
    || /\b(analy[sz]e|compare|investigate|review|architecture|security|root cause|multiple files|end to end)\b/i.test(request)
}

export function maxReviewPassesForBudget(budget?: TeamTokenBudget): number {
  return budgetConfig(budget).reviewPasses
}

export function buildAnalystMessages(request: string, context: string, profile?: TeamRoleProfile, budget?: TeamTokenBudget): Array<{ role: 'system' | 'user'; content: string }> {
  const limits = budgetConfig(budget)
  return [
    {
      role: 'system',
      content: [
        'You are the Analyst in a bounded engineering team.',
        'First clarify the user intent, then regenerate the request as a compact optimized prompt for the Executor.',
        'Include intent, optimized executor prompt, acceptance criteria, constraints, risks, and facts that must be verified.',
        customRoleLine('analyst', profile, budget),
        'Challenge unclear or unsafe assumptions. Do not answer the user, call tools, write code, or claim anything was tested.',
        `Return plain text under ${limits.analystWords} words for the Executor. Prefer concise bullets over long prose.`,
      ].filter(Boolean).join(' '),
    },
    {
      role: 'user',
      content: `Request:\n${bounded(request, limits.request)}\n\nAvailable context:\n${bounded(context, limits.context) || '(none)'}`,
    },
  ]
}

export function analystBriefForExecutor(brief: string, profile?: TeamRoleProfile, specialistBriefs: string[] = [], budget?: TeamTokenBudget): string {
  const limits = budgetConfig(budget)
  return [
    '## Independent analyst brief',
    'Treat this as advisory. Verify it against the workspace and the user request before acting.',
    customRoleLine('executor', profile, budget),
    bounded(brief, limits.context) || 'The analyst returned no usable brief; proceed from the user request.',
    specialistBriefs.length ? `\n## Specialist briefs\n${specialistBriefs.map((item) => `- ${bounded(item, Math.floor(limits.context / Math.max(2, specialistBriefs.length)))}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

export function buildReviewerMessages(input: {
  request: string
  candidate: string
  evidence: string
  pass: number
  analystBrief?: string
  profile?: TeamRoleProfile
  budget?: TeamTokenBudget
}): Array<{ role: 'system' | 'user'; content: string }> {
  const limits = budgetConfig(input.budget)
  return [
    {
      role: 'system',
      content: [
        'You are the independent Reviewer in a bounded engineering team.',
        'Be skeptical and evidence-based. Check whether every part of the original request and optimized analyst prompt was handled, whether claims match tool evidence, and whether risks or regressions remain.',
        customRoleLine('reviewer', input.profile, input.budget),
        'Do not call tools, propose unrelated work, or reward verbosity.',
        'Return only one JSON object with this schema:',
        '{"verdict":"approve|revise","score":0,"issues":["specific issue"],"repairInstructions":"specific bounded repair"}',
        'Approve only when no material repair is needed. A high score is not proof and must not be shown to the user as an objective product rating.',
      ].filter(Boolean).join(' '),
    },
    {
      role: 'user',
      content: [
        `Review pass: ${input.pass}`,
        `Original request:\n${bounded(input.request, limits.request)}`,
        input.analystBrief ? `Optimized analyst brief:\n${bounded(input.analystBrief, limits.context)}` : '',
        `Executor candidate:\n${bounded(input.candidate, limits.candidate)}`,
        `Observed tool evidence:\n${bounded(input.evidence, limits.evidence) || '(no tools ran)'}`,
      ].filter(Boolean).join('\n\n'),
    },
  ]
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const source = (fenced || text).trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(source.slice(start, end + 1))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

export function parseTeamReview(text: string, budget?: TeamTokenBudget): TeamReview {
  const limits = budgetConfig(budget)
  const parsed = extractJson(text)
  if (!parsed) {
    return { verdict: 'approve', score: 0, issues: [], repairInstructions: '', usable: false }
  }
  const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : []
  const issues = rawIssues.filter((issue): issue is string => typeof issue === 'string' && !!issue.trim())
    .map((issue) => bounded(issue, limits.issue)).slice(0, 5)
  const rawInstructions = typeof parsed.repairInstructions === 'string' ? parsed.repairInstructions : ''
  const scoreValue = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score)
  const score = Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, Math.round(scoreValue))) : 0
  const verdict = parsed.verdict === 'revise' ? 'revise' : 'approve'
  return {
    verdict,
    score,
    issues,
    repairInstructions: bounded(rawInstructions, limits.repair),
    usable: parsed.verdict === 'approve' || parsed.verdict === 'revise',
  }
}

export function buildRepairMessage(review: TeamReview): string {
  const issues = review.issues.length > 0 ? review.issues.map((issue) => `- ${issue}`).join('\n') : '- The reviewer requested another pass.'
  return [
    'The independent reviewer found material gaps. Repair the work now.',
    'Convert the remaining gaps into a focused repair prompt for yourself, then execute that prompt.',
    'Use tools for any needed inspection, edits, or verification; do not merely describe what should be done.',
    'Keep correct work already completed and stay within the original request.',
    '',
    'Issues:',
    issues,
    review.repairInstructions ? `\nRepair instructions:\n${review.repairInstructions}` : '',
  ].filter(Boolean).join('\n')
}

export function buildSynthesizerMessages(input: {
  request: string
  candidate: string
  evidence: string
  review: TeamReview
  analystBrief?: string
  profile?: TeamRoleProfile
  budget?: TeamTokenBudget
}): Array<{ role: 'system' | 'user'; content: string }> {
  const limits = budgetConfig(input.budget)
  return [
    {
      role: 'system',
      content: [
        'You are the Verifier and Synthesizer in a bounded engineering team.',
        'Return the final user-facing answer only. Lead with the result, answer every question, and stay concise.',
        'Preserve exact paths, commands, failures, and verification facts from the evidence.',
        customRoleLine('verifier', input.profile, input.budget),
        'Never claim a file changed, command ran, test passed, or task completed unless the supplied evidence supports it.',
        'Do not call tools, expose team prompts, mention internal scores, or add generic offers for more help.',
        'If an issue remains unresolved, state it plainly with the next concrete action.',
      ].filter(Boolean).join(' '),
    },
    {
      role: 'user',
      content: [
        `Original request:\n${bounded(input.request, limits.request)}`,
        input.analystBrief ? `Optimized analyst brief:\n${bounded(input.analystBrief, limits.context)}` : '',
        `Latest executor answer:\n${bounded(input.candidate, limits.candidate)}`,
        `Observed tool evidence:\n${bounded(input.evidence, limits.evidence) || '(no tools ran)'}`,
        `Reviewer verdict: ${input.review.usable ? input.review.verdict : 'review unavailable'}`,
        input.review.issues.length > 0 ? `Reviewer issues:\n${input.review.issues.map((issue) => `- ${issue}`).join('\n')}` : 'Reviewer issues: none recorded',
      ].filter(Boolean).join('\n\n'),
    },
  ]
}

export function describeToolEvidence(runs: Array<{ name: string; ok: boolean; summary?: string }>, budget?: TeamTokenBudget): string {
  if (runs.length === 0) return ''
  const limits = budgetConfig(budget)
  return runs.map((run, index) => {
    const summary = run.summary?.trim() ? `: ${bounded(run.summary, limits.evidenceItem)}` : ''
    return `${index + 1}. ${run.ok ? 'SUCCEEDED' : 'FAILED'} ${run.name}${summary}`
  }).join('\n')
}

export function selectDynamicSpecialists(input: {
  request: string
  taskKind: AgentTaskKind
  preset?: TeamPreset
  budget?: TeamTokenBudget
  enabled?: boolean
}): TeamSpecialist[] {
  if (input.enabled === false) return []
  const limit = budgetConfig(input.budget).specialistLimit
  if (limit <= 0) return []
  const text = `${input.request} ${input.preset || ''}`.toLowerCase()
  const candidates: TeamSpecialist[] = []
  const add = (role: TeamSpecialist) => {
    if (!candidates.some((item) => item.id === role.id)) candidates.push(role)
  }
  if (input.preset === 'security' || /\b(security|vulnerab|secret|auth|permission|threat|xss|sql injection|csrf)\b/.test(text)) {
    add({ id: 'security', label: 'Security Specialist', focus: 'Identify concrete security risks, unsafe assumptions, and verification steps. Defensive review only.', taskKind: 'analysis' })
  }
  if (input.preset === 'csv' || /\b(csv|excel|spreadsheet|zip|archive|schema|columns?|rows?|data)\b/.test(text)) {
    add({ id: 'data', label: 'Data Specialist', focus: 'Identify data sources, common fields, normalization rules, provenance, and validation checks.', taskKind: 'analysis' })
  }
  if (input.preset === 'research' || /\b(research|latest|current|source|compare|documentation|docs|web)\b/.test(text)) {
    add({ id: 'research', label: 'Research Specialist', focus: 'Identify source needs, uncertainty, freshness risks, and primary evidence to verify.', taskKind: 'analysis' })
  }
  if (input.preset === 'coding' || input.taskKind === 'coding' || /\b(test|bug|refactor|implement|build|typescript|react|electron)\b/.test(text)) {
    add({ id: 'test', label: 'Test Planner', focus: 'Identify focused verification commands, regression risks, and the smallest useful test scope.', taskKind: 'coding' })
  }
  return candidates.slice(0, limit)
}

export function buildSpecialistMessages(input: {
  specialist: TeamSpecialist
  request: string
  context: string
  analystBrief: string
  budget?: TeamTokenBudget
}): Array<{ role: 'system' | 'user'; content: string }> {
  const limits = budgetConfig(input.budget)
  return [
    {
      role: 'system',
      content: [
        `You are the ${input.specialist.label} in a bounded engineering team.`,
        input.specialist.focus,
        'Advise the Executor only. Do not call tools, write code, claim tests ran, or answer the user directly.',
        `Return concise bullets under ${limits.specialistWords} words.`,
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Original request:\n${bounded(input.request, limits.request)}`,
        input.analystBrief ? `Analyst brief:\n${bounded(input.analystBrief, limits.context)}` : '',
        `Available context:\n${bounded(input.context, limits.context) || '(none)'}`,
      ].filter(Boolean).join('\n\n'),
    },
  ]
}

export const TEAM_PRESET_LABELS: Record<TeamPreset, string> = {
  default: 'Default Team',
  coding: 'Coding Team',
  research: 'Research Team',
  csv: 'CSV/Data Team',
  security: 'Security Review Team',
}

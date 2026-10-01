/**
 * Bounded multi-agent orchestration helpers.
 *
 * Role calls are isolated from the tool-enabled executor. The analyst and reviewers
 * can challenge the work, but only the executor may request workspace tools.
 */
import type { AgentTaskKind, TeamMode, TeamRoleProfile } from '../types'

export const TEAM_MAX_REVIEW_PASSES = 2

const MAX_REQUEST_CHARS = 10_000
const MAX_CONTEXT_CHARS = 4_000
const MAX_CANDIDATE_CHARS = 10_000
const MAX_EVIDENCE_CHARS = 5_000

export type TeamReview = {
  verdict: 'approve' | 'revise'
  score: number
  issues: string[]
  repairInstructions: string
  usable: boolean
}

function bounded(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n[truncated]`
}

function customRoleLine(label: keyof TeamRoleProfile, profile?: TeamRoleProfile): string {
  const value = profile?.[label]?.trim()
  return value ? `User-configured ${label} instructions: ${bounded(value, 800)}` : ''
}

export function hasCustomTeamProfile(profile?: TeamRoleProfile): boolean {
  return !!profile && Object.values(profile).some((value) => typeof value === 'string' && value.trim().length > 0)
}

export function shouldUseTeamMode(mode: TeamMode | undefined, request: string, taskKind: AgentTaskKind): boolean {
  const selected = mode || 'auto'
  if (selected === 'off') return false
  if (selected === 'always') return true
  if (taskKind !== 'quick') return true
  return request.length >= 360
    || /\b(analy[sz]e|compare|investigate|review|architecture|security|root cause|multiple files|end to end)\b/i.test(request)
}

export function buildAnalystMessages(request: string, context: string, profile?: TeamRoleProfile): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: [
        'You are the Analyst in a bounded engineering team.',
        'First clarify the user intent, then regenerate the request as a compact optimized prompt for the Executor.',
        'Include intent, optimized executor prompt, acceptance criteria, constraints, risks, and facts that must be verified.',
        customRoleLine('analyst', profile),
        'Challenge unclear or unsafe assumptions. Do not answer the user, call tools, write code, or claim anything was tested.',
        'Return plain text under 350 words for the Executor. Prefer concise bullets over long prose.',
      ].filter(Boolean).join(' '),
    },
    {
      role: 'user',
      content: `Request:\n${bounded(request, MAX_REQUEST_CHARS)}\n\nAvailable context:\n${bounded(context, MAX_CONTEXT_CHARS) || '(none)'}`,
    },
  ]
}

export function analystBriefForExecutor(brief: string, profile?: TeamRoleProfile): string {
  return [
    '## Independent analyst brief',
    'Treat this as advisory. Verify it against the workspace and the user request before acting.',
    customRoleLine('executor', profile),
    bounded(brief, MAX_CONTEXT_CHARS) || 'The analyst returned no usable brief; proceed from the user request.',
  ].filter(Boolean).join('\n')
}

export function buildReviewerMessages(input: {
  request: string
  candidate: string
  evidence: string
  pass: number
  analystBrief?: string
  profile?: TeamRoleProfile
}): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: [
        'You are the independent Reviewer in a bounded engineering team.',
        'Be skeptical and evidence-based. Check whether every part of the original request and optimized analyst prompt was handled, whether claims match tool evidence, and whether risks or regressions remain.',
        customRoleLine('reviewer', input.profile),
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
        `Original request:\n${bounded(input.request, MAX_REQUEST_CHARS)}`,
        input.analystBrief ? `Optimized analyst brief:\n${bounded(input.analystBrief, MAX_CONTEXT_CHARS)}` : '',
        `Executor candidate:\n${bounded(input.candidate, MAX_CANDIDATE_CHARS)}`,
        `Observed tool evidence:\n${bounded(input.evidence, MAX_EVIDENCE_CHARS) || '(no tools ran)'}`,
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

export function parseTeamReview(text: string): TeamReview {
  const parsed = extractJson(text)
  if (!parsed) {
    return { verdict: 'approve', score: 0, issues: [], repairInstructions: '', usable: false }
  }
  const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : []
  const issues = rawIssues.filter((issue): issue is string => typeof issue === 'string' && !!issue.trim())
    .map((issue) => bounded(issue, 450)).slice(0, 5)
  const rawInstructions = typeof parsed.repairInstructions === 'string' ? parsed.repairInstructions : ''
  const scoreValue = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score)
  const score = Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, Math.round(scoreValue))) : 0
  const verdict = parsed.verdict === 'revise' ? 'revise' : 'approve'
  return {
    verdict,
    score,
    issues,
    repairInstructions: bounded(rawInstructions, 1_500),
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
}): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: [
        'You are the Verifier and Synthesizer in a bounded engineering team.',
        'Return the final user-facing answer only. Lead with the result, answer every question, and stay concise.',
        'Preserve exact paths, commands, failures, and verification facts from the evidence.',
        customRoleLine('verifier', input.profile),
        'Never claim a file changed, command ran, test passed, or task completed unless the supplied evidence supports it.',
        'Do not call tools, expose team prompts, mention internal scores, or add generic offers for more help.',
        'If an issue remains unresolved, state it plainly with the next concrete action.',
      ].filter(Boolean).join(' '),
    },
    {
      role: 'user',
      content: [
        `Original request:\n${bounded(input.request, MAX_REQUEST_CHARS)}`,
        input.analystBrief ? `Optimized analyst brief:\n${bounded(input.analystBrief, MAX_CONTEXT_CHARS)}` : '',
        `Latest executor answer:\n${bounded(input.candidate, MAX_CANDIDATE_CHARS)}`,
        `Observed tool evidence:\n${bounded(input.evidence, MAX_EVIDENCE_CHARS) || '(no tools ran)'}`,
        `Reviewer verdict: ${input.review.usable ? input.review.verdict : 'review unavailable'}`,
        input.review.issues.length > 0 ? `Reviewer issues:\n${input.review.issues.map((issue) => `- ${issue}`).join('\n')}` : 'Reviewer issues: none recorded',
      ].filter(Boolean).join('\n\n'),
    },
  ]
}

export function describeToolEvidence(runs: Array<{ name: string; ok: boolean; summary?: string }>): string {
  if (runs.length === 0) return ''
  return runs.map((run, index) => {
    const summary = run.summary?.trim() ? `: ${bounded(run.summary, 700)}` : ''
    return `${index + 1}. ${run.ok ? 'SUCCEEDED' : 'FAILED'} ${run.name}${summary}`
  }).join('\n')
}

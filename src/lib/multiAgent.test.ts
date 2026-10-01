import { describe, expect, it } from 'vitest'
import {
  analystBriefForExecutor, buildAnalystMessages, buildRepairMessage, buildReviewerMessages,
  buildSpecialistMessages, buildSynthesizerMessages, describeToolEvidence, hasCustomTeamProfile,
  maxReviewPassesForBudget, parseTeamReview, resolveTeamProfile, selectDynamicSpecialists, shouldUseTeamMode,
} from './multiAgent'

describe('team routing', () => {
  it('keeps quick chat cheap in auto mode and routes substantial work to the team', () => {
    expect(shouldUseTeamMode('auto', 'Hello', 'quick')).toBe(false)
    expect(shouldUseTeamMode('auto', 'x'.repeat(320), 'quick')).toBe(false)
    expect(shouldUseTeamMode('auto', 'x'.repeat(380), 'quick')).toBe(true)
    expect(shouldUseTeamMode('auto', 'x'.repeat(380), 'quick', 'cheap')).toBe(false)
    expect(shouldUseTeamMode('auto', 'x'.repeat(380), 'quick', 'strong')).toBe(true)
    expect(shouldUseTeamMode('auto', 'Review the architecture and investigate security risks.', 'analysis')).toBe(true)
    expect(shouldUseTeamMode('always', 'Hello', 'quick')).toBe(true)
    expect(shouldUseTeamMode('off', 'Implement and test this feature', 'coding')).toBe(false)
    expect(maxReviewPassesForBudget('cheap')).toBe(1)
    expect(maxReviewPassesForBudget('balanced')).toBe(2)
  })
})

describe('team prompts', () => {
  it('keeps analyst and reviewer roles read-only and evidence oriented', () => {
    const analyst = buildAnalystMessages('Fix the bug', 'Workspace: C:/repo')
    expect(analyst[0].content).toMatch(/Do not answer the user, call tools, write code/)
    expect(analyst[0].content).toMatch(/optimized prompt for the Executor/)
    expect(analyst[1].content).toContain('Fix the bug')
    expect(analystBriefForExecutor('Check the parser')).toMatch(/advisory[\s\S]*Check the parser/)

    const reviewer = buildReviewerMessages({ request: 'Fix it', candidate: 'Done', evidence: '', pass: 1 })
    expect(reviewer[0].content).toContain('evidence-based')
    expect(reviewer[0].content).toContain('Return only one JSON object')
  })

  it('layers custom roles without removing enforced safety instructions', () => {
    const profile = {
      analyst: 'Prefer root-cause framing.',
      executor: 'Favor tests before refactors.',
      reviewer: 'Block vague completion claims.',
      verifier: 'Use concise release-note style.',
    }
    expect(hasCustomTeamProfile(profile)).toBe(true)
    expect(hasCustomTeamProfile({ analyst: '   ' })).toBe(false)

    const analyst = buildAnalystMessages('Improve the app', '', profile)
    expect(analyst[0].content).toContain('Prefer root-cause framing.')
    expect(analyst[0].content).toContain('Do not answer the user')

    const executor = analystBriefForExecutor('Optimized prompt', profile)
    expect(executor).toContain('Favor tests before refactors.')

    const reviewer = buildReviewerMessages({ request: 'Improve it', candidate: 'Done', evidence: '', pass: 1, analystBrief: 'Optimized prompt', profile })
    expect(reviewer[0].content).toContain('Block vague completion claims.')
    expect(reviewer[1].content).toContain('Optimized analyst brief')

    const verifier = buildSynthesizerMessages({
      request: 'Improve it',
      candidate: 'Done',
      evidence: '',
      analystBrief: 'Optimized prompt',
      review: { verdict: 'approve', score: 90, issues: [], repairInstructions: '', usable: true },
      profile,
    })
    expect(verifier[0].content).toContain('Use concise release-note style.')
    expect(verifier[0].content).toContain('Never claim a file changed')
  })

  it('merges saved presets with custom role overrides', () => {
    const profile = resolveTeamProfile('security', { reviewer: 'Also check desktop permission bypasses.' })
    expect(profile.analyst).toMatch(/trust boundaries/)
    expect(profile.reviewer).toBe('Also check desktop permission bypasses.')
  })

  it('selects bounded dynamic specialists and keeps them read-only', () => {
    expect(selectDynamicSpecialists({
      request: 'Implement CSV extraction and check security risks with tests',
      taskKind: 'coding',
      preset: 'default',
      budget: 'balanced',
      enabled: true,
    }).map((role) => role.label)).toEqual(['Security Specialist'])

    const strong = selectDynamicSpecialists({
      request: 'Implement CSV extraction and check security risks with tests',
      taskKind: 'coding',
      preset: 'csv',
      budget: 'strong',
      enabled: true,
    })
    expect(strong.map((role) => role.label)).toEqual(['Security Specialist', 'Data Specialist'])

    const messages = buildSpecialistMessages({
      specialist: strong[0],
      request: 'Check auth',
      context: 'Workspace',
      analystBrief: 'Need review',
      budget: 'cheap',
    })
    expect(messages[0].content).toContain('Do not call tools')
    expect(messages[0].content).toContain('under 160 words')
    expect(selectDynamicSpecialists({ request: 'security', taskKind: 'analysis', budget: 'strong', enabled: false })).toEqual([])
  })

  it('instructs the synthesizer not to invent execution evidence', () => {
    const messages = buildSynthesizerMessages({
      request: 'Fix it', candidate: 'Done', evidence: '',
      review: { verdict: 'approve', score: 80, issues: [], repairInstructions: '', usable: true },
    })
    expect(messages[0].content).toMatch(/Never claim a file changed, command ran, test passed/)
    expect(messages[0].content).toMatch(/Do not call tools/)
  })
})

describe('team review parsing', () => {
  it('parses fenced JSON and clamps unsafe values', () => {
    expect(parseTeamReview('```json\n{"verdict":"revise","score":120,"issues":["Missing tests"],"repairInstructions":"Run tests"}\n```'))
      .toEqual({ verdict: 'revise', score: 100, issues: ['Missing tests'], repairInstructions: 'Run tests', usable: true })
  })

  it('fails open to the executor answer when a weak reviewer returns junk', () => {
    expect(parseTeamReview('Looks good to me.')).toEqual({
      verdict: 'approve', score: 0, issues: [], repairInstructions: '', usable: false,
    })
  })

  it('builds a bounded repair request and concise evidence list', () => {
    const review = parseTeamReview('{"verdict":"revise","score":55,"issues":["No test evidence"],"repairInstructions":"Run the focused test."}')
    expect(buildRepairMessage(review)).toMatch(/Repair the work now[\s\S]*No test evidence[\s\S]*Run the focused test/)
    expect(describeToolEvidence([
      { name: 'read_file', ok: true, summary: 'export const value = 1' },
      { name: 'run_command', ok: false, summary: 'exit code 1' },
    ])).toBe('1. SUCCEEDED read_file: export const value = 1\n2. FAILED run_command: exit code 1')
    expect(describeToolEvidence([{ name: 'read_file', ok: true, summary: 'x'.repeat(800) }], 'cheap')).toContain('[truncated]')
  })
})

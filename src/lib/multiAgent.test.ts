import { describe, expect, it } from 'vitest'
import {
  analystBriefForExecutor, buildAnalystMessages, buildRepairMessage, buildReviewerMessages,
  buildSynthesizerMessages, describeToolEvidence, parseTeamReview, shouldUseTeamMode,
} from './multiAgent'

describe('team routing', () => {
  it('keeps quick chat cheap in auto mode and routes substantial work to the team', () => {
    expect(shouldUseTeamMode('auto', 'Hello', 'quick')).toBe(false)
    expect(shouldUseTeamMode('auto', 'Review the architecture and investigate security risks.', 'analysis')).toBe(true)
    expect(shouldUseTeamMode('always', 'Hello', 'quick')).toBe(true)
    expect(shouldUseTeamMode('off', 'Implement and test this feature', 'coding')).toBe(false)
  })
})

describe('team prompts', () => {
  it('keeps analyst and reviewer roles read-only and evidence oriented', () => {
    const analyst = buildAnalystMessages('Fix the bug', 'Workspace: C:/repo')
    expect(analyst[0].content).toMatch(/Do not answer the user, call tools, write code/)
    expect(analyst[1].content).toContain('Fix the bug')
    expect(analystBriefForExecutor('Check the parser')).toMatch(/advisory[\s\S]*Check the parser/)

    const reviewer = buildReviewerMessages({ request: 'Fix it', candidate: 'Done', evidence: '', pass: 1 })
    expect(reviewer[0].content).toContain('evidence-based')
    expect(reviewer[0].content).toContain('Return only one JSON object')
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
  })
})

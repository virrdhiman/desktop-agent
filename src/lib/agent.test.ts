import { describe, it, expect } from 'vitest'
import {
  MAX_CONTEXT_FILE_CHARS, MAX_TOOL_RESULT_CHARS, TOOL_SYSTEM_PROMPT,
  assessResponse, buildContext, buildHistory, buildSystemPrompt, classifyProviderError, cleanResponse,
  correctionMessage, describeAuthFailure, describeFallback, describeProviderFailure, followUpMessage,
  formatToolResult, maxRoundsNotice, missingKeyNotice, noProviderNotice, parseToolCalls,
  resolveWorkspacePath, toolFailureHint, unusableResponseNotice, unverifiedClaims, unverifiedClaimsMessage,
  unverifiedClaimsNotice,
} from './agent'

const FENCE = '```'
const toolBlock = (json: string) => `${FENCE}tool\n${json}\n${FENCE}`

describe('system prompt', () => {
  it('bans filler openers and closers', () => {
    expect(TOOL_SYSTEM_PROMPT).toMatch(/No preamble/)
    expect(TOOL_SYSTEM_PROMPT).toContain('Great question')
    expect(TOOL_SYSTEM_PROMPT).toContain('I hope this helps')
  })

  it('limits questions to ones that change the work', () => {
    expect(TOOL_SYSTEM_PROMPT).toMatch(/Ask only when the answer changes what you would do/)
    expect(TOOL_SYSTEM_PROMPT).toMatch(/Never ask permission for read-only steps/)
    expect(TOOL_SYSTEM_PROMPT).toMatch(/at most two questions/)
  })

  it('requires failed tools to be explained and next steps to be concrete', () => {
    expect(TOOL_SYSTEM_PROMPT).toMatch(/## When a tool fails/)
    expect(TOOL_SYSTEM_PROMPT).toMatch(/which tool failed, the error in one line, and the likely cause/)
    expect(TOOL_SYSTEM_PROMPT).toMatch(/Never claim success for a step whose tool call failed/)
    expect(TOOL_SYSTEM_PROMPT).toMatch(/"Next steps:" and one to three concrete actions/)
  })

  it('forbids unverified claims and invented output', () => {
    expect(TOOL_SYSTEM_PROMPT).toMatch(/Never say something is done, fixed, or passing unless a tool result/)
    expect(TOOL_SYSTEM_PROMPT).toMatch(/Never invent file contents, APIs, command output, or test results/)
  })

  it('adds session mode, context, and trimmed user rules', () => {
    const prompt = buildSystemPrompt({ planMode: true, context: 'Workspace: /repo', customRules: '  Use tabs  ' })
    expect(prompt).toContain('Plan Mode is ON')
    expect(prompt).toContain('## Context\nWorkspace: /repo')
    expect(prompt).toContain('## User rules\nUse tabs')
    expect(buildSystemPrompt({ planMode: false, context: '', customRules: '   ' })).not.toContain('## User rules')
  })
})

describe('buildContext', () => {
  it('explains that relative paths resolve against the workspace', () => {
    expect(buildContext({ workspacePath: '/repo' })).toMatch(/Workspace: \/repo\nRelative tool paths resolve here/)
  })

  it('tells the model when no workspace is open', () => {
    expect(buildContext({})).toMatch(/No workspace folder is open/)
  })

  it('marks a truncated editor file instead of silently cutting it', () => {
    const content = 'a'.repeat(MAX_CONTEXT_FILE_CHARS + 500)
    const ctx = buildContext({ workspacePath: '/repo', selectedFile: '/repo/big.ts', fileContent: content })
    expect(ctx).toContain(`showing the first ${MAX_CONTEXT_FILE_CHARS} of ${content.length} characters; use read_file for the rest`)
    expect(buildContext({ selectedFile: '/repo/small.ts', fileContent: 'x' })).not.toContain('showing the first')
  })
})

describe('buildHistory', () => {
  it('drops UI notices and collapses old tool blocks into short notes', () => {
    const history = buildHistory([
      { role: 'user', content: 'fix it' },
      { role: 'system', content: 'Groq failed, so this answer came from Gemini.' },
      { role: 'assistant', content: `Checking.\n${toolBlock('{"name":"read_file","args":{"path":"src/a.ts"}}')}` },
      { role: 'assistant', content: toolBlock('{broken') },
    ])
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant'])
    expect(history[1].content).toBe('Checking.\n[called read_file {"path":"src/a.ts"}]')
    expect(history[2].content).toBe('[malformed tool call]')
  })

  it('keeps the newest messages within the character budget, always including the latest', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `${i}`.repeat(1000) }))
    const history = buildHistory(msgs, 20, 3500)
    expect(history).toHaveLength(3)
    expect(history[2].content.startsWith('9')).toBe(true)
    expect(buildHistory([{ role: 'user', content: 'x'.repeat(5000) }], 20, 10)).toHaveLength(1)
  })

  it('caps the number of messages', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `m${i}` }))
    const history = buildHistory(msgs, 20)
    expect(history).toHaveLength(20)
    expect(history[0].content).toBe('m10')
  })
})

describe('parseToolCalls', () => {
  it('parses valid blocks, including CRLF and several per reply', () => {
    const content = `a\r\n${FENCE}tool\r\n{"name":"read_file","args":{"path":"x"}}\r\n${FENCE}\n${toolBlock('{"name":"git_status"}')}`
    const { calls, errors } = parseToolCalls(content)
    expect(calls).toEqual([{ name: 'read_file', args: { path: 'x' } }, { name: 'git_status', args: {} }])
    expect(errors).toEqual([])
  })

  it('reports malformed JSON and missing names instead of dropping them silently', () => {
    const { calls, errors } = parseToolCalls(`${toolBlock('{not json}')}\n${toolBlock('{"args":{}}')}`)
    expect(calls).toEqual([])
    expect(errors[0]).toMatch(/^Tool block 1 is not valid JSON/)
    expect(errors[1]).toMatch(/^Tool block 2 has no "name" field/)
    for (const e of errors) expect(e).toContain('Resend it as one JSON object')
  })

  it('reports an unclosed tool block', () => {
    expect(parseToolCalls('```tool\n{"name":"read_file"').errors[0]).toMatch(/not closed/)
  })
})

describe('formatToolResult', () => {
  it('labels failures and explains the likely cause', () => {
    const text = formatToolResult({ name: 'read_file', args: { path: '/repo/missing.ts' } }, { error: "ENOENT: no such file or directory, open '/repo/missing.ts'" })
    expect(text).toMatch(/^Tool read_file FAILED\./)
    expect(text).toContain('Args: {"path":"/repo/missing.ts"}')
    expect(text).toContain('Error: ENOENT')
    expect(text).toMatch(/Hint: The path does not exist/)
  })

  it('shortens long argument values such as file contents', () => {
    const text = formatToolResult({ name: 'write_file', args: { path: 'a', content: 'z'.repeat(500) } }, { error: 'EACCES: permission denied' })
    expect(text).toContain('(500 chars)')
    expect(text).not.toContain('z'.repeat(200))
    expect(text).toMatch(/Hint: Permission denied/)
  })

  it('truncates huge results with an instruction to narrow the request', () => {
    const text = formatToolResult({ name: 'read_file', args: {} }, { result: 'y'.repeat(MAX_TOOL_RESULT_CHARS + 100) })
    expect(text).toMatch(/^Tool read_file succeeded\./)
    expect(text).toContain('100 more characters truncated. Narrow the request')
  })

  it('says when a tool produced no output', () => {
    expect(formatToolResult({ name: 'run_command', args: {} }, { result: '' })).toContain('(no output)')
  })
})

describe('toolFailureHint', () => {
  it.each([
    ['old_string not found in src/a.ts', /copy old_string exactly/],
    ['Command timed out after 30 s and was stopped: npm run dev', /time limit/],
    ['fatal: not a git repository (or any of the parent directories)', /not a git repository/],
    ['Unknown tool: read_files', /does not exist/],
    ['Command failed with exit code 1: npm test', /reported failure/],
    ['getaddrinfo ENOTFOUND api.example.com', /network request failed/],
    ['The "path" argument must be of type string. Received undefined', /required argument is missing/],
  ])('%s', (error, hint) => {
    expect(toolFailureHint(error)).toMatch(hint)
  })

  it('returns null when there is nothing useful to add', () => {
    expect(toolFailureHint('something odd')).toBeNull()
  })
})

describe('followUpMessage', () => {
  it('asks the model to explain failures and adapt instead of retrying blindly', () => {
    const msg = followUpMessage('Tool x FAILED.')
    expect(msg).toContain('Tool x FAILED.')
    expect(msg).toMatch(/If a tool failed, say so in one line and adapt instead of repeating the same call/)
  })
})

describe('cleanResponse', () => {
  it('strips stock openers and closers', () => {
    const raw = 'Certainly! Great question.\n\nThe bug is in `parse()`: it ignores CRLF.\n\nI hope this helps! Let me know if you have any other questions.'
    expect(cleanResponse(raw)).toBe('The bug is in `parse()`: it ignores CRLF.')
  })

  it.each([
    ["Sure, I'd be happy to help with that. Run `npm test`.", 'Run `npm test`.'],
    ['Absolutely! The build fails because of a missing import.', 'The build fails because of a missing import.'],
    ['Fixed the import.\n\nFeel free to ask if anything else comes up.', 'Fixed the import.'],
    ['Done.\n\nHappy coding!', 'Done.'],
  ])('%s', (raw, expected) => {
    expect(cleanResponse(raw)).toBe(expected)
  })

  it('never touches code blocks', () => {
    const raw = `Sure! Here is the fix:\n${FENCE}ts\n// I hope this helps\nconst ok = true\n${FENCE}\nI hope this helps!`
    expect(cleanResponse(raw)).toBe(`Here is the fix:\n${FENCE}ts\n// I hope this helps\nconst ok = true\n${FENCE}`)
  })

  it('keeps tool blocks intact', () => {
    const raw = `Certainly!\n${toolBlock('{"name":"git_status"}')}`
    expect(cleanResponse(raw)).toBe(toolBlock('{"name":"git_status"}'))
  })

  it('leaves normal answers unchanged', () => {
    const raw = 'Sure-footed parsing needs a state machine. Okay-ish results come from regex.'
    expect(cleanResponse(raw)).toBe(raw)
  })
})

describe('assessResponse', () => {
  it('flags empty, filler-only, and looping replies', () => {
    expect(assessResponse('   ')).toEqual(['empty'])
    expect(assessResponse('Great question! I hope this helps!')).toEqual(['filler-only'])
    const loop = Array(6).fill('I will now check the configuration file for errors.').join('\n')
    expect(assessResponse(loop)).toContain('repetition')
  })

  it('accepts real answers, including repeated lines inside code', () => {
    expect(assessResponse('The test fails because `sum` returns a string.')).toEqual([])
    const code = `${FENCE}ts\n${Array(8).fill('    expect(result).toEqual(expectedValue)').join('\n')}\n${FENCE}`
    expect(assessResponse(`Update the assertions:\n${code}`)).toEqual([])
  })

  it('produces a correction prompt and a user notice with next steps', () => {
    expect(correctionMessage(['empty'])).toMatch(/^Your previous reply was empty\. Answer my last request again/)
    const notice = unusableResponseNotice(['filler-only'], 'Groq')
    expect(notice).toContain('Groq returned an unusable reply (only pleasantries with no content)')
    expect(notice).toContain('Next steps:')
  })
})

describe('unverified claims', () => {
  const fabricated = [
    '**Steps performed**',
    '1. Opened `calc.js` and identified the bug.',
    '2. Edited `calc.js` to return `a + b` instead of `a - b`.',
    '3. Ran the test suite with `node calc.test.js` to verify the fix.',
    '',
    `${FENCE}bash\n$ node calc.test.js\n✔ add function works correctly\n${FENCE}`,
    '',
    'All tests passed, confirming the bug is fixed.',
  ].join('\n')

  it('flags edits, commands, and passing tests that no tool call performed', () => {
    expect(unverifiedClaims(fabricated, [{ name: 'read_file', ok: true }])).toEqual(['edit', 'command', 'passing'])
  })

  it('accepts the same reply when the tools really ran', () => {
    const runs = [{ name: 'edit_file', ok: true }, { name: 'run_command', ok: true }]
    expect(unverifiedClaims(fabricated, runs)).toEqual([])
  })

  it('does not accept "tests passed" when the command failed', () => {
    const runs = [{ name: 'edit_file', ok: true }, { name: 'run_command', ok: false }]
    expect(unverifiedClaims('I ran `npm test`. All tests passed.', runs)).toEqual(['passing'])
    expect(unverifiedClaims('I ran `npm test` and it failed with exit code 1.', runs)).toEqual([])
  })

  it('ignores advice, plans, and code', () => {
    const text = 'The bug is in `add`: it subtracts.\n\nNext steps:\n1. Change `a - b` to `a + b`.\n2. Run `node calc.test.js` and make sure the tests pass.'
    expect(unverifiedClaims(text, [])).toEqual([])
    expect(unverifiedClaims(`${FENCE}\nI edited this; tests passed\n${FENCE}`, [])).toEqual([])
  })

  it('asks the model to act or say what was not done, and warns the user otherwise', () => {
    expect(unverifiedClaimsMessage(['edit', 'passing'])).toMatch(/^Your reply says you changed files and confirmed that tests or a build pass, but no tool call/)
    expect(unverifiedClaimsMessage(['edit'])).toMatch(/Make the tool calls now to finish every part of my request/)
    expect(unverifiedClaimsMessage(['edit'])).toMatch(/state plainly what was not done or verified and give next steps/)
    const notice = unverifiedClaimsNotice(['command'])
    expect(notice).toMatch(/^Check this reply: it says the agent ran commands/)
    expect(notice).toContain('Next steps:')
  })
})

describe('provider failure messages', () => {
  it.each([
    ['API error (429): Rate limit reached', 'rate'],
    ['fetch failed', 'network'],
    ['IPC timeout: ai:chat did not respond in 600s', 'network'],
    ['API error (503): overloaded', 'server'],
    ['mock-model: API error (404): model not found', 'model'],
    ["This model's maximum context length is 8192 tokens", 'context'],
    ['big: API error (429): Rate limit reached on tokens per minute. Need more tokens? (3 models tried)', 'rate'],
    ['allam-2-7b: API error (400): `max_tokens` must be less than or equal to `4096`, the maximum value for `max_tokens` is less than the `context_window`', 'model'],
    ['weird', 'other'],
  ])('classifies %s as %s', (error, kind) => {
    expect(classifyProviderError(error)).toBe(kind)
  })

  it('lists every provider tried and gives concrete next steps', () => {
    const text = describeProviderFailure([
      { name: 'Groq', error: 'API error (429): Rate limit reached' },
      { name: 'Google Gemini', error: 'API error (503): unavailable' },
    ])
    expect(text).toMatch(/^The request failed on all 2 providers tried\./)
    expect(text).toContain('- Groq: rate limited (API error (429): Rate limit reached)')
    expect(text).toContain('- Google Gemini: provider error')
    expect(text).toContain('Next steps:')
    expect(text).toMatch(/Wait a minute and retry/)
    expect(text).toMatch(/switch provider in Settings/)
  })

  it('keeps one-provider failures short and single-line', () => {
    const text = describeProviderFailure([{ name: 'Ollama', error: 'fetch failed\n  at node:internal' }])
    expect(text).toMatch(/^The request to Ollama failed\.\n- Ollama: network error \(fetch failed at node:internal\)/)
  })

  it('explains auth failures without falling back', () => {
    const text = describeAuthFailure('Groq', 'API error (401): Invalid API Key')
    expect(text).toContain('Groq rejected the API key')
    expect(text).toContain('Other providers were not tried')
    expect(text).toMatch(/Next steps:\n- Open Settings, select Groq/)
  })

  it('tells the user which provider actually answered', () => {
    expect(describeFallback([{ name: 'Groq', error: '429 rate limit' }], 'Google Gemini'))
      .toBe('Groq (rate limited) failed, so this answer came from Google Gemini.')
  })

  it('gives next steps for setup problems and the tool-round limit', () => {
    for (const text of [noProviderNotice(), missingKeyNotice('Groq'), maxRoundsNotice(), describeProviderFailure([])]) {
      expect(text).toContain('Next steps:')
    }
    expect(missingKeyNotice('Groq')).toContain('for Groq')
  })
})

describe('resolveWorkspacePath', () => {
  it('joins relative paths and keeps absolute ones', () => {
    expect(resolveWorkspacePath('C:\\repo', 'src\\a.ts')).toBe('C:\\repo\\src\\a.ts')
    expect(resolveWorkspacePath('/repo/', './src/a.ts')).toBe('/repo/src/a.ts')
    expect(resolveWorkspacePath('/repo', '/etc/hosts')).toBe('/etc/hosts')
    expect(resolveWorkspacePath('C:\\repo', 'D:\\x.ts')).toBe('D:\\x.ts')
    expect(resolveWorkspacePath(undefined, 'a.ts')).toBe('a.ts')
  })
})

/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Pure helpers that shape what the model sees and what the user reads:
 * system prompt, context, history, tool-call parsing and results, response cleanup,
 * and user-facing failure messages. Kept free of React and Electron so they are unit-tested.
 */
import { AGENT_TOOLS } from '../types'
import { AUTHOR_NAME, AUTHOR_URL, REPO_URL } from './brand'

export const MAX_TOOL_ROUNDS = 10
export const MAX_TOOL_RESULT_CHARS = 12_000
export const MAX_CONTEXT_FILE_CHARS = 6_000
export const MAX_HISTORY_MESSAGES = 20
export const MAX_HISTORY_CHARS = 40_000
const MAX_HISTORY_MESSAGE_CHARS = 8_000
const FENCE = '```'
const TOOL_BLOCK = /```tool[ \t]*\r?\n([\s\S]*?)\r?\n?```/g
const NATIVE_TOOL_BLOCK = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi
const NATIVE_FUNCTION_BLOCK = /^<function=([^>\s]+)>\s*([\s\S]*?)\s*<\/function>$/i
const NATIVE_INNER_TOOL_BLOCK = /^<tool\s*>?\s*([\s\S]*?)\s*<\/tool>$/i
const KNOWN_TOOL_NAMES = new Set<string>(AGENT_TOOLS.map((tool) => tool.name))

// ─── System prompt ──────────────────────────────────────────────────────────

export const TOOL_SYSTEM_PROMPT = `You are VD Agent, a senior software engineer working in the user's repository through tools. You run on the user's machine with filesystem, shell, git, and web access.
If asked who made you, say VD Agent is built by ${AUTHOR_NAME} (${AUTHOR_URL}), source at ${REPO_URL}.

## How you work
- Inspect before you claim. Read the relevant files, search the code, or run a command before explaining how something works or why it fails. If you have not checked something, say so.
- Challenge weak requests. If an ask is ambiguous, risky, or likely to cause a regression, say what the problem is and propose a better path.
- Prefer the smallest correct change. Never rewrite a file you have not read. Preserve the user's uncommitted work.
- Finish the job end to end: make the change, then verify it with the project's own commands (tests, typecheck, build, or a targeted run).
- When the user asks you to do the work, do not stop at a plan, audit, prompt, or progress report. Keep using tools until the requested work is finished or a concrete blocker remains.
- Never say something is done, fixed, or passing unless a tool result in this conversation shows it. If you could not verify, say exactly what is unverified.
- Never invent file contents, APIs, command output, or test results.
- Destructive actions (deleting files, discarding changes, git reset, force push, dropping data) need the user's explicit consent first.
- Never print, write, or commit secrets or API keys. Commit only when the user asks.

## Answer quality
- Lead with the answer or the result in the first sentence.
- No preamble ("Sure", "Certainly", "Great question", "I'd be happy to help"), no restating the request, and no closing pleasantries ("I hope this helps", "Let me know if you have any other questions").
- Do not expose internal planning or narrate the next obvious action ("I'll inspect the repo", "Let me check", "Now I will..."). Call the tool directly. Report only decisions, evidence, results, blockers, and concise progress that materially helps the user.
- Be specific: name the files, functions, commands, and exact errors. No generic advice that ignores the actual code.
- Be critical: point out bugs, risks, wrong assumptions, and weak evidence, including in the user's request. Disagree when warranted and say why. Be critical of ideas, never of people.
- Match length to the question. Summarize tool output; do not paste it back.
- When there are tradeoffs, name them and recommend one option.
- Answer every distinct question in the request. Separate verified facts from estimates, and never call a product "10/10" without meaningful real-world evidence.
- Distinguish inspiration, adaptation, and copied source based on evidence. Do not accuse a user of copying merely because they studied another project.

## Questions
- Ask only when the answer changes what you would do and you cannot find it with tools: a product decision, missing credentials, or a choice between valid approaches.
- Never ask permission for read-only steps such as reading files, searching, or running tests. Do them.
- If a reasonable assumption lets you proceed, state it and proceed.
- Ask at most two questions at a time, each with your recommended default.
- If the user is only giving a handoff or status update and asks for no action, acknowledge it briefly. Do not manufacture a task or ask a generic "what next?" question.

## When a tool fails
- Say which tool failed, the error in one line, and the likely cause.
- Adapt: fix the arguments, try another approach, or gather more information. Do not repeat an identical failing call.
- Never claim success for a step whose tool call failed.
- If you are blocked, stop and say exactly what you need from the user.

## Ending a reply
When work remains, something failed, or the user must act, end with "Next steps:" and one to three concrete actions (a command to run, a file to check, a decision to make). Skip it for a simple question you fully answered.

## Tool calls
Use EXACTLY this format, one JSON object per block:
${FENCE}tool
{"name": "tool_name", "args": {"arg1": "value1"}}
${FENCE}
You may call several tools in one reply. Results arrive in the next message; continue until the task is complete. At most ${MAX_TOOL_ROUNDS} tool rounds run per request.
Relative paths resolve against the open workspace. run_command runs in the workspace unless you pass cwd, and stops after 30 seconds. Long tool output is truncated; narrow the request to see more.

## Available tools (${AGENT_TOOLS.length})
${AGENT_TOOLS.map((t) => `- **${t.name}**: ${t.description}\n  Params: ${JSON.stringify(t.parameters)}`).join('\n\n')}

## Work method
1. Understand: read the relevant code and the user's constraints.
2. Plan briefly: which files change and what could break.
3. Change: targeted edits (edit_file, multi_file_edit) over full rewrites.
4. Verify: run the tests, typecheck, build, or the specific command that proves the change.
5. Report.
Use web_search for current APIs and docs instead of guessing.

## Complex tasks
- Split broad requests into checkpoints: repo scan, risk list, implementation, self-review, verification, and commit only if asked.
- Gather enough context before editing. For broad or multi-file work, call repo_map or repo_search first, then read the specific files before editing. Prefer existing patterns, tests, and nearby helpers over inventing a new design.
- For multi-file work, keep a short working checklist internally and resolve the highest-risk path first.
- Before applying multi_file_edit, state the intended files in your own reasoning, read each target file, and use exact old_string replacements only.
- After edits, review your own diff as if you were blocking a risky PR: look for regressions, missing tests, stale docs, secrets, and claims not backed by tool results.
- If a tool or model is weak for the task, adapt the route instead of giving a weak answer: use another provider, another model, a narrower command, or a smaller reproducible test.

## Archives and tabular data
- For a ZIP request, use archive_list first. Do not try to read a binary archive with read_file.
- Extract into a new workspace folder with archive_extract, inventory every entry and file type, and record files that could not be parsed. Never silently inspect only a sample when the user asked for all files.
- Before combining data, distinguish truly common fields from merely relevant fields. Normalize obvious naming variants only when the values have the same meaning, and keep a source_file column for traceability.
- Do not flatten incompatible entities into a misleading table. Produce separate CSVs plus a field-coverage summary when one combined schema would lose meaning.
- Write UTF-8 CSV with a stable header and proper quoting. Verify the generated CSV programmatically, including row count, column count, malformed rows, duplicates, and empty required fields, before reporting success.

## @ mentions
- @path: a file or folder the user wants you to look at
- @web: the user wants a web search

## Plan Mode
When Plan Mode is on, change nothing. Reply with the files you will read or change, the intended change and its risks, and the order of steps. Then wait for approval.

## Response format
Markdown with language-tagged code blocks. For finished work use:
1. Outcome: one or two sentences on what was done or found.
2. Details: the changes or findings that matter.
3. Verification: commands run and their results.
4. Risks and next steps, only if there are any.`

export type ContextInput = {
  workspacePath?: string
  selectedFile?: string | null
  fileContent?: string
  openFiles?: string[]
  workspaceFiles?: Array<{ name: string; path: string; isDirectory: boolean }>
  recentEdits?: Array<{ path: string; before: string; after: string; timestamp: number }>
  projectMemory?: string
  conversationSummary?: string
  resumeNote?: string
}

function summarizeWorkspaceFiles(files: Array<{ name: string; path: string; isDirectory: boolean }> = []): string {
  const fileOnly = files.filter((file) => !file.isDirectory)
  if (fileOnly.length === 0) return ''
  const extCounts = new Map<string, number>()
  const dirCounts = new Map<string, number>()
  for (const file of fileOnly) {
    const name = file.name.toLowerCase()
    const ext = name.includes('.') ? `.${name.split('.').pop()}` : '[no ext]'
    extCounts.set(ext, (extCounts.get(ext) || 0) + 1)
    const parts = file.path.replace(/\\/g, '/').split('/')
    const srcIndex = Math.max(parts.lastIndexOf('src'), parts.lastIndexOf('electron'), parts.lastIndexOf('app'))
    const bucket = srcIndex >= 0 && parts[srcIndex + 1] ? `${parts[srcIndex]}/${parts[srcIndex + 1]}` : parts.slice(-2, -1)[0] || '(root)'
    dirCounts.set(bucket, (dirCounts.get(bucket) || 0) + 1)
  }
  const topExts = [...extCounts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ext, count]) => `${ext}:${count}`).join(', ')
  const topDirs = [...dirCounts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([dir, count]) => `${dir}:${count}`).join(', ')
  return `Workspace shape: ${fileOnly.length} indexed file(s). Common extensions: ${topExts}. Active areas: ${topDirs}.`
}

function summarizeEdit(before: string, after: string): string {
  const oldLines = before.split(/\r?\n/)
  const newLines = after.split(/\r?\n/)
  let changed = 0
  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) if (oldLines[i] !== newLines[i]) changed++
  return `${changed} changed line(s)`
}

export function buildContext({
  workspacePath, selectedFile, fileContent = '', openFiles = [], workspaceFiles = [], recentEdits = [], projectMemory = '', conversationSummary = '', resumeNote = '',
}: ContextInput): string {
  const parts: string[] = []
  if (workspacePath) {
    parts.push(`Workspace: ${workspacePath}\nRelative tool paths resolve here, and run_command runs here unless you pass cwd.`)
  } else {
    parts.push('No workspace folder is open. Tools need absolute paths. If the task is about a project, ask the user to open its folder (Files → Open).')
  }
  if (selectedFile) {
    const shown = fileContent.slice(0, MAX_CONTEXT_FILE_CHARS)
    const note = fileContent.length > shown.length
      ? ` (showing the first ${shown.length} of ${fileContent.length} characters; use read_file for the rest)`
      : ''
    parts.push(`File open in the editor: ${selectedFile}${note}\n${FENCE}\n${shown}\n${FENCE}`)
  }
  if (openFiles.length > 0) parts.push(`Open editor tabs:\n${openFiles.slice(-8).map((file) => `- ${file}`).join('\n')}`)
  const shape = summarizeWorkspaceFiles(workspaceFiles)
  if (shape) parts.push(shape)
  if (recentEdits.length > 0) {
    parts.push(`Recent file edit proposals or applied edits:\n${recentEdits.slice(-6).map((edit) => `- ${edit.path}: ${summarizeEdit(edit.before, edit.after)}`).join('\n')}`)
  }
  if (workspacePath) {
    parts.push([
      'Context strategy:',
      '- Use this packed context as a map, not proof. Read exact files before editing or making file-specific claims.',
      '- For broad code tasks, call repo_search/repo_map first, then read the smallest relevant files.',
      '- After edits, run the narrowest meaningful verification and report only verified results.',
    ].join('\n'))
  }
  if (projectMemory.trim()) parts.push(`Local project memory (refresh if files disagree):\n${projectMemory.slice(0, 12_000)}`)
  if (conversationSummary.trim()) parts.push(conversationSummary.slice(0, 8_000))
  if (resumeNote.trim()) parts.push(`Recovered session state:\n${resumeNote.slice(0, 4_000)}`)
  return parts.join('\n\n')
}

export function buildSystemPrompt(opts: { planMode: boolean; context: string; customRules?: string }): string {
  const modeLine = opts.planMode
    ? 'Plan Mode is ON: propose a plan and wait for approval. Do not modify anything.'
    : 'Plan Mode is OFF: execute the task.'
  return [
    TOOL_SYSTEM_PROMPT,
    `## Session\n${modeLine}`,
    opts.context ? `## Context\n${opts.context}` : '',
    opts.customRules?.trim() ? `## User rules\n${opts.customRules.trim()}` : '',
  ].filter(Boolean).join('\n\n')
}

// ─── History ────────────────────────────────────────────────────────────────

type HistoryMessage = { role: string; content: string }

/**
 * Model-facing history. Tool results are not stored in chat history, so earlier tool blocks are
 * collapsed into short "[called …]" notes instead of looking like calls that never got an answer.
 * Keeps the newest messages that fit the budget; the latest message is always kept.
 */
export function buildHistory(
  messages: HistoryMessage[],
  maxMessages = MAX_HISTORY_MESSAGES,
  maxChars = MAX_HISTORY_CHARS
): { role: string; content: string }[] {
  const prepared = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      let content = m.role === 'assistant' ? summarizeToolBlocks(m.content) : m.content
      if (content.length > MAX_HISTORY_MESSAGE_CHARS) {
        content = `${content.slice(0, MAX_HISTORY_MESSAGE_CHARS)}\n[... earlier message truncated]`
      }
      return { role: m.role, content }
    })
    .filter((m) => m.content.trim().length > 0)
    .slice(-maxMessages)

  const kept: { role: string; content: string }[] = []
  let used = 0
  for (let i = prepared.length - 1; i >= 0; i--) {
    const size = prepared[i].content.length
    if (kept.length > 0 && used + size > maxChars) break
    kept.unshift(prepared[i])
    used += size
  }
  return kept
}

function summarizeToolBlocks(content: string): string {
  const bare = decodeBareToolCall(content)
  if (bare) return `[called ${bare.name} ${shortArgs(bare.args)}]`
  const fenced = content.replace(TOOL_BLOCK, (_block, body: string) => {
    try {
      const parsed = JSON.parse(body.trim())
      return `[called ${parsed.name} ${shortArgs(parsed.args || {})}]`
    } catch {
      return '[malformed tool call]'
    }
  })
  return fenced.replace(NATIVE_TOOL_BLOCK, (_block, body: string) => {
    try {
      const call = decodeToolCall(body)
      return `[called ${call.name} ${shortArgs(call.args)}]`
    } catch {
      return '[malformed tool call]'
    }
  }).trim()
}

// ─── Tool calls ─────────────────────────────────────────────────────────────

export type ToolCall = { name: string; args: Record<string, any> }

export function hasToolBlock(content: string): boolean {
  return content.includes(`${FENCE}tool`) || /<tool_call>/i.test(content) || decodeBareToolCall(content) !== null
}

function decodeToolCall(body: string): ToolCall {
  const functionMatch = body.trim().match(NATIVE_FUNCTION_BLOCK)
  const innerToolMatch = body.trim().match(NATIVE_INNER_TOOL_BLOCK)
  const functionName = functionMatch?.[1]?.replace(/^functions\./i, '')
  const payload = JSON.parse((functionMatch?.[2] || innerToolMatch?.[1] || body).trim())
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('tool payload must be an object')

  const wrappedName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : ''
  const name = wrappedName || (functionName && functionName.toLowerCase() !== 'tool' ? functionName : '')
  if (!name) throw new Error('no "name" field')
  const candidateArgs = payload.args ?? payload.arguments ?? (wrappedName ? {} : payload)
  const args = candidateArgs && typeof candidateArgs === 'object' && !Array.isArray(candidateArgs) ? candidateArgs : {}
  return { name, args }
}

function decodeBareToolCall(content: string): ToolCall | null {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  try {
    const call = decodeToolCall(trimmed)
    return KNOWN_TOOL_NAMES.has(call.name) ? call : null
  } catch {
    return null
  }
}

function canonicalizeNativeToolBlocks(content: string): string {
  const native = content.replace(NATIVE_TOOL_BLOCK, (block, body: string) => {
    try {
      const call = decodeToolCall(body)
      return `${FENCE}tool\n${JSON.stringify(call)}\n${FENCE}`
    } catch {
      return block
    }
  })
  const bare = decodeBareToolCall(native)
  return bare ? `${FENCE}tool\n${JSON.stringify(bare)}\n${FENCE}` : native
}

/** Valid calls plus a model-readable error for every block that could not be used. */
export function parseToolCalls(content: string): { calls: ToolCall[]; errors: string[] } {
  const calls: ToolCall[] = []
  const errors: string[] = []
  const blocks = [
    ...[...content.matchAll(TOOL_BLOCK)].map((match) => ({ start: match.index, body: match[1] })),
    ...[...content.matchAll(NATIVE_TOOL_BLOCK)].map((match) => ({ start: match.index, body: match[1] })),
  ].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
  const bare = blocks.length === 0 ? decodeBareToolCall(content) : null
  if (bare) blocks.push({ start: 0, body: JSON.stringify(bare) })

  for (let index = 0; index < blocks.length; index++) {
    try {
      calls.push(decodeToolCall(blocks[index].body))
    } catch (err: any) {
      errors.push(`Tool block ${index + 1} is not valid (${String(err?.message || err).slice(0, 120)}).`)
    }
  }
  if (blocks.length === 0 && content.includes(`${FENCE}tool`)) errors.push('A tool block was opened but not closed with ```.')
  if (blocks.length === 0 && /<tool_call>/i.test(content)) errors.push('A <tool_call> block was opened but not closed with </tool_call>.')
  return {
    calls,
    errors: errors.map((e) => `${e} Resend it as one JSON object: {"name": "tool_name", "args": {...}}`),
  }
}

/** Same rule the main process applies: relative paths are relative to the workspace. */
export function resolveWorkspacePath(workspace: string | undefined, p: string): string {
  if (!workspace || /^([a-zA-Z]:[\\/]|[\\/])/.test(p)) return p
  const sep = workspace.includes('\\') ? '\\' : '/'
  return `${workspace.replace(/[\\/]+$/, '')}${sep}${p.replace(/^\.[\\/]/, '')}`
}

export function shortArgs(args: Record<string, any>, maxValue = 80): string {
  const compact = Object.fromEntries(
    Object.entries(args).map(([k, v]) => {
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      return [k, s && s.length > maxValue ? `${s.slice(0, maxValue)}… (${s.length} chars)` : v]
    })
  )
  return JSON.stringify(compact)
}

const FAILURE_HINTS: [RegExp, string][] = [
  [/ENOENT|no such file|cannot find the (file|path)/i, 'The path does not exist. Check it with list_files or search_files; relative paths resolve against the workspace.'],
  [/EACCES|EPERM|permission denied|access is denied/i, 'Permission denied. The file may be read-only, locked by another program, or need elevated rights.'],
  [/EISDIR/i, 'The path is a directory. Use list_files or read_directory_tree instead.'],
  [/ENOTDIR/i, 'Part of the path is a file, not a folder.'],
  [/old_string not found/i, 'The exact text was not found. Re-read the file and copy old_string exactly, including whitespace and indentation.'],
  [/timed out/i, 'The command hit the time limit. Run a narrower command, or ask the user to run long tasks in the terminal.'],
  [/not a git repository/i, 'This folder is not a git repository. Check the path, or run git init only if the user wants one.'],
  [/Unknown tool/i, 'That tool does not exist. Use only tools from the Available tools list.'],
  [/exit code/i, 'The command ran and reported failure. Read its output above for the cause.'],
  [/ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|network/i, 'The network request failed. The service may be down, blocked, or offline.'],
  [/IPC timeout/i, 'The tool did not respond in time. Try a smaller request.'],
  [/must be of type|Received undefined|is not iterable|Cannot read propert/i, 'A required argument is missing or has the wrong type. Check the tool\'s Params.'],
]

export function toolFailureHint(error: string): string | null {
  const hit = FAILURE_HINTS.find(([re]) => re.test(error))
  return hit ? hit[1] : null
}

function truncate(text: string, max: number, what: string): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n[... ${text.length - max} more characters truncated. ${what}]`
}

export function formatToolResult(call: ToolCall, result: { result?: string; error?: string }): string {
  if (typeof result.error === 'string') {
    const hint = toolFailureHint(result.error)
    return [
      `Tool ${call.name} FAILED.`,
      `Args: ${shortArgs(call.args)}`,
      `Error: ${truncate(result.error, 4_000, 'See the start of the error.')}`,
      hint ? `Hint: ${hint}` : '',
    ].filter(Boolean).join('\n')
  }
  const output = result.result ?? ''
  return `Tool ${call.name} succeeded.\n${truncate(output || '(no output)', MAX_TOOL_RESULT_CHARS, 'Narrow the request (a smaller file, a search, or fewer lines) to see the rest.')}`
}

export function followUpMessage(toolResults: string): string {
  return [
    `Tool results:\n\n${toolResults}`,
    'Continue the agent loop:',
    '- If a tool failed, say so in one line and adapt instead of repeating the same call.',
    '- If files were edited, inspect or verify the changed behavior before claiming completion.',
    '- If more context is needed, use repo_search/repo_map/read_file instead of guessing.',
    '- Otherwise give the final answer and state exactly what was verified.',
  ].join('\n\n')
}

// ─── Response quality ───────────────────────────────────────────────────────

const LEADING_FILLER = [
  /^(sure|certainly|absolutely|of course|okay|ok|alright|great|awesome|perfect)\s*[!.,]+\s*/i,
  /^(what a |that's a |this is a )?(great|good|excellent|fantastic|interesting) (question|idea|point|request)\s*[!.]*\s*/i,
  /^I('d| would)( be)? (happy|glad|delighted) to help( you)?( with (that|this|your request))?\s*[!.]*\s*/i,
  /^(thanks|thank you) for (asking|your question|sharing)[^.!\n]*[!.]\s*/i,
  /^(first,?\s+|now,?\s+|next,?\s+)?(I('ll| will)|let me|I('m| am) going to)\s+(start|begin|check|inspect|review|read|look|examine|analy[sz]e|verify|open|search|run)\b[^\n]*[.!:]?\s*/i,
]

const TRAILING_FILLER = [
  /\s*I hope (this|that|it) helps[^\n]*$/i,
  /\s*Let me know if (you have|you need|you'd like|there('s| is)|anything)[^\n]*$/i,
  /\s*Feel free to (ask|reach out|let me know)[^\n]*$/i,
  /\s*(Is there )?anything else (I can help|you need|you'd like)[^\n]*$/i,
  /\s*Happy coding[!.]*$/i,
  /\s*Good luck( with your project)?[!.]*$/i,
  /\s*If you need (anything|more|help)[^\n]*$/i,
]

function stripRepeated(text: string, patterns: RegExp[]): string {
  let out = text
  for (let pass = 0; pass < 6; pass++) {
    const before = out
    for (const re of patterns) out = out.replace(re, '')
    if (out === before) break
  }
  return out
}

/** Removes stock openers and closers from the prose around code; code blocks are never touched. */
export function cleanResponse(text: string): string {
  text = canonicalizeNativeToolBlocks(text)
  const first = text.indexOf(FENCE)
  const last = text.lastIndexOf(FENCE)
  const fenceCount = text.split(FENCE).length - 1
  if (first === -1) return stripRepeated(stripRepeated(text.trim(), LEADING_FILLER), TRAILING_FILLER).trim()

  const head = stripRepeated(text.slice(0, first).trimStart(), LEADING_FILLER)
  const middle = text.slice(first, last + FENCE.length)
  const tail = fenceCount % 2 === 0 ? stripRepeated(text.slice(last + FENCE.length).trimEnd(), TRAILING_FILLER) : text.slice(last + FENCE.length)
  return `${head}${middle}${tail}`.trim()
}

export type ResponseProblem = 'empty' | 'filler-only' | 'repetition' | 'generic-deflection' | 'context-denial'

export function assessResponse(text: string, userRequest = '', hasPriorContext = false): ResponseProblem[] {
  if (!text.trim()) return ['empty']
  const problems: ResponseProblem[] = []
  if (!cleanResponse(text)) problems.push('filler-only')

  const prose = text.replace(/```[\s\S]*?```/g, '')
  const counts = new Map<string, number>()
  for (const line of prose.split(/\r?\n/)) {
    const key = line.trim()
    if (key.length < 30) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  if ([...counts.values()].some((n) => n >= 5)) problems.push('repetition')
  const requestHasSubstance = userRequest.trim().split(/\s+/).length >= 4
  const genericDeflection = /^(hello[!.]?\s*)?(how can i (assist|help)|what would you like me to help with|please (provide|share|send) (the |more )?(task|details|context)|could you (provide|share|send) (the |more )?(task|details|context))/i.test(cleanResponse(text))
    || /please provide the details of the task and (the )?context/i.test(text)
  if (requestHasSubstance && genericDeflection) problems.push('generic-deflection')
  if (hasPriorContext && /(this is|this appears to be) (the )?(first|start of (our|the)) (message|conversation)|I (do not|don't) have (the )?(prior |previous )?(context|turns)/i.test(text)) {
    problems.push('context-denial')
  }
  return problems
}

const PROBLEM_TEXT: Record<ResponseProblem, string> = {
  'empty': 'empty',
  'filler-only': 'only pleasantries with no content',
  'repetition': 'stuck repeating the same lines',
  'generic-deflection': 'a generic request for information the user already supplied',
  'context-denial': 'a denial of prior conversation context that was supplied',
}

export function correctionMessage(problems: ResponseProblem[]): string {
  return `Your previous reply was ${problems.map((p) => PROBLEM_TEXT[p]).join(' and ')}. Answer my last request again: lead with the answer, be specific to this code, and use tools if you need information. No preamble or closing pleasantries.`
}

export function unusableResponseNotice(problems: ResponseProblem[], providerName: string): string {
  return [
    `${providerName} returned an unusable reply (${problems.map((p) => PROBLEM_TEXT[p]).join(', ')}), even after one retry.`,
    '',
    'Next steps:',
    '- Send the request again, or rephrase it with the file or error you mean.',
    '- Pin a stronger model in the Agent header, or switch provider in Settings.',
  ].join('\n')
}

// ─── Unverified claims ──────────────────────────────────────────────────────

export type ToolRun = { name: string; ok: boolean; summary?: string }
export type UnverifiedClaim = 'edit' | 'command' | 'passing'

const FILE_CHANGE_TOOLS = new Set(['write_file', 'edit_file', 'create_file', 'delete_file', 'multi_file_edit', 'archive_extract'])
const EDIT_CLAIM = /\b(I|I've|I have|we)\s+(edited|modified|updated|changed|fixed|patched|rewrote|replaced|created|deleted)\b|^\s*(\d+\.|[-*])\s*(Edited|Modified|Updated|Changed|Fixed|Patched|Rewrote|Replaced|Created|Deleted)\s+`/im
const COMMAND_CLAIM = /\b(I|I've|I have|we)\s+(ran|executed|re-ran)\b|^\s*(\d+\.|[-*])\s*(Ran|Executed|Re-ran)\b/im
const PASSING_CLAIM = /\b(tests|test suite|the build|typecheck|lint)\s+(passed|now pass(es)?|are (now )?passing|succeeded)\b/i

/**
 * Claims in a final reply that no tool call in this request backs up, e.g. "Edited `calc.js`",
 * "Ran `npm test`", "All tests passed" with no edit or run_command behind them. Code blocks are ignored.
 */
export function unverifiedClaims(text: string, runs: ToolRun[]): UnverifiedClaim[] {
  const prose = text.replace(/```[\s\S]*?```/g, '')
  const edited = runs.some((r) => r.ok && FILE_CHANGE_TOOLS.has(r.name))
  const ranCommand = runs.some((r) => r.name === 'run_command')
  const commandPassed = runs.some((r) => r.ok && r.name === 'run_command')
  const claims: UnverifiedClaim[] = []
  if (!edited && EDIT_CLAIM.test(prose)) claims.push('edit')
  if (!ranCommand && COMMAND_CLAIM.test(prose)) claims.push('command')
  if (!commandPassed && PASSING_CLAIM.test(prose)) claims.push('passing')
  return claims
}

const CLAIM_TEXT: Record<UnverifiedClaim, string> = {
  edit: 'changed files',
  command: 'ran commands',
  passing: 'confirmed that tests or a build pass',
}

function claimList(claims: UnverifiedClaim[]) {
  return claims.map((c) => CLAIM_TEXT[c]).join(' and ')
}

export function unverifiedClaimsMessage(claims: UnverifiedClaim[]): string {
  return `Your reply says you ${claimList(claims)}, but no tool call in this request did that. Do not describe work that did not happen. Make the tool calls now to finish every part of my request. If you cannot, state plainly what was not done or verified and give next steps.`
}

export function unverifiedClaimsNotice(claims: UnverifiedClaim[]): string {
  return [
    `Check this reply: it says the agent ${claimList(claims)}, but no matching tool call ran in this request.`,
    '',
    'Next steps:',
    '- Ask the agent to make the change and run the check, or run it yourself before relying on the result.',
  ].join('\n')
}

// ─── Provider failures ──────────────────────────────────────────────────────

export type ProviderAttempt = { name: string; error: string }
type FailureKind = 'rate' | 'network' | 'server' | 'model' | 'context' | 'other'

export function classifyProviderError(error: string): FailureKind {
  if (/\b429\b|rate[_ ]?limit|too many requests|quota|resource[_ ]exhausted/i.test(error)) return 'rate'
  if (/max_tokens.{0,60}(must be|less than or equal|exceeds?|too large)/i.test(error)) return 'model'
  if (/context|too long|maximum.*tokens|token limit|reduce the length/i.test(error)) return 'context'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|IPC timeout|timed? ?out|socket/i.test(error)) return 'network'
  if (/\b5\d\d\b|overloaded|unavailable|internal server error|bad gateway/i.test(error)) return 'server'
  if (/model|\b404\b|not found|unsupported/i.test(error)) return 'model'
  return 'other'
}

const KIND_LABEL: Record<FailureKind, string> = {
  rate: 'rate limited',
  network: 'network error',
  server: 'provider error',
  model: 'model unavailable',
  context: 'conversation too long for the model',
  other: 'request failed',
}

const KIND_STEP: Record<FailureKind, string> = {
  rate: 'Wait a minute and retry, or add a key for another free provider in Settings so VD Agent can fall back.',
  network: 'Check your internet connection, proxy, or firewall. For a local model, make sure its server is running.',
  server: 'The provider is having problems. Retry shortly or switch provider in Settings.',
  model: 'Pick a different model in the Agent header, or choose Auto.',
  context: 'Start a new chat (＋ New chat) or ask about a smaller part of the code.',
  other: 'Retry. If it keeps failing, switch provider in Settings.',
}

function oneLine(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

export function describeProviderFailure(attempts: ProviderAttempt[]): string {
  if (attempts.length === 0) return noProviderNotice()
  const kinds = attempts.map((a) => classifyProviderError(a.error))
  const lines = attempts.map((a, i) => `- ${a.name}: ${KIND_LABEL[kinds[i]]} (${oneLine(a.error)})`)
  const steps = [...new Set(kinds.map((k) => KIND_STEP[k]))].slice(0, 3)
  const head = attempts.length === 1
    ? `The request to ${attempts[0].name} failed.`
    : `The request failed on all ${attempts.length} providers tried.`
  return [head, ...lines, '', 'Next steps:', ...steps.map((s) => `- ${s}`)].join('\n')
}

export function describeAuthFailure(providerName: string, error: string): string {
  return [
    `${providerName} rejected the API key (${oneLine(error)}).`,
    'Other providers were not tried, so a bad key is not hidden behind a fallback.',
    '',
    'Next steps:',
    `- Open Settings, select ${providerName}, paste a valid key, and click Save.`,
  ].join('\n')
}

export function describeFallback(failed: ProviderAttempt[], usedName: string): string {
  const what = failed.map((a) => `${a.name} (${KIND_LABEL[classifyProviderError(a.error)]})`).join(', ')
  return `${what} failed, so this answer came from ${usedName}.`
}

export function noProviderNotice(): string {
  return 'No AI provider is set up.\n\nNext steps:\n- Open Settings, select a provider, add its API key, and click Save.'
}

export function missingKeyNotice(providerName?: string): string {
  return `No API key is configured${providerName ? ` for ${providerName}` : ''}.\n\nNext steps:\n- Open Settings, select a provider, add its API key, and click Save.\n- Or pick a local provider such as Ollama, which needs no key.`
}

export function maxRoundsNotice(): string {
  return `Stopped after ${MAX_TOOL_ROUNDS} tool rounds so the agent cannot loop forever.\n\nNext steps:\n- Reply "continue" to let it keep going.\n- Or narrow the request to one file or one failing test.`
}

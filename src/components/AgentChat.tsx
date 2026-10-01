/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * AgentChat — Main AI chat interface
 *
 * Features:
 * - Streaming AI responses with real-time token display
 * - Markdown rendering with syntax-highlighted code blocks
 * - Tool call execution with multi-round follow-up (MAX_TOOL_ROUNDS)
 * - @context mentions (@file, @folder, @web) for precise targeting
 * - Image paste (Ctrl+V) and drag-and-drop support
 * - Per-provider model picker in the header (auto-select by default)
 * - Provider fallback across official free providers; stops on auth errors
 * - Adaptive multi-agent analysis, evidence review, repair, and final verification
 * - Plan Mode toggle (plan before executing)
 * - Stop button that cancels the in-flight request
 * - Chat history auto-saved to disk
 * - Token/cost tracking, diff viewer for file edits, context window usage bar
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import DiffViewer from './DiffViewer'
import { buildConversationSummary, useStore } from '../store'
import type { AgentTaskKind, ChatMessage, AgentStep, ProviderConfig } from '../types'
import {
  applyDiscoveredModel, buildProviderChain, classifyAgentTask, recordProviderOutcome, refreshProviderModelCatalog,
} from '../lib/providers'
import { highlightSyntax } from '../lib/highlight'
import { AUTHOR_NAME, AUTHOR_URL, REPO_URL } from '../lib/brand'
import {
  MAX_TOOL_ROUNDS, assessResponse, buildContext, buildHistory, buildSystemPrompt, cleanResponse,
  correctionMessage, describeAuthFailure, describeFallback, describeProviderFailure, followUpMessage,
  formatToolResult, hasToolBlock, maxRoundsNotice, missingKeyNotice, noProviderNotice, parseToolCalls,
  resolveWorkspacePath, unusableResponseNotice, unverifiedClaims, unverifiedClaimsMessage, unverifiedClaimsNotice,
  type ProviderAttempt, type ToolRun,
} from '../lib/agent'
import {
  TEAM_MAX_REVIEW_PASSES, analystBriefForExecutor, buildAnalystMessages, buildRepairMessage,
  buildReviewerMessages, buildSynthesizerMessages, describeToolEvidence, parseTeamReview, shouldUseTeamMode,
  hasCustomTeamProfile, type TeamReview,
} from '../lib/multiAgent'

type ChatOutcome =
  | { content: string; provider: ProviderConfig; failed: ProviderAttempt[] }
  | { error: string; cancelled?: boolean }


// Simple markdown renderer component
function MarkdownContent({ content }: { content: string }) {
  // Parse markdown into blocks
  const blocks = parseMarkdown(content)

  return (
    <div style={{ lineHeight: 1.7 }}>
      {blocks.map((block, i) => {
        if (block.type === 'code') {
          return (
            <div key={i} style={{ margin: '8px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 12px', background: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {block.lang || 'code'}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(block.content)
                    const btn = document.getElementById(`copy-${i}`)
                    if (btn) { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = '📋 Copy' }, 1500) }
                  }}
                  id={`copy-${i}`}
                  style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  📋 Copy
                </button>
              </div>
              <pre style={{
                margin: 0, padding: '12px 16px', background: '#0d1117',
                fontSize: 12, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                overflow: 'auto', lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>
                <code dangerouslySetInnerHTML={{ __html: highlightSyntax(block.content, block.lang) }} />
              </pre>
            </div>
          )
        }
        if (block.type === 'heading') {
          const Tag = `h${block.level}` as keyof JSX.IntrinsicElements
          const sizes: Record<number, number> = { 1: 20, 2: 17, 3: 15, 4: 14, 5: 13, 6: 13 }
          return (
            <Tag key={i} style={{
              fontSize: sizes[block.level] || 14,
              fontWeight: 700, marginTop: block.level <= 2 ? 16 : 12,
              marginBottom: 6, color: 'var(--text-primary)',
            }}>
              {block.content}
            </Tag>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={i} style={{ paddingLeft: 20, margin: '4px 0' }}>
              {block.items.map((item, j) => (
                <li key={j} style={{ marginBottom: 3, fontSize: 13 }}>
                  <InlineMarkdown text={item} />
                </li>
              ))}
            </ul>
          )
        }
        if (block.type === 'table') {
          return (
            <div key={i} style={{ margin: '8px 0', overflow: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                <thead>
                  <tr>
                    {block.headers.map((h, j) => (
                      <th key={j} style={{
                        padding: '6px 10px', textAlign: 'left',
                        background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                        fontWeight: 600,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k} style={{
                          padding: '6px 10px', border: '1px solid var(--border)',
                        }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'hr') {
          return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />
        }
        return (
          <p key={i} style={{ margin: '4px 0', fontSize: 13 }}>
            <InlineMarkdown text={block.content} />
          </p>
        )
      })}
    </div>
  )
}

// Inline markdown: **bold**, `code`, ~~strike~~
function InlineMarkdown({ text }: { text: string }) {
  const parts: JSX.Element[] = []
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`|~~(.+?)~~|(\[[^\]]+\]\([^)]+\)))/g
  let lastIndex = 0
  let match
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    }
    if (match[2]) {
      parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(
        <code key={key++} style={{
          padding: '1px 5px', borderRadius: 4, fontSize: 12,
          background: 'var(--bg-tertiary)', fontFamily: 'monospace',
        }}>
          {match[3]}
        </code>
      )
    } else if (match[4]) {
      parts.push(<del key={key++}>{match[4]}</del>)
    } else if (match[5]) {
      parts.push(<span key={key++}>{match[5]}</span>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  }
  return <>{parts}</>
}

type MdBlock =
  | { type: 'code'; content: string; lang?: string }
  | { type: 'heading'; content: string; level: number }
  | { type: 'list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' }
  | { type: 'paragraph'; content: string }

function parseMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang: lang || undefined })
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length })
      i++
      continue
    }

    // HR
    if (line.match(/^[-*_]{3,}$/)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // Unordered list
    if (line.match(/^\s*[-*+]\s+/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\s*[-*+]\s+/)) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', items })
      continue
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1]?.includes('---')) {
      const headers = line.split('|').map(c => c.trim()).filter(Boolean)
      i += 2 // skip header and separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map(c => c.trim()).filter(Boolean))
        i++
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    // Paragraph
    if (line.trim()) {
      const paraLines: string[] = [line]
      i++
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].match(/^\s*[-*+]\s+/) && !lines[i].match(/^[-*_]{3,}$/)) {
        paraLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') })
      continue
    }

    i++
  }
  return blocks
}

export default function AgentChat() {
  const {
    messages, addMessage,
    chatLoading, setChatLoading,
    getActiveProvider, settings,
    workspacePath, selectedFile, fileContent,
    addTerminalEntry,
    addTask, updateTask, addStepToTask,
    streamingContent, setStreamingContent, appendStreamingContent,
    addOpenFile,
    setSelectedFile,
    sessionStats, addTokens, addToolExecution, recordToolExecution, setLastVerification,
    projectMemory, latestCheckpoint, lastVerification,
    toolExecutions, tasks,
  } = useStore()

  const [input, setInput] = useState('')
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [pendingImages, setPendingImages] = useState<{ data: string; name: string }[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionType, setMentionType] = useState<'file' | 'folder' | 'web'>('file')
  const [showSessions, setShowSessions] = useState(false)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { allFiles, sessions, loadSession, deleteSession, newChat, currentSessionId,
    planMode, setPlanMode, settings: appSettings, setSettings: setAppSettings, setCancelRequested } = useStore()

  const activeProvider = settings.providers.find((p) => p.id === settings.activeProvider)

  useEffect(() => {
    // scrollIntoView would also scroll the overflow-hidden panel ancestors and push the header off-screen.
    const el = messagesScrollRef.current
    if (!el) return
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [messages, streamingContent])

  // Listen for streaming tokens; unsubscribe on unmount so tokens are never appended twice
  useEffect(() => window.api.onAIStream((token: string) => appendStreamingContent(token)), [appendStreamingContent])

  // Models the active provider's key can call, for the header picker
  useEffect(() => {
    setModelOverride(null)
    setAvailableModels([])
    if (!activeProvider?.apiKey) return
    let stale = false
    Promise.resolve(window.api.aiListModels({
      provider: activeProvider.id, apiKey: activeProvider.apiKey, baseUrl: activeProvider.baseUrl,
    }))
      .then((ids) => {
        if (stale || !Array.isArray(ids)) return
        const ranked = ids.slice(0, 40)
        setAvailableModels(ranked)
        const next = refreshProviderModelCatalog(useStore.getState().settings, activeProvider.id, ranked)
        if (next) {
          setAppSettings(next)
          void window.api.saveSettings(next)
        }
      })
      .catch(() => {})
    return () => { stale = true }
  }, [activeProvider?.id, activeProvider?.apiKey, activeProvider?.baseUrl, setAppSettings])

  // Paste image handler
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            setPendingImages(prev => [...prev, { data: reader.result as string, name: file.name || 'pasted-image.png' }])
          }
          reader.readAsDataURL(file)
        }
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  const executeTool = useCallback(async (toolName: string, args: Record<string, any>, taskId: string) => {
    addTerminalEntry({
      id: Date.now().toString(),
      type: 'command',
      content: `agent:tool ${toolName} ${JSON.stringify(args).slice(0, 120)}`,
      timestamp: Date.now(),
    })
    try {
      const workspace = useStore.getState().workspacePath || undefined
      return await window.api.toolExecute({
        name: toolName,
        args,
        workspace,
        sessionId: useStore.getState().currentSessionId || undefined,
        taskId,
      })
    } catch (err: any) {
      return { error: `Tool execution failed: ${err?.message || err}` }
    }
  }, [])

  /** Runs every tool block in the reply and records each run. Returns null when the reply has no tool blocks at all. */
  const processToolCalls = useCallback(async (content: string, taskId: string, runs: ToolRun[]) => {
    if (!hasToolBlock(content)) return null
    const { calls: toolCalls, errors: parseErrors } = parseToolCalls(content)

    const results: string[] = parseErrors.map((e) => `Tool call FAILED before running. ${e}`)
    for (const e of parseErrors) {
      addStepToTask(taskId, { id: `${Date.now()}-parse`, type: 'error', content: e, timestamp: Date.now() })
    }
    for (const toolCall of toolCalls) {
      if (useStore.getState().cancelRequested) break
      addStepToTask(taskId, {
        id: Date.now().toString(),
        type: 'action',
        content: `Executing: ${toolCall.name}(${JSON.stringify(toolCall.args).slice(0, 100)})`,
        timestamp: Date.now(),
        toolCall: { ...toolCall, id: Date.now().toString(), status: 'running' },
      } as AgentStep)

      const result = await executeTool(toolCall.name, toolCall.args, taskId)
      addToolExecution(settings.activeProvider)
      const ok = !!result && typeof result.error !== 'string'
      const resultText = ok ? (result?.result || 'Done') : result?.error || 'No result'
      runs.push({ name: toolCall.name, ok, summary: resultText.slice(0, 1_000) })
      recordToolExecution({
        name: toolCall.name,
        ok,
        timestamp: Date.now(),
        argsSummary: JSON.stringify(toolCall.args).slice(0, 600),
        resultSummary: resultText.slice(0, 1_200),
      })
      if (toolCall.name === 'run_command' && typeof toolCall.args.command === 'string') {
        setLastVerification({
          command: toolCall.args.command.slice(0, 500),
          ok,
          timestamp: Date.now(),
          summary: resultText.slice(0, 1_200),
        })
      }

      if (typeof result?.error === 'string') {
        addStepToTask(taskId, {
          id: (Date.now() + 1).toString(),
          type: 'error',
          content: `${toolCall.name} failed: ${result.error.slice(0, 800)}`,
          timestamp: Date.now(),
        })
      } else {
        addStepToTask(taskId, {
          id: (Date.now() + 1).toString(),
          type: 'observation',
          content: (result?.result || 'Done').slice(0, 800),
          timestamp: Date.now(),
        })
        if (toolCall.name === 'read_file' && typeof toolCall.args.path === 'string') {
          const opened = resolveWorkspacePath(useStore.getState().workspacePath || undefined, toolCall.args.path)
          addOpenFile(opened)
          setSelectedFile(opened)
        }
      }
      results.push(formatToolResult(toolCall, result || { error: 'The tool returned nothing.' }))
    }
    return results.join('\n\n')
  }, [executeTool, addTerminalEntry, addStepToTask, addOpenFile, setSelectedFile, recordToolExecution, setLastVerification])

  /**
   * Active provider first, then official free providers with keys. Auth failures stop the chain.
   * `preferredId` moves the provider that already answered this request to the front, so later
   * tool rounds don't keep hitting a provider that is rate limited.
   */
  const callWithFallback = useCallback(async (
    apiMessages: any[], preferredId?: string, taskKind: AgentTaskKind = 'analysis', stream = true
  ): Promise<ChatOutcome> => {
    const current = useStore.getState().settings
    const base = buildProviderChain(current.providers, current.activeProvider, undefined, taskKind)
    const preferred = base.find((p) => p.id === preferredId)
    const chain = preferred ? [preferred, ...base.filter((p) => p !== preferred)] : base
    if (chain.length === 0) return { error: noProviderNotice() }

    const failed: ProviderAttempt[] = []
    for (let i = 0; i < chain.length; i++) {
      const p = chain[i]
      if (useStore.getState().cancelRequested) return { error: 'Cancelled', cancelled: true }
      const override = p.id === current.activeProvider ? modelOverride : null
      setStreamingContent('')

      let result: Awaited<ReturnType<typeof window.api.aiChat>>
      const startedAt = Date.now()
      try {
        result = await window.api.aiChat({
          provider: p.id,
          apiKey: p.apiKey,
          baseUrl: p.baseUrl,
          model: override || p.model,
          messages: apiMessages,
          stream,
          autoSelect: !override,
          modelPerformance: p.performance?.models,
          taskKind,
        })
      } catch (err: any) {
        result = { error: err?.message || String(err), kind: 'other' }
      }

      if (Array.isArray(result.models) && result.models.length > 0) {
        const catalogSettings = refreshProviderModelCatalog(useStore.getState().settings, p.id, result.models)
        if (catalogSettings) {
          setAppSettings(catalogSettings)
          void window.api.saveSettings(catalogSettings)
        }
      }

      const usedModel = 'error' in result ? (override || p.model) : (result.model || override || p.model)
      const healthSettings = recordProviderOutcome(
        useStore.getState().settings,
        p.id,
        usedModel,
        !('error' in result),
        Date.now() - startedAt,
        taskKind
      )
      setAppSettings(healthSettings)
      void window.api.saveSettings(healthSettings)

      if ('error' in result) {
        if (result.kind === 'cancelled' || useStore.getState().cancelRequested) return { error: 'Cancelled', cancelled: true }
        if (result.kind === 'auth') return { error: describeAuthFailure(p.name, result.error) }
        failed.push({ name: p.name, error: result.error })
        if (i < chain.length - 1) {
          addTerminalEntry({
            id: Date.now().toString(),
            type: 'error',
            content: `${p.name} failed: ${result.error}. Trying ${chain[i + 1].name}...`,
            timestamp: Date.now(),
          })
        }
        continue
      }

      if (i > 0) {
        addTerminalEntry({ id: Date.now().toString(), type: 'success', content: `Fallback succeeded with ${p.name}`, timestamp: Date.now() })
      }

      const next = applyDiscoveredModel(useStore.getState().settings, p.id, result.model, !!override)
      if (next) {
        setAppSettings(next)
        void window.api.saveSettings(next)
        addTerminalEntry({
          id: Date.now().toString(),
          type: 'success',
          content: `${p.name}: now using ${result.model} (best available model on this key)`,
          timestamp: Date.now(),
        })
      }

      // The main process returns the complete reply; the streamed copy can still be missing its last tokens.
      return { content: result.content || useStore.getState().streamingContent, provider: p, failed }
    }
    return { error: describeProviderFailure(failed) }
  }, [modelOverride, addTerminalEntry, setAppSettings, setStreamingContent])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || chatLoading) return

    const provider = getActiveProvider()
    if (!provider?.apiKey) {
      addMessage({
        id: Date.now().toString(),
        role: 'system',
        content: missingKeyNotice(provider?.name),
        timestamp: Date.now(),
      })
      return
    }
    setCancelRequested(false)
    const taskKind = classifyAgentTask(text)

    // Image contents are not sent yet; the model is told which files were attached.
    let userContent = text
    if (pendingImages.length > 0) {
      userContent = text + '\n\n[Attached images: ' + pendingImages.map(img => img.name).join(', ') + ']'
    }

    const workspaceContext = buildContext({
      workspacePath,
      selectedFile,
      fileContent,
      projectMemory,
      conversationSummary: buildConversationSummary(messages),
      resumeNote: [
        latestCheckpoint ? `Latest recovery checkpoint: ${latestCheckpoint.label} (${latestCheckpoint.files.join(', ')})` : '',
        lastVerification ? `Last verification: ${lastVerification.ok ? 'passed' : 'failed'} ${lastVerification.command}\n${lastVerification.summary}` : '',
        tasks.length ? `Task state:\n${tasks.slice(-5).map((task) => `- ${task.status}: ${task.title}`).join('\n')}` : '',
        toolExecutions.length ? `Recent tool outcomes:\n${toolExecutions.slice(-8).map((run) => `- ${run.ok ? 'OK' : 'FAILED'} ${run.name}: ${run.resultSummary}`).join('\n')}` : '',
      ].filter(Boolean).join('\n'),
    })
    const systemPrompt = buildSystemPrompt({
      planMode,
      context: workspaceContext,
      customRules: appSettings.customRules,
    })
    const teamEnabled = shouldUseTeamMode(appSettings.teamMode, userContent, taskKind)

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userContent,
      timestamp: Date.now(),
    }
    addMessage(userMessage)
    setInput('')
    setPendingImages([])
    setChatLoading(true)
    setStreamingContent('')

    const taskId = Date.now().toString()
    addTask({
      id: taskId,
      title: text.slice(0, 60),
      status: 'running',
      steps: [{ id: taskId, type: 'thought', content: text, timestamp: Date.now() }],
      createdAt: Date.now(),
    })

    // System notices shown in the UI are not part of the model's history.
    let apiMessages = [
      { role: 'system', content: systemPrompt },
      ...buildHistory([...messages, { role: 'user', content: userContent }]),
    ]

    const finish = (status: 'done' | 'error', notice?: string) => {
      if (notice) addMessage({ id: `${Date.now()}-notice`, role: 'system', content: notice, timestamp: Date.now() })
      updateTask(taskId, { status })
      setStreamingContent('')
      setChatLoading(false)
    }

    let answeredBy: string | undefined
    let fallbackNoticeShown = false
    const call = async (): Promise<Extract<ChatOutcome, { content: string }> | null> => {
      const outcome = await callWithFallback(apiMessages, answeredBy, taskKind)
      if ('error' in outcome) {
        finish('error', outcome.cancelled ? 'Generation stopped.' : outcome.error)
        return null
      }
      if (outcome.failed.length > 0 && !fallbackNoticeShown) {
        fallbackNoticeShown = true
        addMessage({ id: `${Date.now()}-fallback`, role: 'system', content: describeFallback(outcome.failed, outcome.provider.name), timestamp: Date.now() })
      }
      answeredBy = outcome.provider.id
      return outcome
    }

    const teamProviderIds = buildProviderChain(
      useStore.getState().settings.providers,
      useStore.getState().settings.activeProvider,
      3,
      taskKind
    ).map((candidate) => candidate.id)
    const callRole = async (
      label: string,
      roleMessages: Array<{ role: string; content: string }>,
      preferredId: string | undefined,
      roleTaskKind: AgentTaskKind = 'analysis'
    ): Promise<string | null> => {
      addStepToTask(taskId, { id: `${Date.now()}-${label}`, type: 'thought', content: `${label}: working`, timestamp: Date.now() })
      const roleOutcome = await callWithFallback(roleMessages, preferredId, roleTaskKind, false)
      if ('error' in roleOutcome) {
        addStepToTask(taskId, { id: `${Date.now()}-${label}-error`, type: 'error', content: `${label}: ${roleOutcome.error}`, timestamp: Date.now() })
        return null
      }
      if (hasToolBlock(roleOutcome.content)) {
        addStepToTask(taskId, { id: `${Date.now()}-${label}-blocked`, type: 'error', content: `${label}: ignored an unauthorized tool request`, timestamp: Date.now() })
        return null
      }
      addTokens(Math.ceil(roleMessages.reduce((total, message) => total + message.content.length, 0) / 4), Math.ceil(roleOutcome.content.length / 4))
      addStepToTask(taskId, { id: `${Date.now()}-${label}-done`, type: 'observation', content: `${label}: complete via ${roleOutcome.provider.name}`, timestamp: Date.now() })
      return cleanResponse(roleOutcome.content)
    }

    let analyst = ''
    if (teamEnabled) {
      analyst = await callRole(
        'Analyst',
        buildAnalystMessages(userContent, workspaceContext, appSettings.teamProfile),
        teamProviderIds[1] || teamProviderIds[0]
      ) || ''
      if (useStore.getState().cancelRequested) { finish('done', 'Generation stopped.'); return }
      if (analyst) apiMessages[0] = { role: 'system', content: `${systemPrompt}\n\n${analystBriefForExecutor(analyst, appSettings.teamProfile)}` }
      addStepToTask(taskId, { id: `${Date.now()}-executor`, type: 'thought', content: 'Executor: acting on the request', timestamp: Date.now() })
    }

    let outcome = await call()
    if (!outcome) return
    addTokens(Math.ceil((userContent.length + systemPrompt.length) / 4), Math.ceil(outcome.content.length / 4))

    let round = 0
    let retried = false
    let reviewPass = 0
    let repairAttempted = false
    let latestReview: TeamReview = { verdict: 'approve', score: 0, issues: [], repairInstructions: '', usable: false }
    const toolRuns: ToolRun[] = []
    while (true) {
      const responseContent = outcome.content
      setStreamingContent('')

      if (!hasToolBlock(responseContent)) {
        const problems = assessResponse(responseContent, userContent, messages.some((message) => message.role === 'user' || message.role === 'assistant'))
        const claims = problems.length === 0 ? unverifiedClaims(responseContent, toolRuns) : []
        if ((problems.length > 0 || claims.length > 0) && !retried) {
          retried = true
          apiMessages = [
            ...apiMessages,
            ...(responseContent.trim() ? [{ role: 'assistant', content: responseContent }] : []),
            { role: 'user', content: problems.length > 0 ? correctionMessage(problems) : unverifiedClaimsMessage(claims) },
          ]
          outcome = await call()
          if (!outcome) return
          addTokens(0, Math.ceil(outcome.content.length / 4))
          continue
        }
        const cleaned = cleanResponse(responseContent)
        if (teamEnabled && cleaned && problems.length === 0 && claims.length === 0) {
          const evidence = describeToolEvidence(toolRuns)
          reviewPass++
          const reviewerText = await callRole(
            'Reviewer',
            buildReviewerMessages({ request: userContent, candidate: cleaned, evidence, pass: reviewPass, analystBrief: analyst || '', profile: appSettings.teamProfile }),
            teamProviderIds[2] || teamProviderIds[1] || teamProviderIds[0]
          )
          if (useStore.getState().cancelRequested) { finish('done', 'Generation stopped.'); return }
          if (reviewerText) {
            const parsedReview = parseTeamReview(reviewerText)
            if (parsedReview.usable || !latestReview.usable) latestReview = parsedReview
          }

          if (latestReview.usable && latestReview.verdict === 'revise' && !repairAttempted && reviewPass < TEAM_MAX_REVIEW_PASSES) {
            repairAttempted = true
            addStepToTask(taskId, { id: `${Date.now()}-repair`, type: 'thought', content: 'Executor: applying reviewer findings', timestamp: Date.now() })
            apiMessages = [
              ...apiMessages,
              { role: 'assistant', content: responseContent },
              { role: 'user', content: buildRepairMessage(latestReview) },
            ]
            outcome = await call()
            if (!outcome) return
            addTokens(0, Math.ceil(outcome.content.length / 4))
            continue
          }

          const synthesized = await callRole(
            'Verifier',
            buildSynthesizerMessages({ request: userContent, candidate: cleaned, evidence, review: latestReview, analystBrief: analyst || '', profile: appSettings.teamProfile }),
            teamProviderIds[1] || teamProviderIds[0],
            'quick'
          )
          if (useStore.getState().cancelRequested) { finish('done', 'Generation stopped.'); return }
          let finalContent = cleaned
          if (synthesized) {
            const finalProblems = assessResponse(synthesized, userContent, messages.some((message) => message.role === 'user' || message.role === 'assistant'))
            const finalClaims = finalProblems.length === 0 ? unverifiedClaims(synthesized, toolRuns) : []
            if (finalProblems.length === 0 && finalClaims.length === 0) finalContent = synthesized
            else addStepToTask(taskId, { id: `${Date.now()}-verifier-fallback`, type: 'error', content: 'Verifier: unusable synthesis discarded; kept the executor answer', timestamp: Date.now() })
          }
          addMessage({ id: `${Date.now()}-a${round}`, role: 'assistant', content: finalContent, timestamp: Date.now() })
          finish('done')
          return
        }
        if (cleaned) addMessage({ id: `${Date.now()}-a${round}`, role: 'assistant', content: cleaned, timestamp: Date.now() })
        finish('done', problems.length > 0
          ? unusableResponseNotice(problems, outcome.provider.name)
          : claims.length > 0 ? unverifiedClaimsNotice(claims) : undefined)
        return
      }

      addMessage({ id: `${Date.now()}-a${round}`, role: 'assistant', content: cleanResponse(responseContent), timestamp: Date.now() })
      if (useStore.getState().cancelRequested) { finish('done', 'Generation stopped.'); return }
      if (round >= MAX_TOOL_ROUNDS) { finish('done', maxRoundsNotice()); return }
      round++
      addStepToTask(taskId, { id: `${Date.now()}-t${round}`, type: 'thought', content: `Tool round ${round}`, timestamp: Date.now() })

      const toolResult = await processToolCalls(responseContent, taskId, toolRuns)
      if (useStore.getState().cancelRequested) { finish('done', 'Generation stopped.'); return }

      apiMessages = [
        ...apiMessages,
        { role: 'assistant', content: responseContent },
        { role: 'user', content: followUpMessage(toolResult || 'No tool call could be read from your reply.') },
      ]
      outcome = await call()
      if (!outcome) return
      addTokens(0, Math.ceil(outcome.content.length / 4))
    }
  }, [input, chatLoading, messages, getActiveProvider, workspacePath, selectedFile, fileContent, pendingImages, planMode, appSettings.customRules, appSettings.teamMode, callWithFallback, processToolCalls, setCancelRequested, projectMemory, latestCheckpoint, lastVerification, toolExecutions, tasks])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          setPendingImages(prev => [...prev, { data: reader.result as string, name: file.name }])
        }
        reader.readAsDataURL(file)
      } else {
        // Text file — add path as context
        const droppedPath = (file as File & { path?: string }).path
        setInput(prev => prev + (prev ? '\n' : '') + `File: ${droppedPath || file.name}`)
      }
    }
  }

  const quickActions = workspacePath
    ? [
        { icon: '🔍', label: 'Show git status', action: 'Show me the git status of this repository' },
        { icon: '📂', label: 'List all files', action: 'List all files in the workspace' },
        { icon: '🌳', label: 'Project tree', action: 'Show me the directory tree structure of this project' },
        { icon: '📊', label: 'Analyze changes', action: 'What files have been changed recently? Show me the git log and diffs.' },
        { icon: '🐛', label: 'Find bugs', action: 'Read the main source files and analyze them for potential bugs or issues.' },
        { icon: '📝', label: 'AI commit msg', action: 'Look at my current git diff and generate a conventional commit message for me.' },
        { icon: '🏗️', label: 'Explain codebase', action: 'Analyze the codebase structure and explain how the project is organized.' },
        { icon: '⚡', label: 'Refactor code', action: 'Find code that could be improved and refactor it for better readability and performance.' },
        { icon: '🧪', label: 'Add tests', action: 'Analyze the codebase and suggest/add tests for the main functionality.' },
        { icon: '🌐', label: 'Search web', action: 'Search the web for the latest documentation on this project.' },
      ]
    : [
        { icon: '📂', label: 'Open workspace', action: 'How do I open a workspace folder?' },
        { icon: '🔑', label: 'Configure API', action: 'How do I set up my API key?' },
        { icon: '💡', label: 'What can you do?', action: 'What are your capabilities? What tools do you have access to?' },
        { icon: '🚀', label: 'Quick start', action: 'Give me a quick overview of how to use this agent effectively.' },
        { icon: '⛓️', label: 'Web3 tools', action: 'What Web3 tools do you have? Can you check wallet balances, deploy contracts, or upload to IPFS?' },
      ]

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8, padding: '8px 12px' }}>
        <h2 style={{ flex: '0 0 auto' }}>🤖 Agent</h2>
        <div style={{ display: 'flex', flex: '1 1 520px', minWidth: 0, flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
          {/* Model quick-switch */}
          <select
            value={modelOverride || ''}
            onChange={(e) => setModelOverride(e.target.value || null)}
            style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 11, maxWidth: 180,
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', cursor: 'pointer', outline: 'none',
            }}
            title="Model for the active provider. Auto picks the strongest model this key can call; choosing one pins it for this session and disables auto-switching."
            aria-label="Model"
          >
            <option value="">Auto: {activeProvider?.model || 'best available'}</option>
            {[...new Set([...(activeProvider?.model ? [activeProvider.model] : []), ...availableModels])].map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>

          {/* Plan mode toggle */}
          <button
            className={`btn btn-sm ${planMode ? 'btn-success' : ''}`}
            onClick={() => {
              const newMode = !planMode
              setPlanMode(newMode)
              const newSettings = { ...appSettings, planMode: newMode }
              setAppSettings(newSettings)
              window.api.saveSettings(newSettings)
            }}
            title="Plan Mode: agent plans before executing"
          >
            📋 {planMode ? 'Plan ON' : 'Plan'}
          </button>

          <select
            value={appSettings.teamMode || 'auto'}
            onChange={(event) => {
              const teamMode = event.target.value as 'off' | 'auto' | 'always'
              const next = { ...appSettings, teamMode }
              setAppSettings(next)
              void window.api.saveSettings(next)
            }}
            style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 11,
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', cursor: 'pointer', outline: 'none',
            }}
            title="Environment: Normal uses one executor, Smart chooses per request, Agentic forces planner, worker, reviewer, repair, and verifier."
            aria-label="Agent environment"
          >
            <option value="off">Env: Normal</option>
            <option value="auto">Env: Smart</option>
            <option value="always">Env: Agentic</option>
          </select>
          {hasCustomTeamProfile(appSettings.teamProfile) && (
            <span className="badge badge-green" title="Custom agent role instructions are active">Custom team</span>
          )}

          {/* Stop button */}
          {chatLoading && (
            <button
              className="btn btn-sm btn-error"
              onClick={() => useStore.getState().stopGeneration()}
            >
              ⏹ Stop
            </button>
          )}

          {settings.activeProvider && (
            <span className="badge badge-blue">
              {settings.providers.find((p) => p.id === settings.activeProvider)?.name || settings.activeProvider}
            </span>
          )}
          <button
            className="btn btn-sm"
            onClick={() => setShowSessions(!showSessions)}
            title="Chat history (saved automatically on this machine)"
          >
            🕘 History
          </button>
          {messages.length > 0 && (
            <>
              <button className="btn btn-sm" onClick={() => {
                const md = messages.map(m => `**${m.role === 'user' ? 'You' : m.role === 'system' ? 'System' : 'Agent'}** (${new Date(m.timestamp).toLocaleTimeString()})\n\n${m.content}\n`).join('\n---\n\n')
                const blob = new Blob([md], { type: 'text/markdown' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `chat-${new Date().toISOString().slice(0,10)}.md`; a.click()
                URL.revokeObjectURL(url)
              }}>📤 Export</button>
              <button className="btn btn-sm" onClick={() => { void newChat() }} title="Start a new chat. The current one stays in history.">
                ＋ New chat
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sessions sidebar */}
      {showSessions && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 280, height: '100%',
          background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)',
          zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div className="panel-header">
            <h2 style={{ fontSize: 13 }}>🕘 History</h2>
            <button className="btn btn-sm" onClick={() => setShowSessions(false)} aria-label="Close history">✕</button>
          </div>
          <div className="panel-body" style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
            {sessions.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12, textAlign: 'center' }}>
                No chats yet. Conversations are saved automatically.
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { void loadSession(s.id); setShowSessions(false) }}
                  style={{
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                    background: currentSessionId === s.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                    border: currentSessionId === s.id ? '1px solid var(--accent)' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => { if (currentSessionId !== s.id) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { if (currentSessionId !== s.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {s.title}
                    </div>
                    <span
                      role="button"
                      aria-label={`Delete chat ${s.title}`}
                      title="Delete from disk"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm('Delete this chat from disk? This cannot be undone.')) void deleteSession(s.id)
                      }}
                      style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 4px', cursor: 'pointer' }}
                    >
                      ✕
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(s.updatedAt).toLocaleString()} · {s.messages.length} msgs
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(59,130,246,0.1)', border: '2px dashed var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, borderRadius: 8,
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent)' }}>
            📎 Drop files here
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div style={{
              width: 60, height: 60, borderRadius: 16, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--accent), #a855f7)',
              fontSize: 28, marginBottom: 8,
            }}>
              🤖
            </div>
            <div className="empty-state-text" style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
              VD Agent
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 480, lineHeight: 1.6 }}>
              Autonomous coding agent. Reads and edits your repo, runs commands, manages git,
              and picks the strongest free model available on your API key.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12, width: '100%', maxWidth: 480 }}>
              {quickActions.map((qa) => (
                <button
                  key={qa.label}
                  className="btn"
                  onClick={() => { setInput(qa.action); inputRef.current?.focus() }}
                  style={{ justifyContent: 'flex-start', fontSize: 12, padding: '8px 10px' }}
                >
                  {qa.icon} {qa.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              by <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)' }}>{AUTHOR_NAME}</a>
              {' · '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)' }}>⭐ Star on GitHub</a>
            </div>
          </div>
        ) : (
          <div>
            {messages.map((msg) => (
              <div key={msg.id} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{msg.role === 'user' ? '👤' : msg.role === 'system' ? '⚙️' : '🤖'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'Agent'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{
                  padding: '10px 14px',
                  background: msg.role === 'user' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  borderRadius: msg.role === 'user' ? '12px 12px 12px 2px' : '12px 12px 12px 12px',
                }}>
                  {msg.role === 'assistant' ? (
                    <MarkdownContent content={msg.content} />
                  ) : (
                    <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {msg.content.split('```tool').map((part, i) => {
                        if (i === 0) return <span key={i}>{part}</span>
                        const toolEnd = part.indexOf('```')
                        const toolJson = toolEnd >= 0 ? part.slice(0, toolEnd) : part
                        const afterTool = toolEnd >= 0 ? part.slice(toolEnd + 3) : ''
                        try {
                          const tool = JSON.parse(toolJson.trim())
                          const isEditTool = tool.name === 'edit_file'
                          const isWriteTool = tool.name === 'write_file' || tool.name === 'create_file'
                          const toolIcon = tool.name.startsWith('git_') ? '🔀' : tool.name.startsWith('web3_') ? '⛓️' : tool.name === 'web_search' ? '🌐' : tool.name.startsWith('image') ? '🖼️' : tool.name.startsWith('speech') || tool.name.startsWith('text_to_speech') ? '🎤' : tool.name === 'code_review' ? '🔍' : '⚡'
                          return (
                            <div key={i} style={{ margin: '4px 0' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '3px 10px', marginBottom: 4,
                                background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
                                borderRadius: 6, fontSize: 12, fontFamily: 'monospace',
                              }}>
                                {toolIcon} <span style={{ fontWeight: 600 }}>{tool.name}</span>
                                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                                  ({Object.entries(tool.args || {}).map(([k, v]) => `${k}=${String(v).slice(0, 50)}`).join(', ')})
                                </span>
                              </span>
                              {isEditTool && tool.args.path && tool.args.old_string && tool.args.new_string && (
                                <DiffViewer
                                  filePath={tool.args.path}
                                  oldContent={tool.args.old_string}
                                  newContent={tool.args.new_string}
                                />
                              )}
                              {(isWriteTool) && tool.args.path && tool.args.content && (
                                <DiffViewer
                                  filePath={tool.args.path}
                                  oldContent=""
                                  newContent={tool.args.content}
                                />
                              )}
                              {afterTool && <span style={{ fontSize: 13 }}>{afterTool}</span>}
                            </div>
                          )
                        } catch {
                          return <span key={i}>```tool{part}</span>
                        }
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming indicator */}
            {chatLoading && streamingContent && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>🤖</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Agent</span>
                  <span style={{ fontSize: 11, color: 'var(--accent)' }}>streaming...</span>
                </div>
                <div style={{
                  padding: '10px 14px', background: 'var(--bg-secondary)',
                  borderRadius: '12px 12px 12px 12px',
                }}>
                  <MarkdownContent content={streamingContent} />
                  <span style={{ opacity: 0.5, animation: 'blink 1s infinite' }}>▋</span>
                </div>
              </div>
            )}

            {chatLoading && !streamingContent && (
              <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
                <span style={{ animation: 'blink 1s infinite' }}>🤔</span> Thinking...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pending images preview */}
      {pendingImages.length > 0 && (
        <div style={{
          padding: '6px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 6, overflow: 'auto',
        }}>
          {pendingImages.map((img, i) => (
            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={img.data}
                alt={img.name}
                style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
              />
              <span
                onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}
                style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--error)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, cursor: 'pointer',
                }}
              >
                ×
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {planMode && (
              <span className="badge badge-green" style={{ fontSize: 10 }}>📋 Plan Mode</span>
            )}
            {sessionStats.toolsExecuted > 0 && (
              <span className="badge" style={{ fontSize: 9, padding: '1px 6px', background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
                ⚡ {sessionStats.toolsExecuted} tools
              </span>
            )}
            {sessionStats.inputTokens > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {((sessionStats.inputTokens + sessionStats.outputTokens) / 1000).toFixed(1)}K tokens
                {sessionStats.estimatedCost > 0 && ` · $${sessionStats.estimatedCost.toFixed(4)}`}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              ~{Math.ceil(input.length / 4)} tokens · {input.length} chars{' '}
              {messages.length > 0 && `· ${messages.length} msgs`}
            </span>
            {/* Context window usage bar */}
            {(() => {
              const totalChars = messages.reduce((s, m) => s + m.content.length + (m.toolCalls?.reduce((ts, t) => ts + JSON.stringify(t).length, 0) || 0), 0)
              const estimatedTokens = Math.ceil(totalChars / 4)
              const maxTokens = 128000
              const pct = Math.min(100, (estimatedTokens / maxTokens) * 100)
              const color = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#4ade80'
              return (
                <div title={`${estimatedTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens used`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 9, color }}>{pct.toFixed(0)}%</span>
                </div>
              )
            })()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button
            className="btn btn-sm"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            style={{ height: 42, minWidth: 42 }}
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                setPendingImages(prev => [...prev, { data: reader.result as string, name: file.name }])
              }
              reader.readAsDataURL(file)
              e.target.value = ''
            }}
          />
          {/* @mention suggestions */}
          {showMentions && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 14, right: 14,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 8, maxHeight: 200, overflow: 'auto', marginBottom: 4,
              boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
            }}>
              <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                {mentionType === 'file' ? '📁 Files' : mentionType === 'folder' ? '📂 Folders' : '🌐 Web'}
              </div>
              {(mentionType === 'file' ? allFiles.filter(f => !f.isDirectory) : mentionType === 'folder' ? allFiles.filter(f => f.isDirectory) : []).
                filter(f => !mentionQuery || f.name.toLowerCase().includes(mentionQuery.toLowerCase())).
                slice(0, 8).map((f) => (
                <div
                  key={f.path}
                  onClick={() => {
                    setInput(prev => prev.replace(/@\w*$/, `@${f.path} `))
                    setShowMentions(false)
                  }}
                  style={{
                    padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span>{f.isDirectory ? '📂' : '📄'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.path.split(/[/\\]/).slice(-2).join('/')}</span>
                </div>
              ))}
              {mentionType === 'web' && (
                <div
                  onClick={() => {
                    setInput(prev => prev.replace(/@\w*$/, `@web `) + 'Search for: ')
                    setShowMentions(false)
                  }}
                  style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span>🌐</span><span>Search the web...</span>
                </div>
              )}
            </div>
          )}
          <textarea
            ref={inputRef}
            className="input"
            aria-label="Chat message input"
            value={input}
            onChange={(e) => {
              const val = e.target.value
              setInput(val)
              // Detect @ mentions
              const lastAt = val.lastIndexOf('@')
              if (lastAt >= 0 && lastAt === val.length - 1) {
                setShowMentions(true)
                setMentionQuery('')
                setMentionType('file')
              } else if (lastAt >= 0 && !val.slice(lastAt).includes(' ')) {
                const query = val.slice(lastAt + 1)
                setShowMentions(true)
                setMentionQuery(query)
                setMentionType(query.length > 0 && !query.includes('/') ? (query.startsWith('w') ? 'web' : 'file') : 'file')
              } else {
                setShowMentions(false)
              }
            }}
            onKeyDown={(e) => {
              handleKeyDown(e)
              if (e.key === 'Escape') setShowMentions(false)
            }}
            placeholder="Ask me anything... Type @ for context, Ctrl+V for images, drag files. (Enter to send)"
            rows={2}
            style={{ resize: 'none', fontSize: 13, borderRadius: 12 }}
            disabled={chatLoading}
          />
          <button
            className="btn btn-primary"
            onClick={sendMessage}
            disabled={!input.trim() || chatLoading}
            style={{ alignSelf: 'flex-end', height: 42, minWidth: 42, borderRadius: 12 }}
          >
            {chatLoading ? '⟳' : '➤'}
          </button>
        </div>
      </div>
    </div>
  )
}

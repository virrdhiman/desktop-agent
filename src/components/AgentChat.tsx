/**
 * AgentChat — Main AI chat interface
 *
 * Features:
 * - Streaming AI responses with real-time token display
 * - Markdown rendering with syntax-highlighted code blocks
 * - Tool call execution (26 tools) with multi-round follow-up (up to 5 rounds)
 * - @context mentions (@file, @folder, @web) for precise targeting
 * - Image paste (Ctrl+V) and drag-and-drop support
 * - Model quick-switch dropdown in header
 * - Multi-provider auto-fallback on failure
 * - Plan Mode toggle (plan before executing)
 * - Stop generation button
 * - Session save/load
 * - Token counter in input area
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import type { ChatMessage, AgentStep } from '../types'
import { AGENT_TOOLS } from '../types'

const TOOL_SYSTEM_PROMPT = `You are an advanced autonomous AI coding agent — superior to Cursor, Copilot, and other AI assistants. You have full access to the user's local filesystem, development tools, and Web3 blockchain tools.

## YOUR CAPABILITIES
You can read, write, edit, create, and delete files. You can search codebases, run shell commands, manage git, search the web, and interact with Web3/blockchain tools (check wallet balances, explore transactions, deploy contracts, upload to IPFS). You execute actions autonomously — don't just describe what to do, DO IT.

## @CONTEXT MENTIONS
When users type @ in their message:
- @filename — references a specific file
- @folder — references a directory
- @web — triggers a web search

## TOOL USAGE
To use a tool, format your response EXACTLY like this:
\\\`\\\`\\\`tool
{"name": "tool_name", "args": {"arg1": "value1"}}
\\\`\\\`\\\`

You can call multiple tools in sequence. After each, you'll see the result and can continue working.

## AVAILABLE TOOLS
${AGENT_TOOLS.map((t) => `- **${t.name}**: ${t.description}\n  Params: ${JSON.stringify(t.parameters)}`).join('\n\n')}

## BEST PRACTICES
1. **Read before writing** — always read a file before editing it
2. **Edit precisely** — use edit_file for targeted changes, not full rewrites
3. **Search first** — use search_code to find relevant code before making changes
4. **Verify changes** — read the file after editing to confirm it worked
5. **Use git** — commit frequently with descriptive messages
6. **Be thorough** — complete the entire task, not just part of it
7. **Search the web** — use web_search when you need docs, APIs, or references

## PLAN MODE
When the user has Plan Mode enabled, FIRST describe your plan in detail:
1. List the files you'll read/modify
2. Describe the changes you'll make
3. Explain the order of operations
4. Then ask the user to confirm before executing

When Plan Mode is OFF, just execute directly.

## RESPONSE FORMAT
Use markdown formatting:
- Code blocks with language tags: \\\`\\\`\\\`typescript\\ncode\\n\\\`\\\`\\\`
- **Bold** for emphasis
- Lists for steps
- Headers for structure
- Use | tables for structured data
Start with a brief plan, execute tools step by step, end with a summary.`

// Simple syntax highlighter (uses RegExp constructor to avoid // comment parsing issues)
function highlightSyntax(code: string, lang?: string): string {
  let escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const jsKW = 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|async|await|try|catch|throw|typeof|instanceof|in|of|true|false|null|undefined|void|delete|yield|static|super|with|debugger'
  const pyKW = 'def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|True|False|None|and|or|not|in|is|global|nonlocal|assert|del|print|self'
  const goKW = 'func|package|import|var|const|type|struct|interface|return|if|else|for|range|switch|case|default|break|continue|go|defer|chan|map|make|new|true|false|nil'
  const rsKW = 'fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|crate|return|if|else|for|while|loop|match|break|continue|true|false|as|in|ref|move|async|await'

  let kwStr = jsKW
  if (lang === 'python' || lang === 'py') kwStr = pyKW
  else if (lang === 'go') kwStr = goKW
  else if (lang === 'rust' || lang === 'rs') kwStr = rsKW

  // Keywords
  escaped = escaped.replace(new RegExp('\\b(' + kwStr + ')\\b', 'g'), '<span style="color:#c678dd">$1</span>')

  // Strings
  escaped = escaped.replace(/('[^']*')/g, '<span style="color:#98c379">$1</span>')
  escaped = escaped.replace(/("[^"]*")/g, '<span style="color:#98c379">$1</span>')

  // Numbers
  escaped = escaped.replace(new RegExp('\\b(\\d+\\.?\\d*)\\b', 'g'), '<span style="color:#d19a66">$1</span>')

  // Hash comments
  escaped = escaped.replace(/(#[^\n]*)/g, '<span style="color:#5c6370;font-style:italic">$1</span>')

  // Capitalized types
  escaped = escaped.replace(new RegExp('\\b([A-Z][a-zA-Z0-9]+)\\b', 'g'), '<span style="color:#e5c07b">$1</span>')

  return escaped
}


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
    messages, addMessage, clearMessages,
    chatLoading, setChatLoading,
    getActiveProvider, settings,
    workspacePath, selectedFile, fileContent,
    addTerminalEntry,
    addTask, updateTask, addStepToTask,
    streamingContent, setStreamingContent, appendStreamingContent,
    addOpenFile,
    setSelectedFile,
  } = useStore()

  const [input, setInput] = useState('')
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pendingImages, setPendingImages] = useState<{ data: string; name: string }[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionType, setMentionType] = useState<'file' | 'folder' | 'web'>('file')
  const [showSessions, setShowSessions] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { allFiles, sessions, saveSession, loadSession, deleteSession, currentSessionId,
    planMode, setPlanMode, settings: appSettings, setSettings: setAppSettings } = useStore()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Listen for streaming tokens
  useEffect(() => {
    const handler = (token: string) => {
      appendStreamingContent(token)
    }
    window.api.onAIStream(handler)
  }, [])

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

  const executeTool = useCallback(async (toolName: string, args: Record<string, any>) => {
    addTerminalEntry({
      id: Date.now().toString(),
      type: 'command',
      content: `agent:tool ${toolName} ${JSON.stringify(args).slice(0, 120)}`,
      timestamp: Date.now(),
    })
    return await window.api.toolExecute({ name: toolName, args })
  }, [])

  const processToolCalls = useCallback(async (content: string, taskId: string) => {
    const toolRegex = /```tool\n(\{[\s\S]*?\})\n```/g
    let match
    const toolCalls: { name: string; args: Record<string, any> }[] = []

    while ((match = toolRegex.exec(content)) !== null) {
      try {
        toolCalls.push(JSON.parse(match[1]))
      } catch {}
    }
    if (toolCalls.length === 0) return null

    const results: string[] = []
    for (const toolCall of toolCalls) {
      addStepToTask(taskId, {
        id: Date.now().toString(),
        type: 'action',
        content: `Executing: ${toolCall.name}(${JSON.stringify(toolCall.args).slice(0, 100)})`,
        timestamp: Date.now(),
        toolCall: { ...toolCall, id: Date.now().toString(), status: 'running' },
      } as AgentStep)

      const result = await executeTool(toolCall.name, toolCall.args)

      if ('error' in result) {
        addStepToTask(taskId, {
          id: (Date.now() + 1).toString(),
          type: 'error',
          content: `Error: ${result.error}`,
          timestamp: Date.now(),
        })
        results.push(`Tool ${toolCall.name} failed: ${result.error}`)
      } else {
        addStepToTask(taskId, {
          id: (Date.now() + 1).toString(),
          type: 'observation',
          content: (result.result || 'Done').slice(0, 800),
          timestamp: Date.now(),
        })
        results.push(`Tool ${toolCall.name} result:\n${result.result}`)
        if (toolCall.name === 'read_file' && toolCall.args.path) {
          addOpenFile(toolCall.args.path)
          setSelectedFile(toolCall.args.path)
        }
      }
    }
    return results.join('\n\n')
  }, [executeTool, addTerminalEntry, addStepToTask, addOpenFile, setSelectedFile])

  // Try providers in fallback order
  const callWithFallback = useCallback(async (apiMessages: any[], _isFirst: boolean) => {
    const provider = getActiveProvider()
    if (!provider) return { error: 'No provider configured' }

    // Build fallback chain: active provider first, then free providers
    const fallbackChain = [
      provider,
      ...settings.providers.filter(p =>
        p.id !== provider.id && p.freeTier && p.apiKey
      ).slice(0, 3)
    ]

    for (const p of fallbackChain) {
      setStreamingContent('')
      const result = await window.api.aiChat({
        provider: p.id,
        apiKey: p.apiKey,
        baseUrl: p.baseUrl,
        model: modelOverride || p.model,
        messages: apiMessages,
        stream: true,
      })

      if ('error' in result) {
        // If it's the first provider, try next
        if (fallbackChain.indexOf(p) < fallbackChain.length - 1) {
          addTerminalEntry({
            id: Date.now().toString(),
            type: 'error',
            content: `${p.name} failed: ${result.error}. Trying next provider...`,
            timestamp: Date.now(),
          })
          continue
        }
        return result
      }

      // Success
      if (fallbackChain.indexOf(p) > 0) {
        addTerminalEntry({
          id: Date.now().toString(),
          type: 'success',
          content: `Fallback successful with ${p.name}`,
          timestamp: Date.now(),
        })
      }

      const streamed = useStore.getState().streamingContent
      return { content: streamed || result.content }
    }
    return { error: 'All providers failed' }
  }, [getActiveProvider, settings.providers, modelOverride])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || chatLoading) return

    const provider = getActiveProvider()
    if (!provider?.apiKey) {
      addMessage({
        id: Date.now().toString(),
        role: 'system',
        content: '⚠️ No API key configured. Go to Settings → select a provider → add your API key.',
        timestamp: Date.now(),
      })
      return
    }

    // Build user content with optional images
    let userContent = text
    if (pendingImages.length > 0) {
      // For multimodal: include image descriptions
      userContent = text + '\n\n[Attached images: ' + pendingImages.map(img => img.name).join(', ') + ']'
    }

    // Build context
    const contextParts: string[] = []
    if (workspacePath) contextParts.push(`Workspace: ${workspacePath}`)
    if (selectedFile) contextParts.push(`Current file: ${selectedFile}\n\`\`\`\n${fileContent.slice(0, 5000)}\n\`\`\``)

    const systemPrompt = `${TOOL_SYSTEM_PROMPT}\n${planMode ? '\n📋 PLAN MODE IS ACTIVE — Plan before executing!' : '\n⚡ EXECUTE MODE — Act directly.'}${workspacePath ? `\nCurrent workspace: ${workspacePath}` : ''}\n${contextParts.length > 0 ? '\nContext:\n' + contextParts.join('\n') : ''}${appSettings.customRules ? `\n\n📝 Custom Rules:\n${appSettings.customRules}` : ''}`

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

    // Build messages for API
    let apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-20).map((m) => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
      { role: 'user', content: userContent },
    ]

    // API call with fallback
    const result = await callWithFallback(apiMessages, true)

    let responseContent: string
    if ('error' in result) {
      responseContent = `❌ Error: ${result.error}`
    } else {
      responseContent = result.content
    }

    addMessage({
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: responseContent,
      timestamp: Date.now(),
    })
    setStreamingContent('')

    // Tool call loop
    if (responseContent.includes('```tool')) {
      addStepToTask(taskId, {
        id: Date.now().toString(),
        type: 'thought',
        content: 'Processing tool calls...',
        timestamp: Date.now(),
      })

      let toolResult = await processToolCalls(responseContent, taskId)
      let followUpCount = 0

      while (toolResult && followUpCount < 5) {
        followUpCount++
        apiMessages = [
          ...apiMessages,
          { role: 'assistant', content: responseContent },
          { role: 'user', content: `Tool execution results:\n${toolResult}\n\nPlease analyze the results and continue with the task if needed. Use more tools if necessary.` },
        ]

        const followUpResult = await callWithFallback(apiMessages, false)
        if ('error' in followUpResult) {
          addMessage({
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `❌ Error in follow-up: ${followUpResult.error}`,
            timestamp: Date.now(),
          })
          break
        }

        responseContent = followUpResult.content
        addMessage({
          id: (Date.now() + 2 + followUpCount).toString(),
          role: 'assistant',
          content: responseContent,
          timestamp: Date.now(),
        })
        setStreamingContent('')

        if (responseContent.includes('```tool')) {
          toolResult = await processToolCalls(responseContent, taskId)
        } else {
          toolResult = null
        }
      }
      updateTask(taskId, { status: 'done' })
    } else {
      updateTask(taskId, { status: 'done' })
    }

    setChatLoading(false)
  }, [input, chatLoading, messages, getActiveProvider, workspacePath, selectedFile, fileContent, streamingContent, pendingImages, modelOverride])

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
        setInput(prev => prev + (prev ? '\n' : '') + `File: ${file.path || file.name}`)
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
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="panel-header">
        <h2>🤖 Agent</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Model quick-switch */}
          <select
            value={modelOverride || ''}
            onChange={(e) => setModelOverride(e.target.value || null)}
            style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 11,
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', cursor: 'pointer', outline: 'none',
            }}
            title="Quick-switch model (overrides settings)"
          >
            <option value="">Default: {settings.providers.find(p => p.id === settings.activeProvider)?.model || settings.activeProvider}</option>
            {settings.providers.filter(p => p.apiKey || p.id === 'ollama' || p.id === 'lmstudio').map(p => (
              <option key={p.id} value={p.model}>{p.name} — {p.model}</option>
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
          <button className="btn btn-sm" onClick={() => { saveSession(); setShowSessions(!showSessions) }}>
            💾
          </button>
          {messages.length > 0 && (
            <>
              <button className="btn btn-sm" onClick={() => {
                const md = messages.map(m => `**${m.role === 'user' ? 'You' : 'Agent'}** (${new Date(m.timestamp).toLocaleTimeString()})\n\n${m.content}\n`).join('\n---\n\n')
                const blob = new Blob([md], { type: 'text/markdown' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `chat-${new Date().toISOString().slice(0,10)}.md`; a.click()
                URL.revokeObjectURL(url)
              }}>📤 Export</button>
              <button className="btn btn-sm" onClick={clearMessages}>Clear</button>
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
            <h2 style={{ fontSize: 13 }}>💾 Sessions</h2>
            <button className="btn btn-sm" onClick={() => setShowSessions(false)}>✕</button>
          </div>
          <div className="panel-body" style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
            {sessions.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12, textAlign: 'center' }}>
                No saved sessions yet
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { loadSession(s.id); setShowSessions(false) }}
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
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                      style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 4px', cursor: 'pointer' }}
                    >
                      ✕
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(s.timestamp).toLocaleString()} · {s.messages.length} msgs
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
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
              Freebuff Agent
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 480, lineHeight: 1.6 }}>
              Your autonomous AI coding agent. I can read files, edit code, run commands,
              manage git, search the web, and perform complex multi-step tasks autonomously.
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
                          return (
                            <span key={i}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '3px 10px', margin: '4px 0',
                                background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
                                borderRadius: 6, fontSize: 12, fontFamily: 'monospace',
                              }}>
                                ⚡ <span style={{ fontWeight: 600 }}>{tool.name}</span>
                                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                                  ({Object.entries(tool.args || {}).map(([k, v]) => `${k}=${String(v).slice(0, 50)}`).join(', ')})
                                </span>
                              </span>
                              {afterTool}
                            </span>
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
            <div ref={messagesEndRef} />
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
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            ~{Math.ceil(input.length / 4)} tokens · {input.length} chars{' '}
            {messages.length > 0 && `· ${messages.length} msgs`}
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

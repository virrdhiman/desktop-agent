/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * VD Agent — Type Definitions
 *
 * All TypeScript interfaces, types, and constants used throughout the app.
 * Includes:
 * - File system types (FileEntry)
 * - Git types (GitStatus, GitLogEntry, GitBranchInfo)
 * - AI types (ChatMessage, ToolCall, AgentTask, AgentStep)
 * - Provider types (ProviderConfig, Settings)
 * - Terminal types (TerminalEntry, TerminalTab)
 * - AGENT_TOOLS constant — the tool definitions sent to the AI model
 */
export interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

export interface GitStatus {
  branch: string
  tracking: string
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  not_added: string[]
  deleted: string[]
  renamed: { from: string; to: string }[]
  isClean: boolean
  error?: string
}

export interface GitLogEntry {
  hash: string
  date: string
  message: string
  author: string
}

export interface GitBranchInfo {
  current: string
  branches: string[]
}

export interface ProviderConfig {
  id: string
  name: string
  apiKey: string
  /** True when a real key is stored in the main process and was omitted from this copy. */
  hasKey?: boolean
  /** Ask the main process to delete the stored key. */
  clearKey?: boolean
  baseUrl: string
  model: string
  models?: string[]
  modelsUpdatedAt?: number
  freeTier?: boolean
  signupUrl?: string
  notes?: string
  performance?: ProviderPerformance
}

export type AgentTaskKind = 'coding' | 'analysis' | 'documentation' | 'quick'
export type TeamMode = 'off' | 'auto' | 'always'
export type TeamPreset = 'default' | 'coding' | 'research' | 'csv' | 'security'
export type TeamTokenBudget = 'cheap' | 'balanced' | 'strong'

export interface TeamRoleProfile {
  analyst?: string
  executor?: string
  reviewer?: string
  verifier?: string
}

export interface ModelPerformance {
  successes: number
  failures: number
  avgLatencyMs: number
  lastUsedAt: number
  taskSuccesses?: Partial<Record<AgentTaskKind, number>>
}

export interface ProviderPerformance extends ModelPerformance {
  models?: Record<string, ModelPerformance>
  consecutiveFailures?: number
  cooldownUntil?: number
}

export interface Settings {
  providers: ProviderConfig[]
  activeProvider: string
  workspacePath: string
  customRules?: string
  planMode?: boolean
  teamMode?: TeamMode
  teamPreset?: TeamPreset
  teamTokenBudget?: TeamTokenBudget
  dynamicTeam?: boolean
  teamProfile?: TeamRoleProfile
  permissionMode?: 'ask-risky' | 'ask-all-writes' | 'trusted'
  autoUpdate?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  fileContext?: string
  toolCalls?: ToolCall[]
  streaming?: boolean
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  pinned?: boolean
  summary?: string
  resume?: SessionResumeState
}

export interface CheckpointSummary {
  id: string
  sessionId: string
  createdAt: number
  label: string
  files: string[]
}

export interface ToolExecutionSummary {
  name: string
  ok: boolean
  timestamp: number
  argsSummary: string
  resultSummary: string
}

export interface VerificationSummary {
  command: string
  ok: boolean
  timestamp: number
  summary: string
}

export interface SessionResumeState {
  workspacePath?: string
  selectedFile?: string | null
  openFiles?: string[]
  tasks?: AgentTask[]
  terminalTabs?: TerminalTab[]
  terminalEntries?: TerminalEntry[]
  toolExecutions?: ToolExecutionSummary[]
  providerId?: string
  model?: string
  projectMemory?: string
  conversationSummary?: string
  checkpoint?: CheckpointSummary
  lastVerification?: VerificationSummary
  git?: { branch?: string; head?: string; dirty?: boolean }
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
  result?: string
  error?: string
  status: 'pending' | 'running' | 'done' | 'error'
}

export interface AgentTask {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'error'
  steps: AgentStep[]
  createdAt: number
}

export interface AgentStep {
  id: string
  type: 'thought' | 'action' | 'observation' | 'error'
  content: string
  timestamp: number
  toolCall?: ToolCall
  trace?: AgentTraceEntry
}

export interface AgentTraceEntry {
  role: string
  status: 'running' | 'done' | 'error' | 'blocked'
  input: string
  output?: string
  evidence?: string
  provider?: string
}

export interface TerminalEntry {
  id: string
  type: 'command' | 'output' | 'error' | 'success'
  content: string
  timestamp: number
}

export interface TerminalTab {
  id: string
  name: string
  cwd: string
}

export type Panel = 'chat' | 'files' | 'git' | 'terminal' | 'settings' | 'tasks' | 'branches' | 'sessions' | 'search'

// Tool definitions the agent can use
export const AGENT_TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: { path: 'string — path to the file' },
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates or overwrites)',
    parameters: { path: 'string', content: 'string' },
  },
  {
    name: 'edit_file',
    description: 'Edit a specific part of a file by replacing old_string with new_string',
    parameters: { path: 'string', old_string: 'string — exact text to find', new_string: 'string — replacement text' },
  },
  {
    name: 'create_file',
    description: 'Create a new file with optional content',
    parameters: { path: 'string', content: 'string (optional)' },
  },
  {
    name: 'delete_file',
    description: 'Delete a file',
    parameters: { path: 'string' },
  },
  {
    name: 'list_files',
    description: 'List files and directories in a path',
    parameters: { path: 'string — directory path' },
  },
  {
    name: 'search_files',
    description: 'Search for files by name pattern',
    parameters: { pattern: 'string', path: 'string (optional)' },
  },
  {
    name: 'search_code',
    description: 'Search through file contents for a pattern (grep-like)',
    parameters: { pattern: 'string', path: 'string (optional)' },
  },
  {
    name: 'repo_map',
    description: 'Build a local repository map with files, languages, sizes, imports, test markers, and top symbols. Use before broad multi-file changes.',
    parameters: { path: 'string (optional)', limit: 'number (optional, default 160)' },
  },
  {
    name: 'repo_plan',
    description: 'Create a repo-wide implementation plan for a user request: likely files, tests/docs/config, workflow, and verification commands.',
    parameters: { query: 'string — user request or technical goal', path: 'string (optional)', limit: 'number (optional, default 12)' },
  },
  {
    name: 'repo_search',
    description: 'Rank local repository files by query relevance using path, symbol, and content snippets with line numbers.',
    parameters: { query: 'string', path: 'string (optional)', limit: 'number (optional, default 30)' },
  },
  {
    name: 'vscode_context',
    description: 'Read the latest VS Code active editor, selection, visible files, and open files exported by the VD Agent Bridge extension.',
    parameters: { path: 'string (optional) — workspace path, defaults to current workspace' },
  },
  {
    name: 'vscode_open',
    description: 'Ask the VD Agent Bridge VS Code extension to open a workspace file at an optional line/column.',
    parameters: { path: 'string — file to open', line: 'number (optional)', column: 'number (optional)' },
  },
  {
    name: 'vscode_apply_edit',
    description: 'Apply an exact old_string/new_string replacement through VS Code, then save and reveal the edited file.',
    parameters: { path: 'string — file to edit', old_string: 'string — exact text to find', new_string: 'string — replacement text' },
  },
  {
    name: 'vscode_show_diff',
    description: 'Open a VS Code diff preview for an exact replacement or full preview content without changing the source file.',
    parameters: { path: 'string — source file', old_string: 'string (optional)', new_string: 'string (optional)', content: 'string (optional full preview content)', title: 'string (optional)' },
  },
  {
    name: 'vscode_command',
    description: 'Run a VS Code command through the bridge extension. Risky: use only when a specific VS Code command is needed.',
    parameters: { command: 'string — VS Code command id', args: 'array (optional)', path: 'string (optional workspace root)' },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command',
    parameters: { command: 'string', cwd: 'string (optional)' },
  },
  {
    name: 'git_status',
    description: 'Get git repository status',
    parameters: { path: 'string (optional)' },
  },
  {
    name: 'git_diff',
    description: 'Show git diff',
    parameters: { path: 'string (optional)', file: 'string (optional)' },
  },
  {
    name: 'git_commit',
    description: 'Stage all changes and commit',
    parameters: { message: 'string', path: 'string (optional)', add: 'boolean (optional)' },
  },
  {
    name: 'git_log',
    description: 'Show recent git log',
    parameters: { path: 'string (optional)', count: 'number (optional)' },
  },
  {
    name: 'git_branch',
    description: 'List branches, or create/switch branches',
    parameters: { path: 'string (optional)', branch: 'string (optional)', create: 'boolean (optional)', switch: 'boolean (optional)' },
  },
  {
    name: 'git_stash',
    description: 'Stash or pop stash of uncommitted changes',
    parameters: { path: 'string (optional)', pop: 'boolean (optional)' },
  },
  {
    name: 'web_search',
    description: 'Search the web for documentation, references, or answers',
    parameters: { query: 'string — search query' },
  },
  {
    name: 'git_generate_commit',
    description: 'Get the git diff to help generate a commit message',
    parameters: { path: 'string (optional)', file: 'string (optional)' },
  },
  {
    name: 'git_undo_last',
    description: 'Undo the last commit, keeping changes staged',
    parameters: { path: 'string (optional)' },
  },
  {
    name: 'git_discard_changes',
    description: 'Discard all uncommitted changes (dangerous!)',
    parameters: { path: 'string (optional)' },
  },
  {
    name: 'multi_file_edit',
    description: 'Edit multiple files at once with targeted replacements',
    parameters: { edits: 'array of {path, old_string, new_string}' },
  },
  {
    name: 'preview_edits',
    description: 'Preview a unified diff for targeted edits without writing files. Use before risky or multi-file edits.',
    parameters: { edits: 'array of {path, old_string, new_string}', path: 'string (optional) — workspace root for relative diff paths' },
  },
  {
    name: 'read_directory_tree',
    description: 'Get a visual tree view of the project structure',
    parameters: { path: 'string (optional)' },
  },
  {
    name: 'archive_list',
    description: 'Safely list every entry in a ZIP archive without extracting it',
    parameters: { archive_path: 'string - path to a .zip file' },
  },
  {
    name: 'archive_extract',
    description: 'Safely extract a ZIP archive into a workspace folder with zip-slip, symlink, entry-count, and expanded-size protections',
    parameters: { archive_path: 'string - path to a .zip file', output_path: 'string - destination directory', overwrite: 'boolean (optional, default false)' },
  },
  {
    name: 'web3_balance',
    description: 'Check crypto wallet balance on any EVM chain',
    parameters: { address: 'string — wallet address', chain: 'string — ethereum|polygon|arbitrum|optimism|base|bsc|sepolia' },
  },
  {
    name: 'web3_explorer',
    description: 'Look up transactions, addresses, or blocks on block explorers',
    parameters: { tx: 'string (optional)', address: 'string (optional)', block: 'string (optional)', chain: 'string (optional)' },
  },
  {
    name: 'web3_ipfs',
    description: 'Upload or fetch content from IPFS decentralized storage',
    parameters: { action: 'string — upload|fetch', content: 'string (for upload)', cid: 'string (for fetch)', name: 'string (optional)' },
  },
  {
    name: 'web3_contract',
    description: 'Smart contract operations: verify, get ABI',
    parameters: { action: 'string — verify|abi', address: 'string', chain: 'string (optional)' },
  },
  {
    name: 'web3_deploy',
    description: 'Get deployment instructions for a smart contract',
    parameters: { file: 'string — contract file path', chain: 'string — target network' },
  },
  {
    name: 'generate_image',
    description: 'Generate an image from a text prompt using Pollinations.ai (free, no API key)',
    parameters: { prompt: 'string — image description', width: 'number (optional, default 1024)', height: 'number (optional, default 1024)', model: 'string (optional: flux, turbo)', seed: 'number (optional)' },
  },
  {
    name: 'generate_video',
    description: 'Get a Pollinations video URL or setup instructions for Runway/Kling (does not render video locally)',
    parameters: { provider: 'string — pollinations|wan|runway|kling', prompt: 'string (optional)' },
  },
  {
    name: 'comfyui_workflow',
    description: 'Get ComfyUI setup and workflow instructions',
    parameters: {},
  },
  {
    name: 'speech_to_text',
    description: 'Transcribe an audio file with Whisper via the configured Groq or Hugging Face key',
    parameters: { audio_path: 'string — path to audio file', language: 'string (optional, default en)' },
  },
  {
    name: 'text_to_speech',
    description: 'Return a Pollinations text-to-speech audio URL for the given text',
    parameters: { text: 'string — text to speak', voice: 'string (optional — voice name)', rate: 'number (optional, 0.1-10, default 1)' },
  },
  {
    name: 'image_analysis',
    description: 'Analyze an image with Gemini (requires a Gemini key): describe contents, read text, etc.',
    parameters: { image_url: 'string — URL or local path of image', question: 'string (optional — specific question about the image)' },
  },
  {
    name: 'code_review',
    description: 'Review code in a file for bugs, improvements, and best practices',
    parameters: { path: 'string — file to review', focus: 'string (optional — security|performance|style|all)' },
  },
] as const

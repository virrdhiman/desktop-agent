/**
 * Freebuff Agent — Type Definitions
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
  baseUrl: string
  model: string
  freeTier?: boolean
  signupUrl?: string
  notes?: string
}

export interface Settings {
  providers: ProviderConfig[]
  activeProvider: string
  workspacePath: string
  customRules?: string
  planMode?: boolean
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

export type Panel = 'chat' | 'files' | 'git' | 'terminal' | 'settings' | 'tasks' | 'branches' | 'sessions'

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
    name: 'read_directory_tree',
    description: 'Get a visual tree view of the project structure',
    parameters: { path: 'string (optional)' },
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
] as const

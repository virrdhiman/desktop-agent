# 🛠️ Agent Tools Reference

Freebuff Agent has **26 autonomous tools** it can use to interact with your filesystem, git, web, and blockchain.

## 📁 File System Tools

### `read_file`
Read the contents of a file.
```json
{ "name": "read_file", "args": { "path": "src/index.ts" } }
```

### `write_file`
Write content to a file (creates or overwrites).
```json
{ "name": "write_file", "args": { "path": "output.txt", "content": "Hello world" } }
```

### `edit_file`
Edit a specific part of a file by replacing old text with new text.
```json
{ "name": "edit_file", "args": { "path": "src/app.ts", "old_string": "old code", "new_string": "new code" } }
```

### `create_file`
Create a new file with optional content.
```json
{ "name": "create_file", "args": { "path": "new-file.ts", "content": "export {}" } }
```

### `delete_file`
Delete a file permanently.
```json
{ "name": "delete_file", "args": { "path": "temp.txt" } }
```

### `list_files`
List files and directories in a path.
```json
{ "name": "list_files", "args": { "path": "src/" } }
```

### `search_files`
Search for files by name pattern.
```json
{ "name": "search_files", "args": { "pattern": "config", "path": "." } }
```

### `search_code`
Search through file contents for a pattern (grep-like).
```json
{ "name": "search_code", "args": { "pattern": "useState", "path": "src/" } }
```

## 🔧 Command Tools

### `run_command`
Execute a shell command.
```json
{ "name": "run_command", "args": { "command": "npm test", "cwd": "." } }
```

## 🌳 Project Structure

### `read_directory_tree`
Get a visual tree view of the project structure.
```json
{ "name": "read_directory_tree", "args": { "path": "." } }
```

### `multi_file_edit`
Edit multiple files at once with targeted replacements.
```json
{ "name": "multi_file_edit", "args": { "edits": [
  { "path": "file1.ts", "old_string": "a", "new_string": "b" },
  { "path": "file2.ts", "old_string": "c", "new_string": "d" }
] } }
```

## 🔀 Git Tools

### `git_status`
Get git repository status (branch, staged, modified, untracked files).

### `git_diff`
Show git diff for all files or a specific file.

### `git_commit`
Stage all changes and commit with a message.

### `git_log`
Show recent git log with hashes, messages, and authors.

### `git_branch`
List branches, or create/switch branches.

### `git_stash`
Stash or pop stash of uncommitted changes.

### `git_generate_commit`
Get the git diff to help generate a commit message.

### `git_undo_last`
Undo the last commit, keeping changes staged.

### `git_discard_changes`
Discard all uncommitted changes (⚠️ dangerous!).

## 🌐 Web Tools

### `web_search`
Search the web for documentation, references, or answers.
```json
{ "name": "web_search", "args": { "query": "React useEffect cleanup" } }
```

## ⛓️ Web3 / Blockchain Tools

### `web3_balance`
Check crypto wallet balance on any EVM chain.
```json
{ "name": "web3_balance", "args": { "address": "0x...", "chain": "ethereum" } }
```
Supported chains: `ethereum`, `polygon`, `arbitrum`, `optimism`, `base`, `bsc`, `sepolia`

### `web3_explorer`
Look up transactions, addresses, or blocks on block explorers.
```json
{ "name": "web3_explorer", "args": { "tx": "0x...", "chain": "ethereum" } }
```

### `web3_ipfs`
Upload or fetch content from IPFS decentralized storage.
```json
{ "name": "web3_ipfs", "args": { "action": "fetch", "cid": "Qm..." } }
```

### `web3_contract`
Smart contract operations: verify contracts, get ABIs.
```json
{ "name": "web3_contract", "args": { "action": "abi", "address": "0x...", "chain": "ethereum" } }
```

### `web3_deploy`
Get deployment instructions for a smart contract.
```json
{ "name": "web3_deploy", "args": { "file": "contracts/Token.sol", "chain": "sepolia" } }
```

## 🤖 Tool Execution Flow

1. User sends a message
2. Agent analyzes the request and decides which tools to use
3. Agent outputs tool calls in ```` ```tool ```` blocks
4. Freebuff parses the tool calls and executes them
5. Results are sent back to the agent for follow-up
6. This loops up to 5 rounds of tool → result → follow-up

## ⚙️ Adding Custom Tools

To add a new tool:
1. Add the tool definition in `src/types/index.ts` → `AGENT_TOOLS`
2. Add the implementation in `electron/main.ts` → `tool:execute` handler
3. The agent will automatically see and use the new tool

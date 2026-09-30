<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license MIT
-->

# Agent Tools Reference

These are the tools VD Agent can call. The definitions the model sees live in `AGENT_TOOLS` (`src/types/index.ts`), and the implementations live in `electron/handlers/tools.ts`. Tools run in the main process with your user permissions.

**Author:** Virender Dhiman
**License:** MIT

The model calls a tool with a fenced block:

````
```tool
{"name": "read_file", "args": {"path": "src/index.ts"}}
```
````

## File system

### `read_file`
Read a file's contents.
```json
{ "name": "read_file", "args": { "path": "src/index.ts" } }
```

### `write_file`
Write a file, creating or overwriting it.
```json
{ "name": "write_file", "args": { "path": "output.txt", "content": "Hello world" } }
```

### `edit_file`
Replace the first occurrence of `old_string` with `new_string`. Fails if `old_string` is not found.
```json
{ "name": "edit_file", "args": { "path": "src/app.ts", "old_string": "old code", "new_string": "new code" } }
```

### `create_file`
Create a file with optional content.
```json
{ "name": "create_file", "args": { "path": "new-file.ts", "content": "export {}" } }
```

### `delete_file`
Delete a file permanently.
```json
{ "name": "delete_file", "args": { "path": "temp.txt" } }
```

### `list_files`
List a directory.
```json
{ "name": "list_files", "args": { "path": "src/" } }
```

### `search_files`
Find files whose names match a pattern.
```json
{ "name": "search_files", "args": { "pattern": "config", "path": "." } }
```

### `search_code`
Search file contents (grep-like).
```json
{ "name": "search_code", "args": { "pattern": "useState", "path": "src/" } }
```

## Commands

### `run_command`
Run a shell command. It times out after 30 seconds.
```json
{ "name": "run_command", "args": { "command": "npm test", "cwd": "." } }
```

## Project

### `read_directory_tree`
A tree view of the project structure.
```json
{ "name": "read_directory_tree", "args": { "path": "." } }
```

### `multi_file_edit`
Targeted replacements across several files.
```json
{ "name": "multi_file_edit", "args": { "edits": [
  { "path": "file1.ts", "old_string": "a", "new_string": "b" },
  { "path": "file2.ts", "old_string": "c", "new_string": "d" }
] } }
```

### `code_review`
Runs simple static checks on a file (TODOs, `console.log`, `any`, empty catch blocks, long lines, `eval`, `innerHTML`, possible hardcoded secrets) and returns the findings with the file content for the model to review.
```json
{ "name": "code_review", "args": { "path": "src/auth.ts", "focus": "security" } }
```

## Git

All git tools accept an optional `path` (the repository, default `.`).

| Tool | What it does |
|------|--------------|
| `git_status` | Branch, staged, modified, and untracked files |
| `git_diff` | Diff for everything or one `file` |
| `git_commit` | Commit with `message`. Set `add: true` to stage everything first. |
| `git_log` | Recent commits (`count`, default 10) |
| `git_branch` | List branches, or create/switch with `branch` + `create` / `switch` |
| `git_stash` | Stash changes, or `pop: true` |
| `git_generate_commit` | Returns the diff so the model can write a commit message |
| `git_undo_last` | Undo the last commit and keep its changes staged |
| `git_discard_changes` | Discard all uncommitted changes (**destructive**) |

## Web

### `web_search`
Search the web and return text snippets.
```json
{ "name": "web_search", "args": { "query": "React useEffect cleanup" } }
```

## Media

| Tool | What it actually does | Requirements |
|------|-----------------------|--------------|
| `generate_image` | Returns a Pollinations image URL for `prompt` (`width`, `height`, `model`, `seed` optional) | None |
| `image_analysis` | Sends an image (`image_url`: URL or local path) and optional `question` to Gemini | Gemini key |
| `generate_video` | Returns a Pollinations video URL, or setup steps for Runway/Kling (`provider`, `prompt`) | None |
| `comfyui_workflow` | Returns ComfyUI setup instructions | None |
| `speech_to_text` | Transcribes `audio_path` with Whisper (`language` optional) | Groq or Hugging Face key |
| `text_to_speech` | Returns a Pollinations audio URL for `text` (`voice` optional) | None |

## Web3

| Tool | What it does |
|------|--------------|
| `web3_balance` | Native balance for `address` on `chain` (ethereum, polygon, arbitrum, optimism, base, bsc, sepolia) |
| `web3_explorer` | Explorer link for a `tx`, `address`, or `block` |
| `web3_ipfs` | `fetch` content by `cid`. `upload` depends on an external service. |
| `web3_contract` | Verification steps or an ABI lookup link (`action`: verify or abi) |
| `web3_deploy` | Hardhat deployment steps for `file` on `chain`. It does not deploy anything. |

## Execution flow

1. The model replies with one or more `tool` blocks.
2. VD parses them, runs each through `tool:execute`, and logs the call in the Tasks panel and terminal.
3. The results go back to the model, which continues.
4. This repeats for up to **10 rounds** per request. **Stop** cancels the in-flight request and skips any remaining tools.

## Adding a tool

1. Add the definition to `AGENT_TOOLS` in `src/types/index.ts`.
2. Implement it in `electron/handlers/tools.ts`.
3. Document it here.

<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Agent Tools Reference

These are the tools VD Agent can call. The definitions the model sees live in `AGENT_TOOLS` (`src/types/index.ts`), and the implementations live in `electron/handlers/tools.ts`. Tools run in the main process with your user permissions.

**Author:** [Virender Dhiman](https://virender.in)
**License:** [VD Agent License](./LICENSE) (proprietary, free to use with credit)

The model calls a tool with a fenced block:

````
```tool
{"name": "read_file", "args": {"path": "src/index.ts"}}
```
````

**Paths:** relative paths resolve against the open workspace folder. Tools that take an optional folder (`list_files`, `search_code`, the git tools, and others) default to the workspace, and so does `run_command`'s `cwd`. Without an open workspace, use absolute paths.

**Results:** each result reaches the model labelled as succeeded or `FAILED`, with the arguments, the error, and a hint about the likely cause when one is known. Output longer than about 12,000 characters is truncated with a note to narrow the request. A malformed tool block is reported back to the model instead of being ignored.

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
Run a shell command in the workspace, or in `cwd` if given. It is stopped after 30 seconds. Exit code 0 returns stdout and stderr. A non-zero exit or a timeout is reported as a failure that includes the exit code and both output streams.
```json
{ "name": "run_command", "args": { "command": "npm test" } }
```

## Project

### `read_directory_tree`
A tree view of the project structure.
```json
{ "name": "read_directory_tree", "args": { "path": "." } }
```

### `archive_list`
Inspect a ZIP archive without extracting it. Returns every entry's normalized path, compressed and expanded sizes, type, and archive totals. Unsafe or platform-reserved paths, duplicate/case-colliding entries, symbolic links, oversized entries, and expansion-limit violations are rejected.
```json
{ "name": "archive_list", "args": { "archive_path": "order-api-raw.zip" } }
```

### `archive_extract`
Extract a validated ZIP archive into a workspace directory. Existing files are preserved unless `overwrite` is explicitly enabled. Extraction is limited to 2,000 entries, 64 MB per file, and 512 MB total expanded data, and it creates a recovery checkpoint for the destination files.
```json
{ "name": "archive_extract", "args": { "archive_path": "order-api-raw.zip", "output_path": "order-api-raw-extracted" } }
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
| `generate_video` | Returns a Pollinations video URL for `prompt` | None |
| `speech_to_text` | Transcribes `audio_path` with Whisper (`language` optional) | Groq or Hugging Face key |
| `text_to_speech` | Returns a Pollinations audio URL for `text` (`voice` optional) | None |

## Web3

| Tool | What it does |
|------|--------------|
| `web3_balance` | Native balance for `address` on `chain` (ethereum, polygon, arbitrum, optimism, base, bsc, sepolia) |
| `web3_explorer` | Explorer link for a `tx`, `address`, or `block` |

## Execution flow

1. The model replies with one or more `tool` blocks.
2. VD parses them, runs each through `tool:execute`, and logs the call in the Tasks panel and terminal.
3. The results go back to the model, which continues.
4. This repeats for up to **10 rounds** per request. **Stop** cancels the in-flight request and skips any remaining tools.

## Adding a tool

1. Add the definition to `AGENT_TOOLS` in `src/types/index.ts`.
2. Implement it in `electron/handlers/tools.ts`.
3. Document it here.

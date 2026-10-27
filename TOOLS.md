<!--
  @author Virender Dhiman
  @year 2026
  @project PIT Agent
  @license Proprietary. See LICENSE.
-->

# Agent Tools Reference

These are the tools PIT Agent can call. The definitions the model sees live in `AGENT_TOOLS` (`src/types/index.ts`), and the implementations live in `electron/handlers/tools.ts`. Tools run in the main process with your user permissions.

**Author:** [Virender Dhiman](https://virender.in)
**License:** [PIT Agent License](./LICENSE) (proprietary, free to use with credit)

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

### `api_request`
Make a bounded HTTP request for lightweight API/browser-endpoint testing. Only `http` and `https` URLs and common HTTP methods are accepted; responses are capped at 100,000 characters and time out after 15 seconds. JSON responses are parsed, and `jsonPath` (for example `data.items`) returns a focused value. Every request is treated as dangerous by the policy and requires explicit approval unless trusted mode is enabled. This tool does not execute JavaScript in a browser.
```json
{ "name": "api_request", "args": { "url": "http://localhost:3000/health", "method": "GET", "expectedStatus": 200, "jsonPath": "status" } }
```

### `browser`
Opt-in, hidden Electron browser for the current chat session and workspace. Enable **Settings → Tool permissions → Enable browser tool** first; it defaults to off, including in Trusted mode. All operations use the same dangerous-tool approval policy as `api_request` (Trusted mode skips dialogs only after opt-in).

```json
{ "name": "browser", "args": { "operation": "open_url", "url": "https://example.com" } }
```
```json
{ "name": "browser", "args": { "operation": "read_page_text" } }
```
```json
{ "name": "browser", "args": { "operation": "screenshot", "width": 1280, "height": 900 } }
```

Only HTTP/HTTPS URLs without embedded credentials are accepted. Reading or capturing with a `url` navigates first; otherwise the current session page is reused. Navigating calls time out after 15 seconds; other calls after 5 seconds. A timeout closes the page. DOM `textContent` is capped at 100,000 characters before the standard model-result budget is applied. Page content is untrusted and is sent to the active AI provider for the requested inspection; it may include hidden DOM text.

Screenshots are viewport PNGs (320–1600 by 240–1200 pixels), saved to a unique workspace-relative `.vd-agent/browser-screenshots/*.png` path, with MIME type, dimensions, and byte count returned as JSON. Controlled `click`, `fill`, and `wait_for_text` operations are available with bounded CSS selectors; arbitrary script, sign-in, downloads, popups, and permission requests remain denied. Browser windows use isolated, in-memory storage; up to four session/workspace pages are retained until the app closes or the setting is disabled. URL arguments and page output are omitted from activity logs; screenshots remain in the workspace until the user removes them.

## Optional local data

These tools are independently **off by default** under **Settings → Tool permissions**. Data reads are marked dangerous and use the existing approval policy. Every local path must remain inside the open workspace, file inputs are bounded, and returned rows/text are truncated. CSV is built in; Excel support is dynamic and reports `Excel unavailable` when the optional `xlsx` package is absent. Spreadsheet writes require both the spreadsheet setting and the separate write setting, require `overwrite: true` for an existing file, and remain approval-gated.

| Tool | What it does | Requirements / gaps |
|---|---|---|
| `sqlite_query` | One bounded `SELECT`/`WITH` query against a workspace SQLite file with scalar params | SQLite runtime must be available; opens read-only and rejects writes/maintenance SQL |
| `postgres_query` | One bounded query in a `BEGIN READ ONLY` transaction | Optional `pg` package; host/database/user only, no passwords/connection URLs, a restricted passwordless role, and TLS requested for non-loopback hosts |
| `spreadsheet_read` | Read bounded CSV or `.xlsx` rows with paging | CSV works without an add-on; `.xlsx` needs optional `xlsx` |
| `spreadsheet_write` | Write bounded CSV or one-sheet `.xlsx` rows | Separate write opt-in plus approval; formula-like CSV strings are escaped; no overwrite by default |
| `pdf_extract_text` | Extract text operators from an unencrypted PDF, including common Flate streams | No OCR or layout reconstruction; scanned/encrypted/complex PDFs may produce no text |
| `ocr_image` | Offline Tesseract OCR for PNG/JPEG/WebP | English data is bundled; other languages need local uncompressed workspace data. Downloads and cache writes are disabled |

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

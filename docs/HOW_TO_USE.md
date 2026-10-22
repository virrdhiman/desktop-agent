# How to use VD Agent

## First run

The optional setup checklist offers VS Code, the VD Agent Bridge, and Ollama.
Each item has independent consent and may be skipped. VD Agent opens only the
official HTTPS download page; the operating system or official installer owns
signature verification and elevation. Nothing is silently downloaded.

## Start coding

1. Open a workspace from the file panel.
2. Configure an API provider or a local Ollama server in Settings.
3. Start with a read-only request such as “inspect the repository and propose a
   plan.”
4. Ask for a change only after reviewing the plan.
5. Review changed files, commands, verification, and checkpoint restore options
   in Tasks.

## VS Code

Install VS Code separately, then use the VS Code Bridge panel to install or
load the bundled VSIX. Open the same workspace in both applications and export
context from VS Code. Workspace trust and extension permissions remain VS Code
settings.

## Ollama

Install Ollama separately, start its local server, and download a small model.
Configure the URL/model in Settings. “Configured · not verified” only means the
fields were saved; “Local provider verified” requires a successful request.

For the VS Code bridge, the no-budget setup is `http://127.0.0.1:11434` with
`qwen2.5-coder:1.5b` (or another installed coding model). The bridge waits up to
7 seconds for a cold local completion, cancels stale requests while typing, and
falls back to local/editor symbols when the provider is unavailable.

## Provider fallback

With model selection set to Auto, VD Agent discovers usable models when the
provider exposes a catalog, ranks them for the selected token budget, and cools
down models that are unavailable, rate-limited, deprecated, or interrupted by a
transient network failure. A mid-stream failure can continue with the next
eligible model without changing the saved user request. Authentication errors
stop immediately so a missing key is not hidden behind retries.

For local no-budget use, run Ollama with a small coding model such as
`qwen2.5-coder:1.5b` and select the local provider. Auto mode can move to the
next eligible model/provider after a transport failure; it does not hide an
invalid API key or invent a replacement model when a catalog is unavailable.

## Browser tool

Enable it only when needed in Settings → Tool permissions. Every operation is
approval-gated. Pages are untrusted input. Supported actions are open URL, read
text, screenshot, bounded click, bounded fill, and bounded wait-for-text. There
is no arbitrary JavaScript, download, popup, permission request, or sign-in
automation.

## Safety modes

- **Ask risky**: asks before dangerous actions.
- **Ask all writes**: asks before every write.
- **Trusted**: skips normal dialogs, but opt-in browser and restricted policy
  settings still apply.

Restricted command mode filters risky shell patterns and workspace escapes; it
is not a substitute for an OS sandbox.

## Diagnostics, indexing, approvals, and resume

- **Help → Diagnostics** keeps a small rotating log on this machine. Main and
  renderer errors are redacted before they are stored; the viewer shows at most
  200 lines and excludes API keys, cookies, headers, chat content, source code,
  filenames, and workspace paths. **Copy diagnostics** uses the desktop
  clipboard and copies only that bounded report.
- When **Automatic indexing** is enabled, VD Agent walks the open workspace
  within fixed file/size limits, respects `.gitignore`, skips binary content,
  and reports status in the sidebar. The index powers `search_code`,
  `go_to_definition`, and `find_usages`; unchanged files are reused on the next
  pass.
- Select **Always ask**, **Ask risky only**, or **Auto** in Tool permissions.
  Writes and commands that need approval show the exact command or before/after
  file proposal. Approve, edit and approve again, or reject. The first approved
  mutation in a session gets an agent-only checkpoint; Sessions → **Undo last
  agent change** restores it only when later user edits are unambiguous.
- Sessions save chat and bounded working context atomically. Use Sessions →
  **Resume** after a restart or crash. Resume restores context but never starts
  a command or sends a provider request automatically.

## Release validation

Run the project checks from the repository root. Native macOS package execution
is CI-only on a Windows development host. A packaged resource validator checks
that the bridge VSIX, editor assets, updater, and terminal native runtime are
actually present in the app bundle.

Current local evidence is kept under `.work/`: the Windows 1.1.0 NSIS and
portable rebuild passed packaged smoke (56/56), capability validation, and
fresh native UI QA. The NSIS flow exercised license, custom folder, install,
Finish, and screenshots; portable launch was verified with the extracted child
window. Evidence is under `.work/vm-results/windows-installer-final/`.
CSV, SQLite, XLSX, PDF, and bundled English offline OCR were exercised against `.work/samples`; the
disposable Postgres client was bound only to `127.0.0.1:55999` and stopped
after its read-only query. The verified Ubuntu Server ISO and exact
guestcontrol blocker are recorded in `.work/vm-results/ubuntu.md`; Windows
ISO/VM absence is recorded in `.work/vm-results/win.md`. Blocked downloads or
missing credentials are never presented as passing tests. macOS uses the
generated checklist and remains pending until it is run on a Mac. WSL2 Linux
packaging and its exact limitations are recorded in
`.work/vm-results/ubuntu-wsl.md`. For a manual native-editor quality check, use
`.work/vscode-manual-check.md`.

For local updater QA, set `VD_AGENT_UPDATE_URL` to an HTTP feed containing a
validated `latest.yml` and its installer. The default release path remains the
GitHub feed. The isolated QA flow proved 1.0.0 to 1.1.0 handoff, kept settings
and chat history, and removed only the installed program during uninstall.

The bridge VSIX is version `0.4.7` in current builds. The latest human-style
run proves context export, real editor typing, and Ollama-backed ghost text.
Normal VS Code profiles still need the user to trust the workspace before deep
indexing and edit/apply commands are enabled.

The trust/depth human runner is:

```powershell
PLAYWRIGHT_PACKAGE=playwright-core node tests/human/runner.mjs --exe "release/win-unpacked/VD Agent.exe" --scenario skip,diagnostics,index-tools,safe-change,resume,crash
```

It uses a disposable test profile, real keystrokes with screenshots, and records
exactly skipped controls. It does not claim provider-backed tool execution when
no test provider is configured.

The Windows Enterprise ISO step remains user-gated because Microsoft requires
registration before download; the exact official URL and unrun checklist are
in `.work/vm-results/win.md`. A read-only D: storage report is available at
`C:\vd-vms\D-CLEANUP-CANDIDATES.md`; no cleanup action is automatic.

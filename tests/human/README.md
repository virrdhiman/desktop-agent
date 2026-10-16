# Packaged Electron human QA

These scripts use only visible DOM controls and Playwright's Electron launcher. They never call
`window.api`, IPC, stores, settings, or `evaluate`. They are intentionally opt-in and require an
explicit packaged executable:

```powershell
$env:PLAYWRIGHT_PACKAGE = 'C:\path\to\node_modules\playwright'
node tests/human/runner.mjs --exe 'release/win-unpacked/VD Agent.exe' --scenario smoke,terminal,persistence,search,checklist,diagnostics,index-tools,safe-change,resume,crash
```

`--exe` may point to a Linux AppImage under WSLg. Each run uses `.work/human-qa/<timestamp>` as
the isolated user-data directory, sets `VD_AGENT_DISABLE_ENV_IMPORT=1`, writes evidence JSON and
screenshots there, and refuses to run below 20 GB free on C:. No downloads or installs are done.
If Playwright cannot be resolved, install it in the caller's environment or set
`PLAYWRIGHT_PACKAGE` (the runner reports the requirement and exits).

Scenarios are capability-aware: missing visible controls are recorded as `skipped`, never replaced
with internal calls. Checklist additionally verifies a downloaded file's SHA-256 when a visible
download produces one, and exercises a visible Cancel control when present.

The diagnostics, index-tools, and safe-change scenarios use only visible controls and record an
exact skip reason when a provider or approval dialog is unavailable. `resume` restarts the
packaged process and checks the saved session list; `crash` force-stops the Electron process,
relaunches it, then opens Help → Diagnostics. These scenarios are evidence of the UI path, not
permission to run arbitrary commands or write outside the isolated user-data profile.

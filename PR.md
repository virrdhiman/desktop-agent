# PR title

feat: deepen trust, diagnostics, indexing, and session recovery

## Summary

- Add human-style Playwright Electron and Windows UI Automation harnesses for
  packaged VD Agent flows.
- Add the VS Code bridge feel test, real typing latency evidence, and stale
  completion regression coverage for bridge version 0.4.7.
- Add a local Ollama two-server failover test covering a killed mid-stream
  primary, fallback, DNS failure, and a 30-second timeout without real keys.
- Record Windows/WSL QA limits, refresh packaging documentation, and add the
  read-only D: cleanup preview helper.
- Raise the VS Code bridge cold-completion timeout for local Ollama and extend
  the human runner with a disposable trusted-profile fixture.
- Exercise chat typing, saved-chat search, and the gated prerequisite download
  cancellation flow with real Playwright clicks and keystrokes.
- Fix Windows UI QA custom-folder focus, nested install-root detection, Finish
  completion timing, and portable child-window discovery.
- Add a diagnostic for packaged portable logging and an opt-in local HTTP update
  feed used to prove the 1.0.0 -> 1.1.0 handoff.
- Verify uninstall removes the installed program while retaining settings and
  chat history.
- Add privacy-redacted rotating local diagnostics with Help → Diagnostics and
  bounded clipboard copy.
- Extend the project index with `.gitignore` filtering, bounded symbols/imports,
  incremental reuse, code search, definition/usage tools, status, and a 5,000
  file benchmark.
- Add exact mutation previews with Approve/Edit/Reject, per-session agent-only
  checkpoints, conservative undo, and resumable session context.
- Extend the Playwright Electron runner with visible diagnostics, indexing,
  safe-change, crash/restart, and resume scenarios; no provider or command is
  silently invoked by the harness.

## Verification

- `npm run lint`
- `npm test` -> 58 files, 486 tests passed
- `npm run build`
- `npm run smoke` -> 56/56 checks passed
- Fresh Windows trust/depth unpacked package and resource validator passed
- Trust/depth packaged smoke -> 56/56 checks passed
- `node scripts/benchmark-repo-index.mjs` -> 5,000 files, 5,033 ms initial,
  1,414 ms incremental, 5,000 reused in the standalone benchmark; Vitest
  benchmark run -> 17,125 ms initial, 3,366 ms incremental, 5,000 reused
- `node scripts/release-qa.mjs --artifacts` -> 65 pass, 3 signing warnings,
  0 failures
- Fresh NSIS UI QA passed license, custom folder, install, Finish, and final
  executable checks; portable launch passed through the extracted child window.
- Local feed update QA passed 1.0.0 -> 1.1.0 with settings/chat retention, and
  uninstall QA passed with user data kept.
- Local Ollama failover evidence is in `.work/vm-results/failover-live.md`
- Fresh packaged human UI evidence is in `.work/human-qa/2026-10-14T10-08-12.489Z/`.
- Local Ollama ghost-text evidence is in
  `.work/vscode-human-qa/2026-10-14T10-04-41.775Z/evidence.json`.
- Trust/depth human evidence is under `.work/human-qa/` for the latest run.
  Diagnostics and crash/restart passed visibly; the desktop clipboard policy
  caused this exact bounded skip: `Copy diagnostics did not report success:
  Copy failed: Failed to execute 'writeText' on 'Clipboard': Write permission denied.`
  Indexing, safe-change, and restart keystrokes were captured; provider-backed
  mutation execution was not claimed without a configured test provider.

## Known limits

- No push or hosted PR was created because `origin` is the read-only local
  checkout `D:\pers\Desktop Agent` and D: is locked by the QA scope.
- Windows Sandbox remains optional; host native UI QA now passes on fresh
  install roots. macOS still needs a macOS runner.
- Code signing/notarization and clean-machine macOS/Windows QA remain external
  release activities.
- A clean WSL rebuild of the trust/depth branch remains a separate Linux
  evidence step; the prior AppImage/DEB artifacts were validated from the
  feature-parity build.

## Disk report

Largest `C:\vd-vms` trees at the end of QA were `wsl` 10.18 GB, `iso` 9.62
GB, `repo` 6.75 GB, `release` 4.36 GB, `build` 3.17 GB, and
`vscode-portable` 2.18 GB. The existing `install-test` directory is 0.56 GB
and was left untouched. The Ollama model was kept because it is required for
the passing autocomplete test. No build output was deleted: the environment's
PowerShell safety policy rejected the explicit recursive cleanup command, so
the rebuildable `.work/package-*` directories remain for review.

## Trust/depth verification table

| Check | Result |
|---|---|
| `npm run lint` | pass |
| `npm test` | 58 files / 486 tests pass |
| `npm run build` | pass |
| Packaged Windows smoke | 56/56 pass |
| Packaged Windows capability validator | pass |
| Index benchmark | 5,000 files; 17.125s initial, 3.366s incremental, 5,000 reused |
| Human diagnostics/crash flow | pass after main-process clipboard fix |
| Human index/safe-change flow | visible keystrokes captured; provider-backed execution not claimed |
| Human resume flow | gap: `Resume` button timeout after restart; retry had `ChildProcess.kill` error |

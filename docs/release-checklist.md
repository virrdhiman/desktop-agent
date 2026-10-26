# Release Gate

Generated: 2026-10-26T11:43:34.0590372+05:30
Fixture root: `C:\vd-vms\qa-fixture` (throwaway only)
Release verdict: **NO-GO**

| Item | Status | Evidence |
|---|---|---|
| 1 Startup/isolation | PASS | `isolated-smoke.log` |
| 2 Agent view | NOT CHECKED | `Requires manual visual interaction; smoke covers startup only` |
| 3 Working modes | NOT CHECKED | `Requires real UI tool-policy interaction` |
| 4 Code window | NOT CHECKED | `Requires manual editor/window interaction` |
| 5 Terminal | PASS | `isolated-smoke.log; terminal path is exercised by smoke` |
| 6 Git fixture | NOT CHECKED | `Requires throwaway-repository UI workflow` |
| 7 Local browser fixture | NOT CHECKED | `Requires local HTTP fixture interaction` |
| 8 Files/path safety | NOT CHECKED | `Requires manual permission/traversal cases` |
| 9 Providers/keys | NOT CHECKED | `No real credentials used by this gate` |
| 10 Chats/long context | NOT CHECKED | `Requires manual compaction/fork/relaunch flow` |
| 11 Stability | NOT CHECKED | `30-minute idle and crash recovery require a live desktop session` |
| 12 Security | NOT CHECKED | `Requires packaged runtime inspection` |
| 13 Packaging | PASS | `build/vscode-package/package-preflight/unsigned-package/packaged-validator logs` |
| 14 Final checks | PASS | `build/lint/vitest logs` |

## Automated checks
- **PASS** build: `C:\vd-vms\qa-fixture\logs\build.log`
- **PASS** lint: `C:\vd-vms\qa-fixture\logs\lint.log`
- **PASS** vitest: `C:\vd-vms\qa-fixture\logs\vitest.log`
- **PASS** isolated-smoke: `C:\vd-vms\qa-fixture\logs\isolated-smoke.log`
- **PASS** vscode-package: `C:\vd-vms\qa-fixture\logs\vscode-package.log`
- **PASS** package-preflight: `C:\vd-vms\qa-fixture\logs\package-preflight.log`
- **PASS** unsigned-package: `C:\vd-vms\qa-fixture\logs\unsigned-package.log`
- **PASS** packaged-validator: `C:\vd-vms\qa-fixture\logs\packaged-validator.log`

Manual items remain NO-GO until the operator completes the fixture-only visual checklist. No real sites, accounts, API keys, purchases, or user data are used by this gate.

## Regression and coverage follow-up

- **Full Vitest:** PASS — 552 tests across 74 files, single-worker mode; the normal `npm test` command uses `--maxWorkers=1 --silent` to avoid worker-start flakiness and expected React/jsdom error noise.
- **Coverage:** PASS — 73.37% statements, 62.88% branches, 74.15% functions, 78.10% lines.
- **Lowest line coverage (electron/ and src/lib/):** `electron/settings.ts` 24.77%, `electron/dataTools.ts` 74.30%, `src/lib/workingModePolicy.ts` 75.00%, `electron/vscodeBridge.ts` 82.07%, `electron/patchPreview.ts` 86.84%, `electron/checkpointStore.ts` 87.63%, `electron/archiveStore.ts` 88.04%, `src/lib/inlineEdits.ts` 88.07%, `electron/externalLanguageService.ts` 88.95%, `electron/prerequisiteDownload.ts` 89.66%.
- **New regression coverage:** renderer Node-global scan, xterm fit lifecycle, mode-policy matrix, layout migration/clamping, chat migration/summary/fork, key masking, git clean/conflict/detached fixtures, file-tool traversal, HTML escaping, and shortcut preservation.
- **Smoke:** PASS — 56/56 checks after updating the harness for the collapsed history-pane default.

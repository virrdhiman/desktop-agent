# Release Gate

Generated: 2026-10-25T20:56:41.0572329+05:30
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
- **PASS** lint: `C:\vd-vms\qa-fixture\logs\lint.log`
- **PASS** vitest: `C:\vd-vms\qa-fixture\logs\vitest.log`
- **PASS** isolated-smoke: `C:\vd-vms\qa-fixture\logs\isolated-smoke.log`
- **PASS** vscode-package: `C:\vd-vms\qa-fixture\logs\vscode-package.log`
- **PASS** package-preflight: `C:\vd-vms\qa-fixture\logs\package-preflight.log`
- **PASS** unsigned-package: `C:\vd-vms\qa-fixture\logs\unsigned-package.log`
- **PASS** packaged-validator: `C:\vd-vms\qa-fixture\logs\packaged-validator.log`

Manual items remain NO-GO until the operator completes the fixture-only visual checklist. No real sites, accounts, API keys, purchases, or user data are used by this gate.

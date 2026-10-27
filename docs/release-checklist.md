# PIT Agent 1.2.0 release checklist

Generated: 2026-10-27 (final packaged rerun)
Fixture root: `C:\vd-vms\qa-fixture-pit-automated-final-2` (throwaway only)
Release verdict: **GO for automated checks; manual visual/UAC review remains required**

| Item | Status | Evidence |
|---|---|---|
| 1 Startup/isolation | PASS | Fresh packaged profile had zero configured providers and showed “Add an API key in Settings”. |
| 2 Agent view | PASS | Packaged harness rendered the branded Agent surface and composer; final smoke passed. |
| 3 Working modes | PASS | Plan write was blocked; Build write succeeded in the fixture. |
| 4 Code window | PASS | No-folder state, single instance, shared workspace, Monaco TS/JS/JSON, rename/delete and dirty-close Save/Cancel/Don't save all passed. |
| 5 Terminal | PASS | Final packaged smoke passed terminal PTY and no renderer errors. |
| 6 Git fixture | PASS | Throwaway repository status, diff, stage and commit passed with no remote. |
| 7 Local browser fixture | PASS | 127.0.0.1 page and 404 handling passed with source-labelled results. |
| 8 Files/path safety | PASS | Read-only, locked and inaccessible paths returned errors; outside-workspace writes were blocked. |
| 9 Providers/keys | PASS | Fresh profile was key-free; packaged files/security scan found no secret-looking files. |
| 10 Chats/long context | PASS | Meter threshold, summarize/recover, fork and fork-from-here passed; parent remained unchanged. |
| 11 Stability | PASS | One-minute final packaged run: baseline 232873984, peak 232873984, no renderer errors. |
| 12 Security | PASS | Context isolation, bounded preload, CSP, external-link policy and no remote main URL passed inspection. |
| 13 Packaging | PASS | Unsigned NSIS/portable package, preflight and packaged validator passed. |
| 14 Final checks | PASS | lint, typecheck, build, 83 files/593 tests, packaged smoke 56/56 and release QA 59 pass/4 expected warnings/0 fail. |

## Final packaged evidence

- Packaged smoke: `56/56` checks passed from `C:\vd-vms\release\pit-agent\win-unpacked\PIT Agent.exe`.
- Packaged automated QA: `30/30` checks passed after the dirty-close fixture race was fixed in commit `f182805`.
- Installer: `C:\vd-vms\release\pit-agent\PIT Agent Setup 1.2.0.exe`
- Portable: `C:\vd-vms\release\pit-agent\PIT Agent 1.2.0.exe`
- Installer SHA-256: `7D8972F63E988A5CA4D048CCFD731D86508D4E2B73DC96DE68D9871B1A3F063D`
- Portable SHA-256: `E05B2B5B221FD412D3A46C867B2CEB9C42E9EAC528A14C87456A7A33D6D69EDB`
- Screenshots reviewed: `.work/screens/pit-agent-final/` (Agent, Code, right tools, Settings and narrow layout).

The automated gate uses only throwaway fixture files, a local 127.0.0.1 server and isolated packaged user data. UAC/SmartScreen interaction, the actual Start-menu/taskbar rendering, and macOS packaging are not verified by this Windows-only run.

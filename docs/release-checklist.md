# Release Gate

Generated: 2026-10-27T14:18:33.4199454+05:30
Fixture root: `C:\vd-vms\qa-fixture-final-release-3` (throwaway only)
Release verdict: **GO**

| Item | Status | Evidence |
|---|---|---|
| 1 Startup/isolation | PASS | `isolated-smoke.log; packaged first run is isolated and key-free: fresh userData; configured providers=0 | first-run key guidance is visible: welcome screen` |
| 2 Agent view | PASS | `packaged first run is isolated and key-free: fresh userData; configured providers=0 | first-run key guidance is visible: welcome screen` |
| 3 Working modes | PASS | `working mode policy is enforced in the packaged app: {"readOnlyWrite":{"error":"Plan mode is read-only and cannot run write-risk tools."},"buildWrite":{"result":"File written: C:\\vd-vms\\qa-fixture-final-release-3\\automated\\automated-workspace\\tool-created.txt"}}` |
| 4 Code window | PASS | `IDE no-folder state offers Open Folder: Open Folder control visible | IDE is single-instance and second open focuses it: 1 IDE targets | IDE follows the shared workspace: files=qa-editor.ts, dialog-file.ts | packaged Monaco contributions load offline for TS, JS and JSON: plaintext, json, typescript, javascript | IDE rename action is wired: native file operation completed or surfaced | IDE delete confirmation is wired: confirmed fixture delete | QA dialog controls are available only for the fixture harness: bounded QA-only preload methods | QA dirty-state fixture is accepted: {"dirtySet":{"success":true},"workspace":"C:\\vd-vms\\qa-fixture-final-release-3\\automated\\automated-workspace","dialogFile":"C:\\vd-vms\\qa-fixture-final-release-3\\automated\\automated-workspace\\dialog-file.ts"} | IDE dirty close Cancel keeps the window open: cancelled close | IDE dirty close Save writes the file and closes: saved fixture content | IDE dirty close Don't save closes without another write: discarded close | Main dirty close Cancel keeps the Agent window open: cancelled main close` |
| 5 Terminal | PASS | `isolated-smoke.log; terminal path is exercised by smoke` |
| 6 Git fixture | PASS | `throwaway git fixture supports status, diff, stage and commit: {"statusBefore":{"branch":"master","tracking":null,"ahead":0,"behind":0,"staged":[],"modified":["dialog-file.ts"],"not_added":["qa-renamed.ts","tool-created.txt"],"deleted":["qa-editor.ts"],"renamed":[],"isClean":false},"stageResult":{"success":true},"commitResult":{"success":true,"summary":{"changes":1,"insertions":1,"deletions":0}},"statusAfter":{"branch":"master","tracking":null,"ahead":0,"behind":0,"staged":[],"modified":["dialog-file.ts"],"not_added":["qa-renamed.ts"],"deleted":["qa-editor.ts"],"renamed":[],"isClean":false}}` |
| 7 Local browser fixture | PASS | `local browser fixture labels source and handles 404: Browser opened http://127.0.0.1:56278/ in the current session.; Browser opened http://127.0.0.1:56278/missing in the current session.` |
| 8 Files/path safety | PASS | `permission errors are returned without renderer crashes: 3/3 blocked; {"readOnly":{"error":"EPERM: operation not permitted, open 'C:\\vd-vms\\qa-fixture-final-release-3\\automated\\automated-workspace\\readonly.txt'"},"locked":{"error":"EBUSY: resource busy or locked, open 'C:\\vd-vms\\qa-fixture-final-release-3\\automated\\automated-workspace\\locked.txt'"},"noAccess":{"error":"EPERM: operation not permitted, scandir 'C:\\System Volume Information'"}} | file tool rejects paths outside the workspace: Blocked write_file: writes must stay inside the open workspace. Outside path: C:\vd-vms\qa-fixture-final-release-3\automated\outside-workspace.txt` |
| 9 Providers/keys | PASS | `packaged first run is isolated and key-free: fresh userData; configured providers=0 | packaged app has no secret-looking files: ` |
| 10 Chats/long context | PASS | `long chat crosses the context warning threshold: long fixture restored | summarize and continue keeps the transcript recoverable: 2 earlier messages | fork chat creates a linked child and leaves parent messages unchanged: 2 records | fork from here creates a child record: 7 buttons; 3 records` |
| 11 Stability | PASS | `idle/action stability stays below 2x baseline: baseline=227995648 peak=227995648 samples=30 | stability run has no renderer errors or crashes: ` |
| 12 Security | PASS | `packaged app has no secret-looking files:  | packaged security preferences are present: main BrowserWindow webPreferences | packaged CSP and external-link policy are present: CSP, denied window opens, system browser | packaged preload exposes a bounded bridge: contextBridge preload` |
| 13 Packaging | PASS | `build/vscode-package/package-preflight/unsigned-package/packaged-validator logs` |
| 14 Final checks | PASS | `build/lint/vitest logs` |

## Automated checks
- **PASS** build: `C:\vd-vms\qa-fixture-final-release-3\logs\build.log`
- **PASS** lint: `C:\vd-vms\qa-fixture-final-release-3\logs\lint.log`
- **PASS** vitest: `C:\vd-vms\qa-fixture-final-release-3\logs\vitest.log`
- **PASS** isolated-smoke: `C:\vd-vms\qa-fixture-final-release-3\logs\isolated-smoke.log`
- **PASS** vscode-package: `C:\vd-vms\qa-fixture-final-release-3\logs\vscode-package.log`
- **PASS** package-preflight: `C:\vd-vms\qa-fixture-final-release-3\logs\package-preflight.log`
- **PASS** unsigned-package: `C:\vd-vms\qa-fixture-final-release-3\logs\unsigned-package.log`
- **PASS** packaged-validator: `C:\vd-vms\qa-fixture-final-release-3\logs\packaged-validator.log`
- **PASS** automated-packaged-qa: `C:\vd-vms\qa-fixture-final-release-3\logs\automated-packaged-qa.log`

Automated checks use only throwaway fixture files, a local 127.0.0.1 server, and an isolated packaged-app userData directory. Visual polish and unsigned-installer SmartScreen interaction remain manual.

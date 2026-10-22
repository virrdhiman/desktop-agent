# VD Agent capabilities

Status uses **implemented**, **scaffolded**, or **planned**. “Tested” means the
named automated or manual check actually ran; it does not imply every OS or
provider was exercised.

| Capability | Status | Tested where | How to use | Gap |
|---|---|---|---|---|
| AI chat and provider fallback | implemented | Vitest suite, smoke, agent evals, local SSE stream-termination integration test | Configure a provider in Settings and open Agent; Auto retries transient provider/model failures | Live provider behavior varies by quota/model; real external outage testing is intentionally not performed |
| Local Ollama | implemented | provider/unit/smoke mock paths | Install Ollama separately, load a model, configure the local provider | Runtime/model health is not continuously monitored |
| VS Code Bridge | implemented | bridge tests, packaged VSIX byte validator, Playwright/portable VS Code bridge run with local Ollama | Install VS Code separately, then install the bundled VSIX; configure Ollama for inline completion | Cursor still leads in model quality, native polish, and large-scale indexing |
| Browser open/read/screenshot | implemented | browser unit tests and 56/56 packaged Electron smoke | Enable Settings → Tool permissions → browser tool, then approve browser actions | External live-page approval review still needs manual packaged QA |
| Browser click/fill/wait | implemented | validation tests and TypeScript build | Use browser operations with bounded CSS selectors | No automated sign-in or arbitrary script execution by design |
| Restricted commands | implemented | policy tests and smoke | Enable restricted command mode in Settings | Policy filter is not an OS sandbox |
| API testing | implemented | API helper tests and smoke/evals | Approve `api_request` for bounded HTTP checks | No browser JS; database access is a separate opt-in |
| ZIP/archive workflows | implemented | archive/reliability tests and smoke | Ask the agent to inventory/extract an archive | Other archive formats are not included |
| CSV/structured data | implemented | `electron/__tests__/dataTools.test.ts` | Enable Settings → Tool permissions → CSV / Excel tools; use `spreadsheet_read` or `spreadsheet_write` | CSV is robustly supported; workbook formulas are not evaluated |
| Excel workbooks | partial | optional-driver round-trip plus unavailable-driver test | Enable CSV / Excel tools and install the optional `xlsx` package | The app keeps `xlsx` optional; packaged builds without it report a clear unavailable error |
| SQLite/Postgres | partial | SQLite read-only runtime, unavailable-`pg` test, disposable psql client at 127.0.0.1:55999 | Enable the individual database setting, then approve the dangerous read | SQLite uses a read-only runtime; the app still needs optional `pg`; the disposable Postgres server was stopped after the client check |
| PDF extraction | implemented | text and Flate-stream unit tests | Enable PDF text extraction and use `pdf_extract_text` | Basic unencrypted text extraction; scanned/encrypted/complex layout PDFs may return no text |
| Image/OCR | implemented | unit tests plus packaged OCR smoke | Enable Offline OCR; English works offline by default, while other languages use local workspace `.traineddata` | Bundled English is checksum-pinned; other languages are not downloaded automatically |
| Session recovery/checkpoints | implemented | reliability tests and smoke | Open Sessions and restore a checkpoint | User must review restore actions |
| Local diagnostics | implemented | redaction/rotation tests, packaged Help-panel flow | Open Help → Diagnostics to inspect the last 200 redacted local log lines and copy the bounded report | Logs are local-only; clipboard access depends on the desktop environment |
| Deep project index | implemented | index tests, 5,000-file benchmark, packaged smoke | Enable indexing, then use `search_code`, `go_to_definition`, or `find_usages`; the sidebar shows index status | Current symbol extraction is TypeScript-service/regex based rather than a universal parser; large-repo limits are bounded |
| Safe agent changes and undo | implemented | approval-page/policy/checkpoint tests, packaged UI prompt path | Choose Always ask, Ask risky only, or Auto in Settings; review exact previews, then approve/edit/reject; use Sessions → Undo last agent change | Undo refuses ambiguous later edits rather than overwriting user work; commands still require policy approval |
| Resumable sessions | implemented | conversation/reliability/session tests, packaged restart harness | Sessions are saved locally; press Resume after restart to restore chat and workspace context | A forced kill can lose the most recent unsaved debounce window; resume never runs commands automatically |

## Environment evidence

- Windows 1.1.0 installer and portable artifacts were rebuilt. Packaged smoke
  passed 56/56, and the packaged capability validator confirmed the bridge
  VSIX, bundled OCR, ASAR, editor, updater, and node-pty. Fresh native Windows
  UI QA now passes NSIS license/custom-folder/install/Finish and portable
  launch; screenshots and event evidence are under
  `.work/vm-results/windows-installer-final/`.
- The verified Ubuntu Server 24.04.5 ISO is in `C:/vd-vms/iso` with SHA-256
  recorded in `.work/vm-results/ubuntu.md`. The NAT VM was recreated under
  `C:/vd-vms/machines` with the requested BIOS/VMSVGA/128 MiB/4 CPU/8 GiB/
  60 GiB configuration. Guestcontrol was probed 30 times at 60-second
  intervals but never became ready; the exact VBoxManage error is recorded in
  `.work/vm-results/ubuntu.md`, so no in-guest app-flow result is claimed.
- Windows VM was skipped because `C:/vd-vms/iso` contained no Windows ISO and
  the official Enterprise download requires registration; the exact URL and
  page requirement are recorded in `.work/vm-results/win.md`.
- A read-only D: space scan excluded `D:/PIT` and `D:/pers/Desktop Agent` and
  produced `C:/vd-vms/D-CLEANUP-CANDIDATES.md`. Nothing was deleted; the report
  estimates 6.09 GB in rebuildable candidates and marks all other paths
  `ask me`.
- macOS remains CI-only/pending a Mac run; use the generated checklist under
  `.work/mac-test/`.
- Ubuntu WSL2 build evidence is recorded in `.work/vm-results/ubuntu-wsl.md`.
  AppImage/DEB packaging, WSLg CDP screenshots, a local 1.0.0 -> 1.1.0 DEB
  handoff, uninstall-preserving-QA-data, non-root 56/56 smoke, and a real UI
  terminal click passed. Fresh UI persistence/search/checklist controls were
  not exposed after setup was skipped.
- A live local Ollama run killed the primary `qwen2.5-coder:1.5b` server
  mid-stream, recovered on a second local server, and passed DNS-failure and
  30-second-timeout checks. The pre-existing server on port 11434 was not
  touched; raw evidence is `.work/vm-results/failover-live.json`.
- The latest human-style VS Code run completed three real TypeScript edits,
  bridge export, and local Ollama ghost text. Evidence and latency details are
  recorded in `.work/vscode-manual-check.md`.
- Fresh packaged Playwright UI evidence shows chat-input and saved-chat search
  controls after setup is skipped. The optional checklist is intentionally
  modal-gated; a separate human run consented, entered a fixture SHA-256,
  started download, and cancelled it successfully.
- `C:\vd-vms\D-CLEANUP.ps1` is a dry-run-by-default preview script sourced only
  from the read-only D: scan. It has not been run and never targets `D:\PIT` or
  the VD Agent source.
- A manual macOS-only build is available from `.github/workflows/mac-build.yml`.
  It is workflow-dispatch only and deliberately unsigned.
- Disposable checks and packaging remained above the 20 GB C: safety floor;
  final free space is reported with the handoff.
- Local updater QA built an isolated 1.0.0 package, served the 1.1.0 feed from
  `127.0.0.1`, verified update-available/downloaded/install states, retained
  `settings.json` and a saved chat, and then uninstalled the app while keeping
  that user data. The opt-in `VD_AGENT_UPDATE_URL` feed override is intended
  for local QA and never changes the default GitHub release feed.
- Trust/depth packaged Windows smoke remained **56/56**. The 5,000-file index
  benchmark recorded **17,125 ms initial**, **3,366 ms incremental**, and
  **5,000 reused files** in the current Windows run. Human-style evidence
  recorded visible setup skip, successful Help → Diagnostics copy after the
  desktop clipboard IPC fix, index/safe-change keystrokes, and a forced restart
  followed by diagnostics. Resume-button discovery remains open.

## Packaging truth

The packaged app contains the VD Agent runtime, bridge VSIX, editor assets,
terminal native dependency, and updater. It does **not** contain VS Code,
Ollama, downloaded models, provider accounts, or credentials. See
`docs/PACKAGED_CAPABILITIES.md`.

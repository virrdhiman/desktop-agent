<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# AI Agent Testing

VD Agent is tested with a three-tier strategy: deterministic unit checks,
trajectory/tool checks, and visual end-to-end checks against the real Electron
app.

This page also records the general testing patterns adopted here: golden tasks, trace/trajectory checks, release
smoke gates, and minimum test-count guards.

## Local command

Run the complete local gate:

```bash
npm run agent:evals
```

It runs:

1. `npm test`
2. `npm run lint`
3. `npm run build`
4. `node scripts/smoke.mjs`

The runner also validates all 73 mapped cases in `evals/agent-golden.json`,
including 12 prompts from real user conversations. It checks unique IDs and
prompts, coverage-file paths, tier minimums, at least 299 passing Vitest tests,
at least 48 smoke assertions, and at least 65 golden cases. If a refactor
silently drops coverage, the command fails.

## Tier 1: Functional & component tests

Goal: verify deterministic scaffolding.

Covered by Vitest:

- system prompt rules,
- response cleanup,
- malformed tool-block parsing,
- failed tool formatting and hints,
- provider failure classification,
- path resolution,
- chat persistence,
- rich restart resume state and corrupt-file backup recovery,
- workspace permission classification and out-of-workspace blocking,
- pre-edit checkpoint creation and restoration,
- deterministic project-memory refreshes,
- IPC helpers,
- model discovery/ranking/fallback behavior and learned local outcome weighting,
- live model catalog refreshes that drop stale/deprecated model IDs.
- safe ZIP inventory and extraction, including traversal, symlink, overwrite,
  and expansion-limit handling,
- concurrent and repeated conversation writes, history bounds, backup
  redaction, and circular resume metadata,
- privacy guarantees for the local diagnostics export.
- adaptive team routing, structured review parsing, bounded repair prompts,
  tool-evidence summaries, and malformed-review fallback.

Command:

```bash
npm test
```

Run the focused reliability set with:

```bash
npm run test:reliability
```

## Tier 2: Trajectory & tool tests

Goal: verify the agent follows the right workflow, not just the right final
sentence.

Covered by `scripts/smoke.mjs` with a local mock OpenAI-compatible provider:

- active provider rate-limits, then fallback provider answers,
- failed `read_file` reaches the model as a labelled failed tool result,
- relative tool paths resolve against the workspace,
- malformed tool JSON is reported back to the model,
- later rounds stay on the provider that answered,
- empty model output gets one corrective retry,
- fabricated "I edited and tested it" answers are challenged before display,
- total provider failure lists every provider and next steps.
- ZIP entries are listed before extraction and extracted files participate in
  checkpoint rollback.
- fenced, Qwen-style native, malformed inner-wrapper, and known bare-JSON tool
  calls all reach the same validated tool path,
- generic deflections are corrected when the user already supplied a task.
- one normal chat query runs Analyst, Executor, two review passes, one
  evidence-backed repair, and Verifier while keeping tool access with the Executor.

Command:

```bash
node scripts/smoke.mjs
```

## Tier 3: Visual & end-to-end tests

Goal: verify real desktop behavior.

Covered by `scripts/smoke.mjs` using Electron plus the Chrome DevTools Protocol:

- the window opens as "VD Agent",
- the preload API exists and Node globals are blocked in the renderer,
- external links cannot navigate the app window,
- settings and chat history survive restart in a throwaway profile,
- API keys are redacted before conversations are written to disk,
- project memory and pre-edit checkpoints survive through main-process IPC,
- a checkpoint can restore a file to its pre-edit content,
- bundled Monaco opens a workspace file,
- no renderer errors are logged.
- a synthetic multi-file order archive is safely listed and extracted without
  touching real user data.

Command:

```bash
npm run smoke
```

Use a packaged app:

```bash
npm run smoke -- --exe "release/win-unpacked/VD Agent.exe"
```

## Optional external frameworks

These are not release blockers because they need accounts, external services, or
interactive vision automation.

| Tool | Useful for VD Agent | Default status |
|------|---------------------|----------------|
| Kane CLI / Testmu AI | Vision-based walkthroughs of packaged Windows/macOS/Linux builds. Good for checking that dialogs, file pickers, and editor layout are visually usable. | Optional manual run |
| EvalView-style regression | Snapshotting agent traces and comparing later runs. VD Agent's local equivalent is `evals/agent-golden.json` plus smoke assertions. | Local pattern implemented |
| Arize AI / AX | Hosted trace and trajectory analysis across many model/provider runs. | Optional, disabled unless explicitly configured |
| LangSmith | LLM-as-judge scoring over saved prompts/tool traces. Useful for larger prompt benchmarks. | Optional, disabled unless explicitly configured |

Keep external eval exports opt-in. VD Agent's default promise is local storage,
no telemetry, and no account, so tests must not silently upload prompts, traces,
code, or screenshots.

## Adding a new golden case

1. Add a case to `evals/agent-golden.json`.
   Mark a prompt `source: "real-user"` only when it came from an actual user;
   maintained regression scenarios use `source: "synthetic"`.
2. Add deterministic coverage in Vitest or a mock-provider case in
   `scripts/smoke.mjs`.
3. If the case increases coverage, raise the minimum count in
   `evals/agent-golden.json`.
4. Run `npm run agent:evals`.

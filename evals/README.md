<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Agent Evaluations

This folder contains VD Agent's golden agent-evaluation data.

The dataset currently contains 51 cases across functional, trajectory, and
visual tiers. Scenarios use `source: "synthetic"` unless they preserve an
actual failure reported by a user. The first real-user case covers inspecting
all files in `order-api-raw.zip` and producing traceable, verified CSV output.

The structure is inspired by public AI-agent evaluation practices, including
commit-reconstruction benchmarks, trace/trajectory analysis, and visual smoke
checks.

Run the local suite with:

```bash
npm run agent:evals
```

That command verifies three layers:

1. Functional/component behavior with Vitest.
2. Agent trajectory behavior with the mock-provider smoke test.
3. Visual end-to-end behavior by launching the real Electron app through CDP.

It also verifies unique case IDs/prompts, existing in-repository `coveredBy`
paths, per-tier minimums, and minimum unit, smoke, and golden-case counts.

External systems such as Testmu/Kane, LangSmith, or Arize AX can be layered on
later, but the local suite is the release gate because it runs without accounts,
secrets, or network services.

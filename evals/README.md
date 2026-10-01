<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Agent Evaluations

This folder contains VD Agent's golden agent-evaluation data.

The dataset currently contains 81 cases across functional, trajectory, and
visual tiers. Twenty cases preserve prompts from real user conversations;
maintained scenarios use `source: "synthetic"`. The real cases cover repository
execution, response quality, licensing/provenance, resume behavior, dynamic
free-model refresh, local history, release costs, handoffs, hosted eval export,
release polish, bundle-size optimization, and verified archive-to-CSV output.
It also covers adaptive multi-agent routing, role isolation, dynamic specialists,
saved team presets, token budgets, visual trace panels, bounded repair,
evidence-aware synthesis, and safe fallback when a specialist returns junk.

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

To prepare a local JSONL import file for a hosted dashboard, run:

```bash
npm run agent:evals:export -- --provider langsmith
npm run agent:evals:export -- --provider arize
```

Generated files live under `evals/hosted/` and are intentionally ignored by git.

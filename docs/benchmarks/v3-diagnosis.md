# Benchmark v3 Diagnosis

This diagnosis uses the archived per-cell evidence at
`C:\vd-vms\bench-archive\benchmark-v3-results.json` and the task definitions in
`scripts/benchmark-v3-prompts.mjs`. A cell is classified by the primary reason
the recorded result cannot be accepted, not by the model's narrative.

## Failed-cell classification

| Cells | Class | Evidence | Interpretation |
|---|---|---|---|
| `gemini:1`, `llm7-deepseek:1`, `mistral:1`, `nvidia:1`, `ollama-qwen:1` | MODEL | Validator reasons are `No Python CLI candidate was found` or `No Python CLI converted...`; Mistral left `csv_stats.py`, `test.csv`, and `test_csv_stats.py`, but the independent validator still failed. No provider error status appears. | The models did not produce a passing CLI/test result. |
| `gemini:2`, `llm7-deepseek:2`, `mistral:2`, `nvidia:2`, `ollama-qwen:2` | MODEL | Validator reason is `Seeded JavaScript regression test is still failing`; archived files include the seeded `calc.js` and `calc.test.js`, and Gemini/Mistral evidence shows `module.exports = (a, b) => a - b` remained. | The agent did not complete the seeded fix. |
| `gemini:3`, `llm7-deepseek:3`, `mistral:3`, `nvidia:3`, `ollama-qwen:3` | HARNESS | The pre-fix runner reused `<provider>/workspace` for every task; archived later rows contain prior `calc.js`/`calc.test.js` files. The result cannot distinguish task-3 output from contamination. | Re-run is required before assigning model blame. |
| `gemini:4`, `llm7-deepseek:4`, `mistral:4`, `nvidia:4`, `ollama-qwen:4` | HARNESS | Same shared-workspace defect; validator says `Missing xlsx/docx/pdf artifact`, while several rows include unrelated task-2/3 files. | Original evidence is not independent. |
| `gemini:5`, `llm7-deepseek:5`, `mistral:5`, `nvidia:5`, `ollama-qwen:5` | HARNESS | Same shared-workspace defect; validator says `No CSV with title/link columns and data rows was found`, while archived file lists include unrelated prior-task files. | Original evidence is not independent. |
| `gemini:6`, `llm7-deepseek:6`, `mistral:6`, `nvidia:6`, `ollama-qwen:6` | HARNESS | Every result explicitly says `Skipped because task 5 failed independently`; this is a dependent skip, not an independent model attempt. | No model/provider conclusion is valid for task 6. |
| `gemini:7`, `llm7-deepseek:7`, `mistral:7`, `nvidia:7`, `ollama-qwen:7` | HARNESS | Same shared-workspace defect; task-7 validators saw prior-task files. This is also the row where the new per-task workspace regression test applies. | Re-run is required on isolated workspaces. |
| `gemini:9`, `llm7-deepseek:9`, `mistral:9`, `nvidia:9`, `ollama-qwen:9` | MODEL | Validator says `agent did not create repo`; Gemini/Mistral transcripts show the GitHub task text and no completed repository evidence; Ollama claimed success but the filesystem validator found no repo. | The model did not leave verifiable local/GitHub evidence. |
| `gemini:10`, `llm7-deepseek:10`, `mistral:10`, `nvidia:10`, `ollama-qwen:10` | MODEL | Validator says `agent did not create clone/venv`; Mistral's transcript explicitly says the `git clone` timed out and was not successful; Ollama claimed completion while no clone/venv was found. | The model did not complete the requested clone/test flow. |
| `gemini:11`, `llm7-deepseek:11`, `mistral:11`, `nvidia:11`, `ollama-qwen:11` | HARNESS | The old validator depended on `evidence.clonePath` and did not discover a clone created inside the task workspace. The new nested-clone regression test passes, and task-specific workspace paths are now supplied by the runner. | Original task-11 results are not sufficient to blame the model; rerun after the harness fix. |

There is no archived failed cell with a provider error, quota response, or HTTP
5xx classification. Therefore the baseline counts are **APP 0, MODEL 20,
PROVIDER 0, HARNESS 30, unknown 0**. The harness count includes cells whose
evidence was invalidated by shared workspaces or dependency skipping.

## App-suspect review

| Suspect | Status | Evidence |
|---|---|---|
| Tool schema is sent to providers | Ruled out | `src/lib/agent.ts:79-80` builds the complete schema from `AGENT_TOOLS`; provider calls share the same message/tool path. |
| Provider tool-call parsing | Ruled out | `src/lib/agent.ts:312` parses tool blocks; parser coverage is in `src/lib/agent.test.ts:132-180`; archived transcripts contain parsed tool calls. |
| `run_command` cwd/PYTHONPATH | Ruled out | `electron/toolSupport.ts:45` defaults `run_command` to the workspace; `electron/__tests__/toolSupport.test.ts:18-29` verifies it. |
| File writes stay in workspace and persist | Ruled out | `electron/toolSupport.ts` resolves workspace paths; archived validators observed created files such as Mistral's `csv_stats.py` and Gemini's `product_and_email.md`. |
| Approval resumes the agent loop | Ruled out | `src/components/AgentChat.tsx:565-620` executes and feeds tool results back; the existing 56/56 smoke run covers approval/queue behavior. |
| Completion claims require verification | **Confirmed and fixed** | The new failing test first showed `Done` passed after only `edit_file`; `7eafb54` adds a successful-result requirement and the test now passes. |
| Context/system-prompt truncation | Ruled out as an app cause | `src/lib/agent.ts:225` and `374-390` add explicit truncation markers and narrowing instructions; tests cover truncation rather than silently cutting context. |
| Per-task timeout versus hang | **Confirmed and fixed in harness** | `scripts/benchmark-v3-runner.mjs:163-164` had a deadline but reported ordinary `fail`; `345189a` records deadline failures as `timeout` and adds a regression test. |

## Task 11 path proof

Before the fix, `prepareWorkspace` created a task workspace but passed only an
optional external `VD_BENCH_SELFTEST_CLONE` path. `validateTask11` then returned
`VD Agent clone path missing` even when a model could have created a nested clone.
The failing regression test reproduced that contract. `4b60299` now searches
the task workspace for a nested VD Agent `package.json`/`src` clone and returns
the discovered path in evidence. The rerun must therefore distinguish “model
never cloned” from “clone existed but tests/no-push evidence failed.”

## Isolated rerun record

The affected cells were rerun in per-provider roots under `C:\vd-vms\bench2`,
with a 10-minute cell cap. The runner's final status is used below; provider
labels from earlier output that only said `API error` were not treated as an
outage after `444f2ae` tightened the classifier.

| Provider | Rerun cells and outcome | Evidence |
|---|---|---|
| Gemini | `2=fail`, `7=timeout`, `11=fail` | `Seeded JavaScript regression test is still failing`; `README, script, tests, or ZIP missing`; `VD Agent clone path missing`. |
| Mistral | `1=fail`, `2=pass`, `7=timeout`, `10=timeout`, `11=fail` | Python CLI, seeded JS, artifact, clone/venv validator reasons; task 2 is the one passing cell. |
| LLM7 DeepSeek | `7=fail`, `11=fail` | Artifact and clone validator reasons; no provider outage evidence. |
| NVIDIA | `7=timeout`, `11=timeout` | Artifact and clone validator reasons reached the 10-minute cap. |
| Ollama | `1=fail`, `2=fail`, `5=timeout`; `6=dependent skip` | Python CLI, seeded JS, and CSV validator reasons; task 6 was not independently runnable after task 5 failed. |

No rerun produced an HTTP 429/5xx, quota, rate-limit, or explicit provider/server
outage. The rerun class is therefore MODEL for task-specific output failures,
HARNESS/timeout for bounded or dependent cells, and PROVIDER 0. The archived
baseline remains the source for the complete 50-cell classification above;
isolated reruns are the before-to-after evidence for the fixed task paths.

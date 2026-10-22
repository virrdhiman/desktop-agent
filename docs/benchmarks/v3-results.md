# Benchmark v3 results

Source: `C:d-vmsenchenchmark-v3-results.json`; raw archive: `C:d-vmsench-archiveenchmark-v3-results.json`.
All results are independently scored from filesystem/process/API evidence; tasks 9–11 are forced failures because the agent did not create the requested repository/clone/venv.

| Model | Task | Result | Time | Retries | Hallucinated success | Cause |
|---|---:|---|---:|---:|---|---|
| gemini | 1 | fail | 131.3s | 0 | no | No Python CLI candidate was found |
| gemini | 2 | fail | 633.7s | 0 | yes | Seeded JavaScript regression test is still failing |
| gemini | 3 | fail | 145.2s | 0 | no | Did not find an approximately 300-word product description and formal email draft |
| gemini | 4 | fail | 687.8s | 0 | no | Missing xlsx/docx/pdf artifact |
| gemini | 5 | fail | 183.5s | 0 | no | No CSV with title/link columns and data rows was found |
| gemini | 6 | fail | 604.9s | 0 | no | Skipped because task 5 failed independently |
| gemini | 7 | fail | 91.3s | 0 | yes | README, script, tests, or ZIP missing |
| gemini | 8 | pass | 6.1s | 0 | no |  |
| gemini | 9 | fail | 602.9s | 0 | no | agent did not create repo |
| gemini | 10 | fail | 602.9s | 0 | no | agent did not create clone/venv |
| gemini | 11 | fail | 603.5s | 0 | no | agent did not create separate clone/test increase |
| llm7-deepseek | 1 | fail | 16.2s | 0 | no | No Python CLI candidate was found |
| llm7-deepseek | 2 | fail | 5.6s | 0 | no | Seeded JavaScript regression test is still failing |
| llm7-deepseek | 3 | fail | 6.1s | 0 | no | Did not find an approximately 300-word product description and formal email draft |
| llm7-deepseek | 4 | fail | 31.8s | 0 | no | Missing xlsx/docx/pdf artifact |
| llm7-deepseek | 5 | fail | 5.4s | 0 | no | No CSV with title/link columns and data rows was found |
| llm7-deepseek | 6 | fail | 8.3s | 0 | no | Skipped because task 5 failed independently |
| llm7-deepseek | 7 | fail | 7.3s | 0 | no | README, script, tests, or ZIP missing |
| llm7-deepseek | 8 | pass | 7.5s | 0 | no |  |
| llm7-deepseek | 9 | fail | 12.1s | 1 | no | agent did not create repo |
| llm7-deepseek | 10 | fail | 11.6s | 1 | no | agent did not create clone/venv |
| llm7-deepseek | 11 | fail | 12.2s | 1 | no | agent did not create separate clone/test increase |
| mistral | 1 | fail | 11.9s | 0 | yes | No Python CLI converted the sample CSV and passed three independent tests |
| mistral | 2 | fail | 607.4s | 0 | yes | Seeded JavaScript regression test is still failing |
| mistral | 3 | fail | 20.9s | 0 | no | Did not find an approximately 300-word product description and formal email draft |
| mistral | 4 | fail | 606.1s | 0 | no | Missing xlsx/docx/pdf artifact |
| mistral | 5 | fail | 605.8s | 0 | no | No CSV with title/link columns and data rows was found |
| mistral | 6 | fail | 7.5s | 0 | no | Skipped because task 5 failed independently |
| mistral | 7 | fail | 11.7s | 0 | no | README, script, tests, or ZIP missing |
| mistral | 8 | pass | 29.2s | 0 | no |  |
| mistral | 9 | fail | 604.0s | 0 | no | agent did not create repo |
| mistral | 10 | fail | 603.8s | 0 | yes | agent did not create clone/venv; claimed success anyway |
| mistral | 11 | fail | 603.0s | 0 | yes | agent did not create separate clone/test increase; claimed success anyway |
| nvidia | 1 | fail | 4.6s | 0 | no | No Python CLI candidate was found |
| nvidia | 2 | fail | 4.0s | 0 | no | Seeded JavaScript regression test is still failing |
| nvidia | 3 | fail | 311.4s | 0 | no | Did not find an approximately 300-word product description and formal email draft |
| nvidia | 4 | fail | 305.7s | 0 | no | Missing xlsx/docx/pdf artifact |
| nvidia | 5 | fail | 306.6s | 0 | no | No CSV with title/link columns and data rows was found |
| nvidia | 6 | fail | 305.1s | 0 | no | Skipped because task 5 failed independently |
| nvidia | 7 | fail | 304.9s | 0 | no | README, script, tests, or ZIP missing |
| nvidia | 8 | pass | 2.5s | 0 | no |  |
| nvidia | 9 | fail | 310.4s | 0 | no | agent did not create repo |
| nvidia | 10 | fail | 309.3s | 0 | no | agent did not create clone/venv |
| nvidia | 11 | fail | 308.7s | 0 | no | agent did not create separate clone/test increase |
| ollama-qwen | 1 | fail | 613.6s | 0 | yes | No Python CLI candidate was found |
| ollama-qwen | 2 | fail | 86.2s | 0 | yes | Seeded JavaScript regression test is still failing |
| ollama-qwen | 3 | fail | 187.3s | 0 | no | Did not find an approximately 300-word product description and formal email draft |
| ollama-qwen | 4 | fail | 657.9s | 0 | no | Missing xlsx/docx/pdf artifact |
| ollama-qwen | 5 | fail | 129.2s | 0 | yes | No CSV with title/link columns and data rows was found |
| ollama-qwen | 6 | fail | 100.4s | 0 | yes | Skipped because task 5 failed independently |
| ollama-qwen | 7 | fail | 605.2s | 0 | no | README, script, tests, or ZIP missing |
| ollama-qwen | 8 | pass | 2.4s | 0 | no |  |
| ollama-qwen | 9 | fail | 75.2s | 0 | yes | agent did not create repo; claimed success anyway |
| ollama-qwen | 10 | fail | 71.0s | 0 | yes | agent did not create clone/venv; claimed success anyway |
| ollama-qwen | 11 | fail | 134.0s | 0 | yes | agent did not create separate clone/test increase; claimed success anyway |

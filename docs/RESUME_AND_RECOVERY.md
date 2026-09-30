# Resume and Recovery

VD Agent stores working state locally so a conversation can continue after an app restart.

## What is restored

Each conversation stores its messages plus a bounded resume record containing:

- workspace path and open editor files,
- task/checklist steps,
- terminal tabs and the latest terminal output,
- recent tool executions and their compact results,
- provider and model,
- local project memory and an older-history summary,
- last verification command and result,
- latest pre-edit recovery checkpoint,
- Git branch and whether the workspace was dirty.

The latest chat is restored at launch. Opening another item in **Sessions** restores its saved working state and workspace.

## File checkpoints

Before an agent write, edit, create, multi-file edit, or delete, the Electron main process snapshots the targeted files. Checkpoints are stored under `<userData>/checkpoints/` and are independent of the model prompt.

Use **Sessions → Restore** to return those files to their pre-edit state. The restore operation affects only files recorded in that checkpoint. Files larger than 2 MB are skipped and shown in the restore result; a checkpoint is capped at 12 MB, and VD keeps the newest 20 checkpoints per session.

Deleting a saved chat also removes its recovery checkpoints.

Shell commands can modify files VD Agent cannot predict. They require approval by default, but their side effects are not automatically reversible. Keep important work in Git and review commands before allowing them.

## Project memory

`<userData>/project-memory/` contains a deterministic summary of the open repository. It is built locally from package metadata, repository instructions, the README, and top-level structure. It is refreshed when those files change and is sent only to the selected AI provider as part of normal task context.

## Chat management

Sessions can be searched, renamed, pinned, exported, imported, reopened, restored, or deleted. Conversation files use atomic replacement and retain a `.bak` recovery copy of the previous valid save. Configured API keys and common API-key formats are redacted from messages, summaries, and resume state before writing.

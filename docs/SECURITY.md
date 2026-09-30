<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Security

## What the agent can do

VD Agent is a coding agent. When you ask it to, it can **read and write files, run shell commands, and run git commands with your user permissions**. Tools are not sandboxed. `run_command` runs through your shell with a 30-second timeout, and tools such as `delete_file` and `git_discard_changes` are destructive.

The system prompt tells the agent to inspect before acting and to ask before destructive actions, but a model can still make mistakes or be misled.

## Using it safely

- **Work in a git repository** and commit before large changes, so you can review diffs and roll back.
- **Turn on Plan Mode** for bigger tasks. The agent is told to propose a plan and wait for your approval. This is an instruction to the model, not a technical block.
- **Read tool calls** in the agent's replies, and check the **Tasks** panel for what ran.
- **Watch for prompt injection.** File contents, web pages, and command output go to the model and can contain instructions aimed at it. Be careful with untrusted repositories and web content.
- **Keep secrets out of the workspace**, or use a local model. Anything the agent reads may be sent to your AI provider.
- **Avoid community proxies** for private code. They are third-party services that see everything you send.

## How the app is hardened

- The renderer runs with `contextIsolation`, `sandbox`, and no `nodeIntegration`. It can only reach the system through the APIs exposed by the preload script (`window.api`).
- A Content-Security-Policy limits which scripts the window can load. The code editor (Monaco) is bundled with the app rather than loaded from a CDN.
- External links open in your default browser. The app window cannot open new windows or navigate away from the app.
- API keys are encrypted with the OS keychain when available, redacted from saved chats and provider error messages, and left out of settings exports. The model list cache is keyed by a hash of the key.
- Chat session IDs are validated so a chat file can't be read or deleted outside the conversations folder.
- VD Agent has no telemetry, auto-update, or remote code loading.

## Verifying downloads

Download only from the [official Releases page](https://github.com/virrdhiman/desktop-agent/releases) and check the file against `SHA256SUMS.txt` (see [INSTALL.md](./INSTALL.md#verify-your-download)). Official releases should be code-signed; treat an unsigned file from anywhere else as untrusted.

## Supported versions

Security fixes go into the latest release. Please update before reporting a problem.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Contact the maintainer privately through [virender.in](https://virender.in), with:

- the VD Agent version and your OS,
- steps to reproduce, and
- the impact you expect.

You'll get an acknowledgement, and the fix will be credited in the changelog unless you prefer otherwise.

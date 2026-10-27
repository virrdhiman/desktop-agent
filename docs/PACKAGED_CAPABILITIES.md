<!--
  @author Virender Dhiman
  @year 2026
  @project PIT Agent
  @license Proprietary. See LICENSE.
-->

# Packaged capabilities and prerequisites

This matrix describes what a packaged PIT Agent build provides and what still
has to be installed or configured on the user's machine. “Bundled support”
means the desktop app contains the integration, provider entry, or package; it
does not mean that an external application, runtime, model, account, or key is
included.

| Capability | Bundled in PIT Agent | Separate prerequisite | What the app validates | Known validation gap |
| --- | --- | --- | --- | --- |
| Desktop chat and settings | Desktop app, provider catalog, settings UI, and local configuration | A supported Windows, macOS, or Linux environment; an AI provider or local runtime | Settings can persist provider configuration and the chat path reports request outcomes | Build/package checks do not prove every OS-specific installer and provider endpoint works in a user's environment |
| API providers | Provider adapters, catalog entries, model-selection and fallback support | Provider account/key, network access, and any provider-specific quota or billing | Key presence is represented as configured; live model refresh and a chat request can validate access when run | Saving a key is not an authentication or quota check; provider terms, model availability, and network access can change |
| Ollama local provider | Ollama provider entry, OpenAI-compatible request support, default URL/model guidance, and Settings onboarding | Ollama application/runtime, a running local server, and the selected model downloaded with Ollama | A placeholder key means only configured; a successful request is recorded as evidence and shown as verified in Settings | Saving the provider does not health-check the server or prove the selected model exists; a prior success is not a guarantee that the runtime is healthy now |
| Other local OpenAI-compatible providers | Provider configuration UI and compatible request path for LM Studio, llama.cpp, and custom local servers | The selected runtime/server, a listening endpoint, and a loaded model | URL/model fields can be saved; requests report success or failure | Settings does not install, start, or inspect the external runtime/model before the first request |
| VS Code bridge | VS Code Bridge panel, bridge IPC support, and the PIT Agent Bridge VSIX in packaged builds | VS Code application, the bridge extension loaded into that VS Code installation, a matching workspace, and workspace trust for full capabilities | The bridge panel checks for a VS Code CLI, bundled VSIX availability, exported bridge state, and command results | CLI discovery and extension installation are platform-dependent; no single packaged check proves VS Code is installed, trusted, open on the same workspace, and exporting context on every OS |
| VS Code editor features | Bridge commands, context exchange, previews, and local workspace-index support | A connected VS Code workspace and the extension's permissions | Bridge status, export age, pending commands, previews, and command results are visible when the extension reports them | “VSIX bundled” does not mean the VS Code application or extension is already installed; Restricted Mode and workspace trust change available operations |
| Local inline AI in the bridge | VS Code-side provider wiring and local fallback support | Ollama (or the configured local provider), a running runtime, and an installed model | VS Code can report AI status and autocomplete smoke-test results after the bridge is connected | The desktop package cannot pre-validate a user's runtime, model download, hardware capacity, or latency |

## Reading readiness states

For local providers, **Configured · not verified** is the honest initial state
when Settings contains only the saved placeholder key and URL/model fields. It
does not mean that the local server is running. Settings changes do not perform
a health request. After a successful request, the provider may show **Local
provider verified**; that label refers to the recorded successful request, not a
continuous health monitor.

For VS Code, a bundled VSIX is an installable package, not the VS Code
application. Install VS Code separately, then load the bridge into that
installation and open the same workspace. Workspace trust is also separate
from installation.

This document records PIT Agent's current packaging and validation boundaries;
it makes no comparative product-performance claim.

## Release gate

Every release job must run the capability validator against its unpacked
resources directory with an explicit target platform and architecture:

```bash
node scripts/validate-packaged-capabilities.mjs \
  --platform win32 --arch x64 \
  --resources release/win-unpacked/resources
```

Use `--platform darwin` for macOS and `--platform linux` for Ubuntu/Linux. The
gate checks the renderer, Electron main/preload files, Monaco assets, native
`node-pty` runtime/helper, updater runtime, and exact source-to-packaged VSIX
bytes. It does not launch an installer and does not modify the resources tree.

<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Code Signing and Notarization

VD Agent can build unsigned private installers, but public Windows and macOS users may see SmartScreen or Gatekeeper warnings until releases are signed. Do not commit certificates, passwords, exported keychains, `.env` files, or GitHub secret values.

## Quick Preflight

Run this before publishing:

```bash
npm run release:signing
```

For an official release that must fail if signing is missing:

```bash
npm run release:signing -- --require-official
```

The command is intentionally safe: it only checks environment variables and certificate file paths. It does not upload, modify, or create certificates.

## GitHub Secret Setup

After you obtain real certificates and Apple notarization credentials, upload them with:

```powershell
.\Win\setup-release-secrets.bat `
  -WindowsPfxPath "D:\secure\vd-agent-code-signing.pfx" `
  -MacP12Path "D:\secure\vd-agent-developer-id.p12" `
  -AppleId "you@example.com" `
  -AppleAppSpecificPassword "<app-specific password>" `
  -AppleTeamId "<team id>" `
  -RequireSigning
```

The script base64-encodes certificate files, writes GitHub Actions secrets, and sets the `REQUIRE_SIGNING=true` repository variable when requested. It does not write secrets into the repo.

## Windows

Required for signed Windows installers:

- `CSC_LINK`: path to a `.pfx` certificate, or the base64 value stored as a GitHub secret.
- `CSC_KEY_PASSWORD`: password for that `.pfx`.

Local PowerShell example:

```powershell
$env:CSC_LINK = "D:\secure\vd-agent-code-signing.pfx"
$env:CSC_KEY_PASSWORD = "<certificate password>"
npm run release:signing -- --platform Windows --require-signing
Win\build.bat
```

GitHub Actions secrets:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

SmartScreen reputation still builds over time. A valid signing certificate reduces warnings and proves the publisher, but brand-new certificates can still show caution until reputation develops.

For private QA only, you can create a local self-signed certificate:

```powershell
.\Win\create-local-test-certificate.bat
```

That test certificate can exercise the local signing path, but it will not remove public SmartScreen warnings and should not be used for official releases.

## macOS

Required for a signed macOS build:

- `CSC_LINK`: path/base64 for a Developer ID Application `.p12`, and `CSC_KEY_PASSWORD`; or
- `CSC_NAME`: an installed keychain identity on the macOS build machine.

Required for notarization:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Local shell example on macOS:

```bash
export CSC_LINK="$HOME/secure/vd-agent-developer-id.p12"
export CSC_KEY_PASSWORD="<certificate password>"
export APPLE_ID="<apple developer email>"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific password>"
export APPLE_TEAM_ID="<team id>"
npm run release:signing -- --platform macOS --require-official
bash Mac/build.sh
```

GitHub Actions secrets:

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

## GitHub Actions

The release workflow signs automatically when the relevant secrets are present. For manual runs, enable **require_signing** to fail Windows/macOS jobs if signing or notarization credentials are missing.

For tagged releases, set the repository variable `REQUIRE_SIGNING=true` if you want official releases to fail instead of uploading unsigned artifacts.

## Clean VM QA

Signing only proves publisher identity. It does not replace installer QA. After a signed build, run the clean-machine checklist in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md):

```powershell
.\Win\prepare-clean-vm-qa.bat "C:\path\to\windows.iso"
.\Win\create-clean-vm.bat "C:\path\to\windows.iso"
```

Then install the generated `VD Agent Setup <version>.exe` inside the VM, launch it from Start Menu and desktop shortcut, verify chat/history/VS Code bridge setup, and uninstall it cleanly.

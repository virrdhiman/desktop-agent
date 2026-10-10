param(
  [Parameter(Mandatory = $true)]
  [string]$IsoPath,
  [string]$Name = 'VD-Agent-QA',
  [string]$StageDir = 'release\vm-qa-staging'
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Required-File {
  param(
    [string]$Path,
    [string]$Label
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "${Label} is missing: $Path"
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -le 0) { throw "${Label} is empty: $Path" }
  Write-Host "OK ${Label}: $Path"
}

$iso = Resolve-Path -LiteralPath $IsoPath
Required-File -Path $iso -Label 'Windows ISO'

$installer = Join-Path (Get-Location) 'release\VD Agent Setup 1.1.0.exe'
$portable = Join-Path (Get-Location) 'release\VD Agent 1.1.0.exe'
$vsix = Join-Path (Get-Location) 'vscode-extension\vd-agent-vscode-bridge-0.4.5.vsix'

Write-Step "Checking release artifacts"
Required-File -Path $installer -Label 'Windows installer'
Required-File -Path $portable -Label 'Windows portable app'
Required-File -Path $vsix -Label 'VS Code bridge VSIX'

Write-Step "Preparing VM staging folder"
$stage = Join-Path (Get-Location) $StageDir
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -LiteralPath $installer -Destination $stage -Force
Copy-Item -LiteralPath $portable -Destination $stage -Force
Copy-Item -LiteralPath $vsix -Destination $stage -Force

$checklist = Join-Path $stage 'VM-QA-CHECKLIST.txt'
@"
VD Agent clean VM QA checklist
==============================

VM name: $Name
ISO: $iso

Inside the clean Windows VM:
1. Finish Windows setup.
2. Install VS Code.
3. Copy this staging folder into the VM:
   $stage
4. Install VD Agent Setup 1.1.0.exe.
5. Launch VD Agent from Start Menu and desktop shortcut.
6. Confirm chat opens, local history persists after restart, terminal starts, and provider settings are saved locally.
7. In VS Code, run:
   code --install-extension vd-agent-vscode-bridge-0.4.5.vsix
8. Open a repo in VS Code, choose Trust Workspace, then run:
   VD Agent: Export Workspace Context
9. In VD Agent, verify VS Code bridge status, active file, open file, diff preview, and one small edit/apply flow.
10. Uninstall VD Agent and confirm app uninstall works. User data should remain unless manually deleted.

Host commands:
  .\Win\create-clean-vm.bat "$iso"
  npm run release:vm-qa
"@ | Set-Content -LiteralPath $checklist -Encoding UTF8

Write-Step "Ready"
Write-Host "Staging folder: $stage" -ForegroundColor Green
Write-Host "Checklist: $checklist"
Write-Host ''
Write-Host 'Create/start the VM with:'
Write-Host "  .\Win\create-clean-vm.bat `"$iso`""

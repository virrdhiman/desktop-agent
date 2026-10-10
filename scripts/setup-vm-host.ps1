param(
  [ValidateSet('VirtualBox', 'HyperV')]
  [string]$Prefer = 'VirtualBox'
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Require-Admin {
  if (-not (Test-Admin)) {
    throw "Run this script from an elevated PowerShell window: Start menu -> PowerShell -> Run as administrator."
  }
}

function Get-WindowsEdition {
  try {
    return (Get-ComputerInfo).WindowsProductName
  } catch {
    return ''
  }
}

function Install-VirtualBox {
  Require-Admin
  Write-Step "Checking VirtualBox"
  $vbox = Get-Command VBoxManage -ErrorAction SilentlyContinue
  if ($vbox) {
    & $vbox.Source --version
    Write-Host "VirtualBox is already installed: $($vbox.Source)"
    return
  }

  Write-Step "Installing Oracle VirtualBox with winget"
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "winget was not found. Install App Installer from Microsoft Store, or install VirtualBox manually from https://www.virtualbox.org/wiki/Downloads"
  }

  winget install --id Oracle.VirtualBox --exact --source winget --accept-package-agreements --accept-source-agreements

  $possible = @(
    "$env:ProgramFiles\Oracle\VirtualBox\VBoxManage.exe",
    "$env:ProgramFiles(x86)\Oracle\VirtualBox\VBoxManage.exe"
  )
  $installed = $possible | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $installed) {
    $vboxCommand = Get-Command VBoxManage -ErrorAction SilentlyContinue
    if ($vboxCommand) {
      $installed = $vboxCommand.Source
    }
  }
  if (-not $installed) {
    throw "VirtualBox install command finished, but VBoxManage was not found. Reboot, then run this script again."
  }

  & $installed --version
  Write-Host "VirtualBox installed: $installed"
}

function Explain-HyperV {
  Require-Admin
  $edition = Get-WindowsEdition
  Write-Step "Checking Hyper-V path"
  Write-Host "Windows edition: $edition"
  if ($edition -match 'Home') {
    Write-Host "Full Hyper-V Manager is not supported on Windows Home. Use VirtualBox for VD Agent clean-machine QA on this device." -ForegroundColor Yellow
    return
  }

  Write-Host "Enabling Hyper-V requires a reboot. Run this manually if you choose Hyper-V:"
  Write-Host "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All"
}

Write-Step "VD Agent VM host setup"
Write-Host "Preferred VM host: $Prefer"
Write-Host "Admin: $(Test-Admin)"
Write-Host "Windows edition: $(Get-WindowsEdition)"

if ($Prefer -eq 'HyperV') {
  Explain-HyperV
} else {
  Install-VirtualBox
}

Write-Step "Next clean-machine QA step"
Write-Host "1. Download a Windows evaluation ISO from Microsoft."
Write-Host "2. Create a clean VM named VD-Agent-QA in VirtualBox."
Write-Host "3. Install VS Code in the VM."
Write-Host "4. Copy VD Agent Setup 1.1.0.exe and vd-agent-vscode-bridge-0.4.5.vsix from release/ into the VM."
Write-Host "5. Run npm run release:vm-qa on the host for artifact preflight, then run the manual VM QA checklist in the VM."


param(
  [string]$Repo = 'virrdhiman/desktop-agent',
  [string]$WindowsPfxPath = '',
  [string]$WindowsPfxPassword = '',
  [string]$MacP12Path = '',
  [string]$MacP12Password = '',
  [string]$AppleId = '',
  [string]$AppleAppSpecificPassword = '',
  [string]$AppleTeamId = '',
  [switch]$RequireSigning,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. Install it or add it to PATH, then retry."
  }
}

function Read-SecretText {
  param(
    [string]$Prompt,
    [string]$Existing = ''
  )
  if ($Existing) { return $Existing }
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Convert-FileToBase64 {
  param([string]$Path)
  $resolved = Resolve-Path -LiteralPath $Path
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "Certificate file was not found: $Path"
  }
  return [Convert]::ToBase64String([IO.File]::ReadAllBytes($resolved))
}

function Set-GitHubSecret {
  param(
    [string]$Name,
    [string]$Value
  )
  if (-not $Value) { return }
  if ($DryRun) {
    Write-Host "DRY RUN secret $Name would be set." -ForegroundColor Yellow
    return
  }
  & gh secret set $Name --repo $Repo --body $Value | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Failed to set GitHub secret $Name" }
  Write-Host "Set secret $Name" -ForegroundColor Green
}

function Set-GitHubVariable {
  param(
    [string]$Name,
    [string]$Value
  )
  if ($DryRun) {
    Write-Host "DRY RUN variable $Name would be set to $Value." -ForegroundColor Yellow
    return
  }
  & gh variable set $Name --repo $Repo --body $Value | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Failed to set GitHub variable $Name" }
  Write-Host "Set variable $Name" -ForegroundColor Green
}

Write-Step "Checking GitHub CLI"
Assert-Command gh
& gh auth status --hostname github.com | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated. Run: gh auth login' }

$hasAnyInput = $WindowsPfxPath -or $MacP12Path -or $AppleId -or $AppleAppSpecificPassword -or $AppleTeamId -or $RequireSigning
if (-not $hasAnyInput) {
  Write-Host 'No signing inputs were passed, so no secrets were changed.'
  Write-Host 'Example:'
  Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-release-secrets.ps1 -WindowsPfxPath D:\secure\vd-agent.pfx -MacP12Path D:\secure\vd-agent.p12 -AppleId you@example.com -AppleTeamId TEAMID -RequireSigning'
  exit 0
}

if ($WindowsPfxPath) {
  Write-Step "Uploading Windows signing certificate"
  Set-GitHubSecret -Name 'WIN_CSC_LINK' -Value (Convert-FileToBase64 -Path $WindowsPfxPath)
  Set-GitHubSecret -Name 'WIN_CSC_KEY_PASSWORD' -Value (Read-SecretText -Prompt 'Windows .pfx password' -Existing $WindowsPfxPassword)
}

if ($MacP12Path) {
  Write-Step "Uploading macOS signing certificate"
  Set-GitHubSecret -Name 'MAC_CSC_LINK' -Value (Convert-FileToBase64 -Path $MacP12Path)
  Set-GitHubSecret -Name 'MAC_CSC_KEY_PASSWORD' -Value (Read-SecretText -Prompt 'macOS .p12 password' -Existing $MacP12Password)
}

if ($AppleId) {
  Write-Step "Uploading Apple notarization account"
  Set-GitHubSecret -Name 'APPLE_ID' -Value $AppleId
}
if ($AppleAppSpecificPassword) {
  Set-GitHubSecret -Name 'APPLE_APP_SPECIFIC_PASSWORD' -Value $AppleAppSpecificPassword
}
if ($AppleTeamId) {
  Set-GitHubSecret -Name 'APPLE_TEAM_ID' -Value $AppleTeamId
}

if ($RequireSigning) {
  Write-Step "Requiring signed official release workflow runs"
  Set-GitHubVariable -Name 'REQUIRE_SIGNING' -Value 'true'
}

Write-Step "Done"
Write-Host "Run this next:"
Write-Host "  npm run release:signing -- --platform Windows --require-signing"
Write-Host "  npm run release:signing -- --platform macOS --require-official"
Write-Host "Then dispatch the GitHub Release workflow with require_signing=true."

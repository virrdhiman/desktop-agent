param(
  [string]$FixtureRoot = 'C:\vd-vms\qa-fixture',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logDir = Join-Path $FixtureRoot 'logs'
$workspace = Join-Path $FixtureRoot 'workspace'
$userData = Join-Path $FixtureRoot 'user-data'
New-Item -ItemType Directory -Force -Path $logDir, $workspace, $userData | Out-Null
Set-Content -LiteralPath (Join-Path $workspace 'release-gate-fixture.ts') -Value "export const releaseGateFixture = 'isolated'`n" -Encoding UTF8
Set-Content -LiteralPath (Join-Path $workspace 'unicode file ü.txt') -Value 'fixture' -Encoding UTF8

$results = [System.Collections.Generic.List[object]]::new()
function Run-Check([string]$Name, [string]$Command, [scriptblock]$Action) {
  $log = Join-Path $logDir (($Name -replace '[^A-Za-z0-9_-]', '-') + '.log')
  Push-Location $repo
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Action 2>&1 | Tee-Object -FilePath $log
    $code = $LASTEXITCODE
  } catch {
    $_ | Out-String | Set-Content -LiteralPath $log -Encoding UTF8
    $code = 1
  } finally { $ErrorActionPreference = $previousErrorAction; Pop-Location }
  $ok = ($code -eq 0)
  $results.Add([pscustomobject]@{ Name = $Name; Status = if ($ok) { 'PASS' } else { 'FAIL' }; Evidence = $log; Command = $Command })
  return $ok
}

$buildOk = $true
if (-not $SkipBuild) { $buildOk = Run-Check 'build' 'npm.cmd run build' { npm.cmd run build } }
$lintOk = Run-Check 'lint' 'npm.cmd run lint' { npm.cmd run lint }
$typecheckOk = $lintOk
$testOk = Run-Check 'vitest' 'npm.cmd test' { npm.cmd test }
$smokeOk = Run-Check 'isolated-smoke' "npm.cmd run smoke -- --out `"$($FixtureRoot)\smoke`"" { npm.cmd run smoke -- --out (Join-Path $FixtureRoot 'smoke') }
$vsixOk = Run-Check 'vscode-package' 'npm.cmd run vscode:package' { npm.cmd run vscode:package }
$preflightOk = Run-Check 'package-preflight' 'npm.cmd run release:preflight' { npm.cmd run release:preflight }
$packageOutput = ".work/release-gate-win-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
$packageOk = Run-Check 'unsigned-package' "npm.cmd run release:package -- --platform windows --output $packageOutput --dir" { npm.cmd run release:package -- --platform windows --output $packageOutput --dir }
$resources = Join-Path $repo "$packageOutput/win-unpacked/resources"
$capabilitiesOk = $true
if (Test-Path -LiteralPath $resources) {
  $validatorCommand = "node scripts/validate-packaged-capabilities.mjs --resources $packageOutput/win-unpacked/resources --platform win32 --arch x64"
  $capabilitiesOk = Run-Check 'packaged-validator' $validatorCommand { node scripts/validate-packaged-capabilities.mjs --resources "$packageOutput/win-unpacked/resources" --platform win32 --arch x64 }
} else {
  $results.Add([pscustomobject]@{ Name = 'packaged-validator'; Status = 'NOT CHECKED'; Evidence = 'release/win-unpacked/resources does not exist; no packaged build was requested' })
}

$automated = @(
  [pscustomobject]@{ Item = '1 Startup/isolation'; Status = if ($smokeOk) { 'PASS' } else { 'FAIL' }; Evidence = 'isolated-smoke.log' },
  [pscustomobject]@{ Item = '2 Agent view'; Status = 'NOT CHECKED'; Evidence = 'Requires manual visual interaction; smoke covers startup only' },
  [pscustomobject]@{ Item = '3 Working modes'; Status = 'NOT CHECKED'; Evidence = 'Requires real UI tool-policy interaction' },
  [pscustomobject]@{ Item = '4 Code window'; Status = 'NOT CHECKED'; Evidence = 'Requires manual editor/window interaction' },
  [pscustomobject]@{ Item = '5 Terminal'; Status = if ($smokeOk) { 'PASS' } else { 'FAIL' }; Evidence = 'isolated-smoke.log; terminal path is exercised by smoke' },
  [pscustomobject]@{ Item = '6 Git fixture'; Status = 'NOT CHECKED'; Evidence = 'Requires throwaway-repository UI workflow' },
  [pscustomobject]@{ Item = '7 Local browser fixture'; Status = 'NOT CHECKED'; Evidence = 'Requires local HTTP fixture interaction' },
  [pscustomobject]@{ Item = '8 Files/path safety'; Status = 'NOT CHECKED'; Evidence = 'Requires manual permission/traversal cases' },
  [pscustomobject]@{ Item = '9 Providers/keys'; Status = 'NOT CHECKED'; Evidence = 'No real credentials used by this gate' },
  [pscustomobject]@{ Item = '10 Chats/long context'; Status = 'NOT CHECKED'; Evidence = 'Requires manual compaction/fork/relaunch flow' },
  [pscustomobject]@{ Item = '11 Stability'; Status = 'NOT CHECKED'; Evidence = '30-minute idle and crash recovery require a live desktop session' },
  [pscustomobject]@{ Item = '12 Security'; Status = 'NOT CHECKED'; Evidence = 'Requires packaged runtime inspection' },
  [pscustomobject]@{ Item = '13 Packaging'; Status = if ($buildOk -and $vsixOk -and $preflightOk -and $packageOk -and $capabilitiesOk) { 'PASS' } else { 'FAIL' }; Evidence = 'build/vscode-package/package-preflight/unsigned-package/packaged-validator logs' },
  [pscustomobject]@{ Item = '14 Final checks'; Status = if ($buildOk -and $lintOk -and $testOk) { 'PASS' } else { 'FAIL' }; Evidence = 'build/lint/vitest logs' }
)
$verdict = if (($automated | Where-Object Status -eq 'FAIL').Count -eq 0 -and ($automated | Where-Object Status -eq 'NOT CHECKED').Count -eq 0) { 'GO' } else { 'NO-GO' }

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('# Release Gate')
$lines.Add('')
$lines.Add("Generated: $(Get-Date -Format o)")
$lines.Add("Fixture root: ``$FixtureRoot`` (throwaway only)")
$lines.Add("Release verdict: **$verdict**")
$lines.Add('')
$lines.Add('| Item | Status | Evidence |')
$lines.Add('|---|---|---|')
foreach ($row in $automated) { $lines.Add("| $($row.Item) | $($row.Status) | ``$($row.Evidence)`` |") }
$lines.Add('')
$lines.Add('## Automated checks')
foreach ($row in $results) { $lines.Add("- **$($row.Status)** $($row.Name): ``$($row.Evidence)``") }
$lines.Add('')
$lines.Add('Manual items remain NO-GO until the operator completes the fixture-only visual checklist. No real sites, accounts, API keys, purchases, or user data are used by this gate.')
Set-Content -LiteralPath (Join-Path $repo 'docs/release-checklist.md') -Value $lines -Encoding UTF8

Write-Output "Release gate verdict: $verdict"
Write-Output "Checklist: $(Join-Path $repo 'docs/release-checklist.md')"
Write-Output "Fixture: $FixtureRoot"
if ($verdict -ne 'GO') { exit 2 }

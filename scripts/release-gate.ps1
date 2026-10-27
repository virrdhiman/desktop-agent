param(
  [string]$FixtureRoot = 'C:\vd-vms\qa-fixture',
  [switch]$SkipBuild,
  [int]$StabilityMinutes = 30
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

$automatedQaOk = $false
$automatedQaReport = Join-Path $FixtureRoot 'automated\logs\automated-qa.json'
$packagedExe = Join-Path $repo "$packageOutput/win-unpacked/PIT Agent.exe"
if ($packageOk -and (Test-Path -LiteralPath $packagedExe)) {
  $automatedCommand = "node scripts/release-automated-qa.mjs --exe `"$packagedExe`" --package-root `"$(Join-Path $repo $packageOutput)`" --fixture `"$(Join-Path $FixtureRoot 'automated')`" --stability-minutes $StabilityMinutes"
  $automatedQaOk = Run-Check 'automated-packaged-qa' $automatedCommand { node scripts/release-automated-qa.mjs --exe $packagedExe --package-root (Join-Path $repo $packageOutput) --fixture (Join-Path $FixtureRoot 'automated') --stability-minutes $StabilityMinutes }
} else {
  $results.Add([pscustomobject]@{ Name = 'automated-packaged-qa'; Status = 'NOT CHECKED'; Evidence = 'packaged executable was not produced' })
}

function Qa-Group([string[]]$Names) {
  if (-not (Test-Path -LiteralPath $automatedQaReport)) { return [pscustomobject]@{ Status = 'NOT CHECKED'; Evidence = 'automated-packaged-qa did not produce a report' } }
  $report = Get-Content -LiteralPath $automatedQaReport -Raw | ConvertFrom-Json
  $rows = @($report.results | Where-Object { $Names -contains $_.name })
  if ($rows.Count -lt $Names.Count) { return [pscustomobject]@{ Status = 'NOT CHECKED'; Evidence = "Missing automated checks: $((Compare-Object $Names @($rows.name) -PassThru | Where-Object { $_ -in $Names }) -join ', ')" } }
  $failed = @($rows | Where-Object status -eq 'FAIL')
  [pscustomobject]@{ Status = if ($failed.Count) { 'FAIL' } else { 'PASS' }; Evidence = (($rows | ForEach-Object { "$($_.name): $($_.detail)" }) -join ' | ') }
}

$qaAgent = Qa-Group @('packaged first run is isolated and key-free', 'first-run key guidance is visible')
$qaModes = Qa-Group @('working mode policy is enforced in the packaged app')
$qaIde = Qa-Group @('IDE no-folder state offers Open Folder', 'IDE is single-instance and second open focuses it', 'IDE follows the shared workspace', 'packaged Monaco contributions load offline for TS, JS and JSON', 'IDE rename action is wired', 'IDE delete confirmation is wired', 'QA dialog controls are available only for the fixture harness', 'QA dirty-state fixture is accepted', 'IDE dirty close Cancel keeps the window open', 'IDE dirty close Save writes the file and closes', "IDE dirty close Don't save closes without another write", 'Main dirty close Cancel keeps the Agent window open')
$qaGit = Qa-Group @('throwaway git fixture supports status, diff, stage and commit')
$qaBrowser = Qa-Group @('local browser fixture labels source and handles 404')
$qaFiles = Qa-Group @('permission errors are returned without renderer crashes', 'file tool rejects paths outside the workspace')
$qaProvider = Qa-Group @('packaged app has no secret-looking files', 'packaged first run is isolated and key-free')
$qaChats = Qa-Group @('long chat crosses the context warning threshold', 'summarize and continue keeps the transcript recoverable', 'fork chat creates a linked child and leaves parent messages unchanged', 'fork from here creates a child record')
$qaStability = Qa-Group @('idle/action stability stays below 2x baseline', 'stability run has no renderer errors or crashes')
$qaSecurity = Qa-Group @('packaged app has no secret-looking files', 'packaged security preferences are present', 'packaged CSP and external-link policy are present', 'packaged preload exposes a bounded bridge')

$automated = @(
  [pscustomobject]@{ Item = '1 Startup/isolation'; Status = if ($smokeOk -and $qaAgent.Status -eq 'PASS') { 'PASS' } else { if ($qaAgent.Status -eq 'NOT CHECKED') { 'NOT CHECKED' } else { 'FAIL' } }; Evidence = "isolated-smoke.log; $($qaAgent.Evidence)" },
  [pscustomobject]@{ Item = '2 Agent view'; Status = $qaAgent.Status; Evidence = $qaAgent.Evidence },
  [pscustomobject]@{ Item = '3 Working modes'; Status = $qaModes.Status; Evidence = $qaModes.Evidence },
  [pscustomobject]@{ Item = '4 Code window'; Status = $qaIde.Status; Evidence = $qaIde.Evidence },
  [pscustomobject]@{ Item = '5 Terminal'; Status = if ($smokeOk) { 'PASS' } else { 'FAIL' }; Evidence = 'isolated-smoke.log; terminal path is exercised by smoke' },
  [pscustomobject]@{ Item = '6 Git fixture'; Status = $qaGit.Status; Evidence = $qaGit.Evidence },
  [pscustomobject]@{ Item = '7 Local browser fixture'; Status = $qaBrowser.Status; Evidence = $qaBrowser.Evidence },
  [pscustomobject]@{ Item = '8 Files/path safety'; Status = $qaFiles.Status; Evidence = $qaFiles.Evidence },
  [pscustomobject]@{ Item = '9 Providers/keys'; Status = $qaProvider.Status; Evidence = $qaProvider.Evidence },
  [pscustomobject]@{ Item = '10 Chats/long context'; Status = $qaChats.Status; Evidence = $qaChats.Evidence },
  [pscustomobject]@{ Item = '11 Stability'; Status = $qaStability.Status; Evidence = $qaStability.Evidence },
  [pscustomobject]@{ Item = '12 Security'; Status = $qaSecurity.Status; Evidence = $qaSecurity.Evidence },
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
$lines.Add('Automated checks use only throwaway fixture files, a local 127.0.0.1 server, and an isolated packaged-app userData directory. Visual polish and unsigned-installer SmartScreen interaction remain manual.')
Set-Content -LiteralPath (Join-Path $repo 'docs/release-checklist.md') -Value $lines -Encoding UTF8

Write-Output "Release gate verdict: $verdict"
Write-Output "Checklist: $(Join-Path $repo 'docs/release-checklist.md')"
Write-Output "Fixture: $FixtureRoot"
if ($verdict -ne 'GO') { exit 2 }

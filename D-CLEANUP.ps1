<#
.SYNOPSIS
  Preview rebuildable D: cleanup candidates from the read-only scan.

.DESCRIPTION
  Dry-run is the default. Deletion requires -Apply and is still restricted to
  paths explicitly marked "safe to delete (rebuildable)" in the scan report.
  D:\PIT and the VD Agent source are always excluded.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Apply,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$report = 'C:\vd-vms\D-CLEANUP-CANDIDATES.md'
if (-not (Test-Path -LiteralPath $report -PathType Leaf)) {
  throw "Cleanup report not found: $report"
}

$dryRun = -not $Apply -or $WhatIf
$decision = 'safe to delete (rebuildable)'
$paths = foreach ($line in Get-Content -LiteralPath $report) {
  if ($line -match '\|\s*safe to delete \(rebuildable\)\s*\|\s*(D:\\[^|]+?)\s*\|') {
    $matches[1].Trim()
  }
}

$selected = @(
  $paths |
    ForEach-Object { [IO.Path]::GetFullPath($_) } |
    Where-Object {
      $_ -like 'D:\*' -and
      $_ -notlike 'D:\PIT' -and $_ -notlike 'D:\PIT\*' -and
      $_ -notlike 'D:\pers\Desktop Agent' -and $_ -notlike 'D:\pers\Desktop Agent\*'
    } |
    Sort-Object Length -Unique
)

# If a parent and a child are both listed, only report/delete the parent once.
$roots = [Collections.Generic.List[string]]::new()
foreach ($path in $selected) {
  if (-not ($roots | Where-Object { $path -eq $_ -or $path.StartsWith("$_\", [StringComparison]::OrdinalIgnoreCase) })) {
    $roots.Add($path)
  }
}

if ($dryRun) {
  Write-Output 'Dry run (default). No files will be deleted. Use -Apply to request deletion.'
}
foreach ($path in $roots) {
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Output "Missing: $path"
    continue
  }
  if ($dryRun) {
    Remove-Item -LiteralPath $path -Recurse -Force -WhatIf
  } elseif ($PSCmdlet.ShouldProcess($path, "Delete $decision")) {
    Remove-Item -LiteralPath $path -Recurse -Force
    Write-Output "Deleted: $path"
  }
}

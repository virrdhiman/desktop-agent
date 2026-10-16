param(
  [Parameter(Mandatory = $true)][string]$Uninstaller,
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$UserData,
  [Parameter(Mandatory = $true)][string]$ResultsRoot
)
$ErrorActionPreference = 'Stop'
$null = Add-Type -AssemblyName UIAutomationClient
$null = Add-Type -AssemblyName UIAutomationTypes
$null = Add-Type -AssemblyName System.Drawing
$null = Add-Type -AssemblyName System.Windows.Forms
New-Item -ItemType Directory -Force -Path (Join-Path $ResultsRoot 'screenshots') | Out-Null
$shot = 0
function Save-Shot([string]$name) {
  $screen = [Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = New-Object Drawing.Bitmap $screen.Width, $screen.Height
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($screen.Location, [Drawing.Point]::Empty, $screen.Size)
  $script:shot++
  $file = Join-Path $ResultsRoot ('screenshots/{0:D2}-{1}.png' -f $script:shot, $name)
  $bitmap.Save($file, [Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose(); return $file
}
function Find-Button([System.Windows.Automation.AutomationElement]$Root) {
  $condition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
  $buttons = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
  foreach ($button in $buttons) {
    if ($button.Current.Name -match '^(Yes|Uninstall|Remove|OK)$') { return $button }
  }
  return $null
}
$process = Start-Process -FilePath ([IO.Path]::GetFullPath($Uninstaller)) -PassThru
$errorText = $null
try {
  for ($i = 0; $i -lt 120 -and $process.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 250; $process.Refresh() }
  Save-Shot 'before'
  $root = $null
  if ($process.MainWindowHandle -and $process.MainWindowHandle -ne [IntPtr]::Zero) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
  }
  if ($root) {
    $button = Find-Button $root
    if ($button) {
      $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    } else {
      [Windows.Forms.SendKeys]::SendWait('{ENTER}')
    }
  } else {
    [Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }
  Start-Sleep -Seconds 2
  if (-not $process.HasExited) { [Windows.Forms.SendKeys]::SendWait('{ENTER}') }
  Start-Sleep -Seconds 2
  Save-Shot 'after-confirm'
  $process.WaitForExit(180000) | Out-Null
  Save-Shot 'after-exit'
} catch { $errorText = $_.Exception.ToString() } finally {
  if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
}
$appRemoved = (-not (Test-Path (Join-Path $InstallRoot 'VD Agent.exe'))) -and (-not (Test-Path (Join-Path $InstallRoot 'VD Agent\VD Agent.exe')))
$dataKept = (Test-Path (Join-Path $UserData 'settings.json')) -and (Test-Path (Join-Path $UserData 'conversations\update-preservation.json'))
$result = [pscustomobject]@{ ok = [string]::IsNullOrEmpty($errorText) -and $appRemoved -and $dataKept; appRemoved = $appRemoved; userDataKept = $dataKept; error = $errorText }
$result | ConvertTo-Json | Set-Content (Join-Path $ResultsRoot 'uninstall-evidence.json')
if (-not $result.ok) { throw ($result | ConvertTo-Json -Compress) }

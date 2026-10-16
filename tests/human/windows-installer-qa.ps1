param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Portable,
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$ResultsRoot,
  [switch]$PortableOnly,
  [int]$InstallTimeoutSec = 300,
  [int]$InstallScreenshotIntervalSec = 10,
  [switch]$InstallOnly
)

$ErrorActionPreference = 'Stop'
$null = Add-Type -AssemblyName UIAutomationClient
$null = Add-Type -AssemblyName UIAutomationTypes
$script:ResultRoot = [IO.Path]::GetFullPath($ResultsRoot)
$script:ShotNumber = 0
New-Item -ItemType Directory -Force -Path $script:ResultRoot, (Join-Path $script:ResultRoot 'screenshots') | Out-Null

function Require-Capacity {
  $drive = Get-PSDrive -Name C
  if ($drive.Free -lt 20GB) { throw "Refusing QA writes: C: has less than 20 GB free ($([math]::Round($drive.Free / 1GB, 2)) GB)." }
}

function Save-Screenshot([string]$Label) {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  $screen = [Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = New-Object Drawing.Bitmap $screen.Width, $screen.Height
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($screen.Location, [Drawing.Point]::Empty, $screen.Size)
  $script:ShotNumber++
  $file = Join-Path $script:ResultRoot ('screenshots/{0:D4}-{1}.png' -f $script:ShotNumber, ($Label -replace '[^A-Za-z0-9_.-]', '_'))
  $bitmap.Save($file, [Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
  return $file
}

function Write-Event([string]$Action, [hashtable]$Data = @{}) {
  $script:Events += [pscustomobject]@{ time = (Get-Date).ToString('o'); action = $Action; data = $Data }
}

function Pause-Human {
  Start-Sleep -Milliseconds (Get-Random -Minimum 150 -Maximum 401)
}

function Activate-Window([Diagnostics.Process]$Process) {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}

'@
  for ($i = 0; $i -lt 240 -and $Process.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 250; $Process.Refresh() }
  if ($Process.MainWindowHandle -eq 0) { throw "Application window did not appear (PID $($Process.Id))." }
  [WindowFocus]::ShowWindow($Process.MainWindowHandle, 5) | Out-Null
  [WindowFocus]::SetWindowPos($Process.MainWindowHandle, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0003 -bor 0x0040) | Out-Null
  [WindowFocus]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 300
}

function Get-ChildProcessIds([int]$ParentId) {
  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ParentId" -ErrorAction SilentlyContinue)
  $ids = @()
  foreach ($child in $children) {
    $ids += [int]$child.ProcessId
    $ids += Get-ChildProcessIds ([int]$child.ProcessId)
  }
  return $ids
}

function Wait-VisibleProcess([Diagnostics.Process]$Process, [int]$TimeoutSec = 120) {
  for ($i = 0; $i -lt ($TimeoutSec * 4); $i++) {
    $ids = @($Process.Id) + @(Get-ChildProcessIds $Process.Id)
    foreach ($id in ($ids | Select-Object -Unique)) {
      $candidate = Get-Process -Id $id -ErrorAction SilentlyContinue
      if (-not $candidate) { continue }
      $candidate.Refresh()
      if ($candidate.MainWindowHandle -ne 0) { return $candidate }
    }
    Start-Sleep -Milliseconds 250
  }
  throw "Application window did not appear for process tree rooted at PID $($Process.Id) within $TimeoutSec seconds."
}

function Find-Control([System.Windows.Automation.AutomationElement]$Root, [string[]]$Names, [System.Windows.Automation.ControlType]$Type) {
  foreach ($name in $Names) {
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name)
    if ($Type) { $condition = [System.Windows.Automation.AndCondition]::new($condition, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $Type)) }
    $found = $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    if ($found) { return $found }
  }
  return $null
}

function Click-Control([System.Windows.Automation.AutomationElement]$Root, [string[]]$Names, [string]$Label) {
  Save-Screenshot "$Label-before"
  $button = Find-Control $Root $Names ([System.Windows.Automation.ControlType]::Button)
  if (-not $button) { $button = Find-Control $Root $Names $null }
  if (-not $button) { throw "Visible control not found for $Label. Tried: $($Names -join ', ')" }
  try {
    $invoke = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
  } catch {
    $point = [System.Windows.Point]::new(0, 0)
    if (-not $button.TryGetClickablePoint([ref]$point)) {
      $rect = $button.Current.BoundingRectangle
      if ($rect.Width -le 0 -or $rect.Height -le 0) { throw "Control $Label has no InvokePattern or clickable point." }
      $point = [System.Windows.Point]::new($rect.X + ($rect.Width / 2), $rect.Y + ($rect.Height / 2))
    }
    [WindowFocus]::SetCursorPos([int]$point.X, [int]$point.Y) | Out-Null
    [WindowFocus]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    [WindowFocus]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  }
  Pause-Human
  Save-Screenshot "$Label-after"
  Write-Event 'click' @{ label = $Label; names = $Names }
}

function Type-RealKeys([System.Windows.Automation.AutomationElement]$Root, [string[]]$Names, [string]$Text, [string]$Label) {
  Add-Type -AssemblyName System.Windows.Forms
  $field = Find-Control $Root $Names ([System.Windows.Automation.ControlType]::Edit)
  if (-not $field) {
    $editCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
    $field = $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCondition)
  }
  if (-not $field) {
    # NSIS exposes the destination field as a nameless Pane on some Windows builds.
    # The installer window is foreground and the field is selected by the preceding
    # visible Browse action, so continue with ordinary keystrokes rather than an
    # internal setter.
    # After Escape, focus remains on Browse. Shift+Tab returns to the
    # destination edit on NSIS builds where UI Automation exposes it without
    # a Name property.
    [Windows.Forms.SendKeys]::SendWait('+{TAB}')
    Start-Sleep -Milliseconds 150
    [Windows.Forms.SendKeys]::SendWait('^a')
    Start-Sleep -Milliseconds 150
    foreach ($character in $Text.ToCharArray()) {
      Save-Screenshot "$Label-before"
      $started = [Diagnostics.Stopwatch]::StartNew()
      [Windows.Forms.SendKeys]::SendWait($character.ToString().Replace('{', '{{').Replace('}', '}}').Replace('+', '{+}').Replace('^', '{^}').Replace('%', '{%}'))
      $started.Stop()
      Save-Screenshot "$Label-after"
      Write-Event 'key' @{ label = $Label; key = [string]$character; latencyMs = $started.Elapsed.TotalMilliseconds; fallback = $true }
      Start-Sleep -Milliseconds (Get-Random -Minimum 120 -Maximum 201)
    }
    return
  }
  $focus = $field.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern) 2>$null
  if ($focus) { $focus.ScrollIntoView() }
  $field.SetFocus()
  foreach ($character in $Text.ToCharArray()) {
    Save-Screenshot "$Label-before"
    $started = [Diagnostics.Stopwatch]::StartNew()
    [Windows.Forms.SendKeys]::SendWait($character.ToString().Replace('{', '{{').Replace('}', '}}').Replace('+', '{+}').Replace('^', '{^}').Replace('%', '{%}'))
    $started.Stop()
    Save-Screenshot "$Label-after"
    Write-Event 'key' @{ label = $Label; key = [string]$character; latencyMs = $started.Elapsed.TotalMilliseconds }
    Start-Sleep -Milliseconds (Get-Random -Minimum 120 -Maximum 201)
  }
}

function Wait-Installer([Diagnostics.Process]$Process) {
  Activate-Window $Process
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($Process.MainWindowHandle)
  if (-not $root) { throw 'Could not obtain Windows UI Automation root for installer.' }
  return $root
}

function Get-InstallerWindow([Diagnostics.Process]$Process) {
  $Process.Refresh()
  if ($Process.MainWindowHandle -and $Process.MainWindowHandle -ne [IntPtr]::Zero) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($Process.MainWindowHandle)
    if ($root) { return $root }
  }
  $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($window in $windows) {
    try {
      $handle = [IntPtr]$window.Current.NativeWindowHandle
      if ($handle -eq [IntPtr]::Zero) { continue }
      $owner = Get-Process -Id ([uint32]$window.Current.ProcessId) -ErrorAction SilentlyContinue
      if ($owner -and ($owner.Id -eq $Process.Id -or $owner.ProcessName -match '(?i)VD-Agent|VD Agent|nsis|setup')) { return $window }
    } catch { }
  }
  return $null
}

function Run-NsisInstall {
  $rootPath = [IO.Path]::GetFullPath($InstallRoot)
  if (Test-Path $rootPath) { throw "Refusing to reuse installer test directory: $rootPath" }
  $process = Start-Process -FilePath ([IO.Path]::GetFullPath($Installer)) -PassThru
  try {
    $root = Wait-Installer $process
    Click-Control $root @('I Agree', 'I accept the agreement') 'license-accept'
    Start-Sleep -Milliseconds 500
    $root = Wait-Installer $process
    Click-Control $root @('Next >', 'Next') 'license-next'
    $root = Wait-Installer $process
    Click-Control $root @('Browse...','Browse') 'custom-folder-browse'
    # The NSIS folder picker is a separate native dialog without a path edit.
    # Close that visible dialog with a real Escape keystroke and edit the
    # destination field on the parent page instead.
    Save-Screenshot 'custom-folder-dialog-before-cancel'
    [Windows.Forms.SendKeys]::SendWait('{ESC}')
    Pause-Human
    Save-Screenshot 'custom-folder-dialog-after-cancel'
    Write-Event 'key' @{ label = 'custom-folder-dialog-cancel'; key = 'Escape' }
    $root = Wait-Installer $process
    Type-RealKeys $root @('Folder:','Path:','Destination Folder:') $rootPath 'custom-folder-path'
    Click-Control $root @('Next >', 'Next', 'Install') 'install-confirm'
    $finish = $null
    $started = [Diagnostics.Stopwatch]::StartNew()
    $nextScreenshot = 0
    $installed = $false
    $installedExe = $null
    for ($i = 0; $i -lt $InstallTimeoutSec -and -not $installed; $i++) {
      Start-Sleep -Seconds 1
      if ($started.Elapsed.TotalSeconds -ge $nextScreenshot) {
        Save-Screenshot ('install-progress-{0:D4}s' -f [int]$started.Elapsed.TotalSeconds)
        $nextScreenshot += [Math]::Max(1, $InstallScreenshotIntervalSec)
      }
      $candidates = @(
        (Join-Path $rootPath 'VD Agent.exe'),
        (Join-Path $rootPath 'VD Agent\VD Agent.exe')
      )
      $installedExe = $candidates | Where-Object {
        $appAsar = Join-Path (Split-Path $_) 'resources\app.asar'
        $uninstaller = Join-Path (Split-Path $_) 'Uninstall VD Agent.exe'
        (Test-Path $_) -and (Test-Path $uninstaller) -and (Test-Path $appAsar) -and ((Get-Item $appAsar).Length -gt 100MB)
      } | Select-Object -First 1
      $installed = [bool]$installedExe
      Write-Event 'install-poll' @{ seconds = [int]$started.Elapsed.TotalSeconds; processId = $process.Id; installed = $installed; path = $installedExe }
    }
    if (-not $installed) { throw "Installer did not complete within $InstallTimeoutSec seconds; expected $rootPath\VD Agent.exe." }
    Save-Screenshot 'install-finish-visible'
    Write-Event 'install-finish-visible' @{ path = $installedExe; seconds = [int]$started.Elapsed.TotalSeconds }
    # NSIS may move the completion page into an elevated helper process, which
    # is intentionally invisible to non-elevated UI Automation. The completion
    # page keeps focus on Finish, so a real Enter key closes it without relying
    # on an internal control lookup across the UIPI boundary.
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Seconds 2
    $process.WaitForExit(30000) | Out-Null
    if (-not $installedExe -or -not (Test-Path $installedExe)) { throw "NSIS install did not create an executable under $rootPath" }
    Write-Event 'assert' @{ label = 'custom-folder-installed'; path = $installedExe }
  } finally {
    if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
  }
}

function Run-PortableLaunch {
  $portablePath = [IO.Path]::GetFullPath($Portable)
  if (-not (Test-Path $portablePath)) { throw "Portable artifact not found: $portablePath" }
  Save-Screenshot 'portable-before-launch'
  $userData = '--user-data-dir=' + (Join-Path $script:ResultRoot 'portable-userdata')
  $process = Start-Process -FilePath $portablePath -ArgumentList @($userData, '--disable-gpu', '--enable-logging') -PassThru
  try {
    $windowProcess = Wait-VisibleProcess $process
    Activate-Window $windowProcess
    Save-Screenshot 'portable-after-launch'
    Write-Event 'launch' @{ label = 'portable'; pid = $process.Id; windowPid = $windowProcess.Id; windowTitle = $windowProcess.MainWindowTitle }
  } finally {
    foreach ($id in (@($process.Id) + @(Get-ChildProcessIds $process.Id) | Select-Object -Unique)) {
      $candidate = Get-Process -Id $id -ErrorAction SilentlyContinue
      if ($candidate -and -not $candidate.HasExited) { $candidate.Kill(); $candidate.WaitForExit() }
    }
  }
}

Require-Capacity
$script:Events = @()
$script:QaError = $null
try {
  if (-not $PortableOnly) { Run-NsisInstall }
  if (-not $InstallOnly) { Run-PortableLaunch }
} catch {
  $script:QaError = $_.Exception.ToString()
  Write-Event 'error' @{ message = $script:QaError }
}
[pscustomobject]@{
  ok = [string]::IsNullOrEmpty($script:QaError)
  installer = [IO.Path]::GetFullPath($Installer)
  portable = [IO.Path]::GetFullPath($Portable)
  installRoot = [IO.Path]::GetFullPath($InstallRoot)
  events = $script:Events
  error = $script:QaError
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $script:ResultRoot 'installer-evidence.json')
if ($script:QaError) { Write-Error $script:QaError; exit 1 }

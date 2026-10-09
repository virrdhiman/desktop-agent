param(
  [Parameter(Mandatory = $true)]
  [string]$IsoPath,
  [string]$Name = 'VD-Agent-QA',
  [string]$OsType = 'Windows10_64',
  [int]$MemoryMB = 4096,
  [int]$Cpus = 2,
  [int]$DiskGB = 80
)

$ErrorActionPreference = 'Stop'

function Resolve-VBoxManage {
  $command = Get-Command VBoxManage -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $possible = @(
    "$env:ProgramFiles\Oracle\VirtualBox\VBoxManage.exe",
    "$env:ProgramFiles(x86)\Oracle\VirtualBox\VBoxManage.exe"
  )
  foreach ($path in $possible) {
    if (Test-Path $path) { return $path }
  }

  throw 'VBoxManage was not found. Run Win\setup-vm-host.bat first, then retry.'
}

function Write-Step {
  param([string]$Message)
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$iso = Resolve-Path -LiteralPath $IsoPath
$vbox = Resolve-VBoxManage
$vmRoot = Join-Path $env:USERPROFILE "VirtualBox VMs\$Name"
$disk = Join-Path $vmRoot "$Name.vdi"

Write-Step "Checking VirtualBox"
& $vbox --version

$existing = & $vbox list vms
if ($existing -match [regex]::Escape("""$Name""")) {
  throw "VirtualBox VM '$Name' already exists. Delete/rename it in VirtualBox Manager or pass -Name with a new value."
}

Write-Step "Creating VM $Name"
& $vbox createvm --name $Name --ostype $OsType --register
& $vbox modifyvm $Name --memory $MemoryMB --cpus $Cpus --vram 128 --graphicscontroller vmsvga --nic1 nat --clipboard bidirectional --draganddrop bidirectional --ioapic on --boot1 dvd --boot2 disk

Write-Step "Creating virtual disk"
& $vbox createmedium disk --filename $disk --size ($DiskGB * 1024) --format VDI

Write-Step "Attaching storage and ISO"
& $vbox storagectl $Name --name 'SATA' --add sata --controller IntelAhci
& $vbox storageattach $Name --storagectl 'SATA' --port 0 --device 0 --type hdd --medium $disk
& $vbox storagectl $Name --name 'IDE' --add ide
& $vbox storageattach $Name --storagectl 'IDE' --port 0 --device 0 --type dvddrive --medium $iso

Write-Step "Starting VM"
& $vbox startvm $Name --type gui

Write-Host ''
Write-Host "VM '$Name' is ready. Install Windows inside the VM, then install VS Code and run VD Agent installer QA."

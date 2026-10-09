param(
  [string]$OutDir = 'local-certs',
  [string]$Name = 'VD Agent Local Test Code Signing',
  [string]$Password = ''
)

$ErrorActionPreference = 'Stop'

function Read-SecretText {
  param([string]$Prompt)
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

if (-not $Password) {
  $Password = Read-SecretText -Prompt 'Password for local test .pfx'
}

$targetDir = Join-Path (Get-Location) $OutDir
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$pfxPath = Join-Path $targetDir 'vd-agent-local-test-code-signing.pfx'

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=$Name" `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -KeyExportPolicy Exportable `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(2)

$securePassword = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null

Write-Host ''
Write-Host "Created local test certificate: $pfxPath" -ForegroundColor Green
Write-Host ''
Write-Host 'Important: this is only for private QA. It will not remove public SmartScreen warnings.'
Write-Host 'Use it locally like this:'
Write-Host "  `$env:CSC_LINK = '$pfxPath'"
Write-Host '  $env:CSC_KEY_PASSWORD = "<password you entered>"'
Write-Host '  npm run release:signing -- --platform Windows --require-signing'
Write-Host '  Win\build.bat'

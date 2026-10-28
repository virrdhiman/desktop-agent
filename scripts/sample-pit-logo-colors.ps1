param(
  [string]$ImagePath = (Join-Path $PSScriptRoot '..\src\assets\pit-logo.png'),
  [int]$Top = 3
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$resolvedPath = (Resolve-Path -LiteralPath $ImagePath).Path
$bitmap = [System.Drawing.Bitmap]::FromFile($resolvedPath)
try {
  $counts = @{}
  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      if ($pixel.A -ne 255) { continue }
      $hex = '#{0:X2}{1:X2}{2:X2}' -f $pixel.R, $pixel.G, $pixel.B
      if ($counts.ContainsKey($hex)) { $counts[$hex]++ } else { $counts[$hex] = 1 }
    }
  }

  $ranked = @($counts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First $Top)
  [pscustomobject]@{
    Image = $resolvedPath
    Width = $bitmap.Width
    Height = $bitmap.Height
    OpaquePixels = ($counts.Values | Measure-Object -Sum).Sum
  } | Format-List
  $ranked | ForEach-Object { '{0}  {1} opaque pixels' -f $_.Key, $_.Value }
} finally {
  $bitmap.Dispose()
}

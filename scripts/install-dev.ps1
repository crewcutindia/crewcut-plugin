param(
  [switch]$Copy,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$CepExtensionsRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$TargetPath = Join-Path $CepExtensionsRoot 'in.crewcut.nle'

if ($Uninstall) {
  if (Test-Path $TargetPath) {
    $item = Get-Item $TargetPath -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      cmd /c rmdir "`"$TargetPath`""
    } else {
      Remove-Item $TargetPath -Recurse -Force
    }
    Write-Host "Removed $TargetPath"
  } else {
    Write-Host "Not installed at $TargetPath"
  }
  exit 0
}

# 1. Enable unsigned CEP extension loading for CSXS 11 & 12
foreach ($ver in @('11', '12')) {
  $regPath = "HKCU:\Software\Adobe\CSXS.$ver"
  if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
  }
  Set-ItemProperty -Path $regPath -Name 'PlayerDebugMode' -Value '1' -Type String
  Write-Host "Enabled PlayerDebugMode=1 on $regPath"
}

# 2. Ensure CEP extensions directory exists
if (-not (Test-Path $CepExtensionsRoot)) {
  New-Item -ItemType Directory -Path $CepExtensionsRoot -Force | Out-Null
}

# 3. Remove previous link/folder if present
if (Test-Path $TargetPath) {
  $existing = Get-Item $TargetPath -Force
  if ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    cmd /c rmdir "`"$TargetPath`""
  } else {
    Remove-Item $TargetPath -Recurse -Force
  }
}

# 4. Junction (live editing) or standalone copy (for packaging/export)
if ($Copy) {
  New-Item -ItemType Directory -Path $TargetPath -Force | Out-Null
  foreach ($rel in @('CSXS', 'client', 'host', '.debug', 'node_modules', 'package.json')) {
    $src = Join-Path $RepoRoot $rel
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $TargetPath $rel) -Recurse -Force
    }
  }
  Write-Host "Copied extension files to $TargetPath"
} else {
  New-Item -ItemType Junction -Path $TargetPath -Target $RepoRoot | Out-Null
  Write-Host "Linked $TargetPath -> $RepoRoot"
}

Write-Host "Done. Restart Premiere Pro or After Effects and open Window > Extensions > CrewCut."

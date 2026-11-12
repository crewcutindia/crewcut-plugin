param(
  [string]$ZxpSignCmdPath = 'ZXPSignCmd',
  [string]$CertPath = '',
  [string]$CertPassword = '',
  [switch]$SelfSigned
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DistDir = Join-Path $RepoRoot 'dist'
$StagingDir = Join-Path $DistDir 'staging'
$OutZxp = Join-Path $DistDir 'crewcut-nle-plugin.zxp'
$OutZip = Join-Path $DistDir 'crewcut-nle-plugin.zip'

if (Test-Path $StagingDir) {
  Remove-Item $StagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null

foreach ($rel in @('CSXS', 'client', 'host', 'node_modules', 'package.json')) {
  $src = Join-Path $RepoRoot $rel
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $StagingDir $rel) -Recurse -Force
  }
}

Write-Host "Staged clean release bundle at $StagingDir"

$zxpCmd = Get-Command $ZxpSignCmdPath -ErrorAction SilentlyContinue
if (-not $zxpCmd) {
  if (Test-Path $OutZip) {
    Remove-Item $OutZip -Force
  }
  Compress-Archive -Path (Join-Path $StagingDir '*') -DestinationPath $OutZip -Force
  Write-Host "ZXPSignCmd not found in PATH. Created unsigned staging archive: $OutZip"
  Write-Host 'To sign a distributable .zxp, install ZXPSignCmd and rerun with -CertPath <p12> -CertPassword <pass> (or -SelfSigned).'
  exit 0
}

if (-not $CertPath) {
  if (-not $SelfSigned) {
    throw 'Specify -CertPath and -CertPassword, or pass -SelfSigned to generate a test certificate.'
  }
  $CertPath = Join-Path $DistDir 'dev-cert.p12'
  if (-not $CertPassword) {
    $CertPassword = 'crewcut-dev-cert'
  }
  if (-not (Test-Path $CertPath)) {
    & $zxpCmd.Source -selfSignedCert 'IN' 'CrewCut' 'CrewCut' 'CrewCut' $CertPassword $CertPath
    if ($LASTEXITCODE -ne 0) {
      throw "ZXPSignCmd -selfSignedCert failed with exit code $LASTEXITCODE"
    }
  }
}

if (Test-Path $OutZxp) {
  Remove-Item $OutZxp -Force
}

& $zxpCmd.Source -sign $StagingDir $OutZxp $CertPath $CertPassword
if ($LASTEXITCODE -ne 0) {
  throw "ZXPSignCmd -sign failed with exit code $LASTEXITCODE"
}

Write-Host "Signed ZXP created: $OutZxp"

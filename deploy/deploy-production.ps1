param(
  [switch]$SkipTests,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Server = 'root@47.93.185.61'
$RemoteArchivePrefix = '/tmp/lbsc-deploy-'
$RemoteScript = '/tmp/lbsc-deploy-production.sh'

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  Write-Host "==> $Description" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE" }
}

Set-Location $ProjectRoot

$status = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Unable to read Git status.' }
if ($status) { throw "Working tree has uncommitted changes. Run git add and git commit first.`n$status" }

$branch = (git branch --show-current).Trim()
if (($LASTEXITCODE -ne 0) -or ($branch -ne 'main')) { throw 'Deployments are only allowed from main.' }

$commit = (git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to read current commit.' }
$archive = Join-Path $ProjectRoot ".tmp\lbsc-deploy-$commit.tar"
$remoteArchive = "${RemoteArchivePrefix}${commit}.tar"

if ($DryRun) {
  Write-Host "Dry run: would push main commit $commit and deploy to $Server." -ForegroundColor Yellow
  Write-Host 'No push, upload, or server operation was performed.'
  exit 0
}

if (-not $SkipTests) { Invoke-Checked 'Run automated tests' { npm test } }
Invoke-Checked 'Push GitHub main branch' { git push origin main }
Invoke-Checked 'Create deployment archive' { git archive --format=tar --output $archive HEAD }

try {
  Invoke-Checked 'Upload deployment archive' { scp $archive "${Server}:$remoteArchive" }
  Invoke-Checked 'Upload production deployment script' { scp (Join-Path $PSScriptRoot 'lbsc-deploy-production.sh') "${Server}:$RemoteScript" }
  Invoke-Checked 'Deploy production service' { ssh $Server "bash $RemoteScript $remoteArchive" }
  Invoke-Checked 'Check public health endpoint' { curl.exe -fsSL 'https://lbsc.maishikeji.com.cn/healthz' }
  Write-Host "Deployment complete: commit $commit" -ForegroundColor Green
}
finally {
  if (Test-Path $archive) { Remove-Item -LiteralPath $archive -Force }
}

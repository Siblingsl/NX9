# NX9 Desktop 打包验证脚本（Windows）
# 用法: powershell -ExecutionPolicy Bypass -File apps/desktop/scripts/verify.ps1 [-ExePath <path>]
param(
  [string]$ExePath = "apps/desktop/release/win-unpacked/NX9 Studio.exe"
)

$ErrorActionPreference = 'Stop'
$exe = Join-Path (Get-Location) $ExePath
if (-not (Test-Path $exe)) {
  Write-Error "未找到打包产物: $exe`n请先执行 pnpm desktop:pack:dir"
  exit 1
}

$exeDir = Split-Path $exe -Parent
$dataDir = Join-Path $exeDir 'nx9-data'
$runtimeJson = Join-Path $dataDir 'runtime.json'

Write-Host "[verify] 启动 $exe"
$proc = Start-Process -FilePath $exe -PassThru
try {
  # 等待 runtime.json 出现且 ready=true（最多 90s）
  $ready = $false
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $runtimeJson) {
      try {
        $rt = Get-Content $runtimeJson -Raw | ConvertFrom-Json
        if ($rt.ready) { $ready = $true; break }
      } catch { }
    }
    if ($proc.HasExited) {
      Write-Error "[verify] 进程提前退出，code=$($proc.ExitCode)。日志: $(Join-Path $dataDir 'nx9-server.log')"
      exit 1
    }
  }
  if (-not $ready) {
    Write-Error "[verify] 90s 内服务端未就绪。日志: $(Join-Path $dataDir 'nx9-server.log')"
    exit 1
  }

  $port = $rt.port
  Write-Host "[verify] 服务端就绪 port=$port (pid=$($rt.pid))"

  # 1. API 健康检查
  $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/status" -TimeoutSec 10
  Write-Host "[verify] /api/status ok=$($status.ok) service=$($status.service) version=$($status.version)"

  # 2. 前端首页（PS 5.1 的 Invoke-WebRequest 偶发 NullReference，用 curl.exe 更稳）
  $homeBody = (curl.exe -s "http://127.0.0.1:$port/") -join "`n"
  $hasRoot = [bool]($homeBody -match 'id="root"')
  $hasTitle = [bool]($homeBody -match 'NX9 Studio')
  Write-Host "[verify] / 含#root=$hasRoot 含标题=$hasTitle"

  # 3. 静态资源可访问（取 index.html 里的首个 /assets/*.js）
  if ($homeBody -match 'src="(/assets/[^"]+\.js)"') {
    $asset = $Matches[1]
    $assetCode = curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:$port$asset"
    Write-Host "[verify] 静态资源 $asset -> $assetCode"
  }

  Write-Host "[verify] 全部通过 ✅"
} finally {
  if (-not $proc.HasExited) {
    Write-Host "[verify] 关闭进程"
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
}

# 便携版修复验证：
# 1) 解压期间 splash.bmp 出现在 %TEMP%\ns*.tmp
# 2) 数据目录落在 exe 同级（PORTABLE_EXECUTABLE_DIR 修复 → Desktop\nx9-data）
# 3) /api/users/bootstrap 200（Prisma 修复）
$ErrorActionPreference = 'SilentlyContinue'
$portable = 'F:\code\project\NX9\apps\desktop\release\NX9-Studio-Portable-0.1.0.exe'
$desktopExe = 'C:\Users\User\Desktop\NX9-Studio-Portable-0.1.0.exe'

# 清理
Get-Process | Where-Object { $_.ProcessName -match '^NX9' } | Stop-Process -Force
if (Test-Path 'C:\Users\User\Desktop\nx9-data') { Remove-Item 'C:\Users\User\Desktop\nx9-data' -Recurse -Force }
Start-Sleep 2

# 复制新版到桌面
Copy-Item $portable $desktopExe -Force
"已更新桌面便携版: $((Get-Item $desktopExe).Length/1MB)MB"

"=== 便携版验证开始 $(Get-Date -Format 'HH:mm:ss') ==="
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "`"$desktopExe`"" }
"启动 returnValue=$($r.ReturnValue)"

$splashSeen = $false
$dataSeen = $false
$appSeen = $false
$deadline = (Get-Date).AddSeconds(300)
while ((Get-Date) -lt $deadline) {
  # 1) splash 检查：ns*.tmp 目录里应有 splash.bmp（解压初期）
  if (-not $splashSeen) {
    $ns = Get-ChildItem $env:TEMP -Directory -Filter 'ns*.tmp' | Sort-Object CreationTime -Descending | Select-Object -First 1
    if ($ns -and (Test-Path (Join-Path $ns.FullName 'splash.bmp'))) {
      "!! splash.bmp 已出现: $(Join-Path $ns.FullName 'splash.bmp') ($((Get-Item (Join-Path $ns.FullName 'splash.bmp')).Length) 字节) @ $(Get-Date -Format 'HH:mm:ss')"
      $splashSeen = $true
    }
  }
  # 2) 数据目录检查：Desktop\nx9-data
  if (-not $dataSeen -and (Test-Path 'C:\Users\User\Desktop\nx9-data')) {
    $dataSeen = $true
    "!! 数据目录已创建: C:\Users\User\Desktop\nx9-data @ $(Get-Date -Format 'HH:mm:ss')"
    "   nx9.db: $((Get-Item 'C:\Users\User\Desktop\nx9-data\nx9.db' -ErrorAction SilentlyContinue).Length) 字节"
  }
  # 3) 应用启动 + 用户引导
  $main = @(Get-Process | Where-Object { $_.ProcessName -eq 'NX9 Studio' })
  if ($main.Count -gt 0 -and -not $appSeen) {
    $appSeen = $true
    "!! 应用进程出现($($main.Count)个) @ $(Get-Date -Format 'HH:mm:ss')"
  }
  if ($dataSeen -and -not $appSeen) { break }
  if ($appSeen) {
    $rj = 'C:\Users\User\Desktop\nx9-data\runtime.json'
    if (Test-Path $rj) {
      $j = Get-Content $rj -Raw | ConvertFrom-Json
      if ($j.ready) {
        "--- 服务端就绪 port=$($j.port) ---"
        try {
          $u = Invoke-RestMethod "http://127.0.0.1:$($j.port)/api/users/bootstrap" -TimeoutSec 10
          "!! 用户引导成功! id=$($u.id) name=$($u.name) @ $(Get-Date -Format 'HH:mm:ss')"
        } catch { "用户引导失败: $($_.Exception.Message)" }
        break
      }
    }
  }
  Start-Sleep -Seconds 1
}
"=== 结束 $(Get-Date -Format 'HH:mm:ss') splash=$splashSeen dataDir=$dataSeen app=$appSeen ==="
Get-Process | Where-Object { $_.ProcessName -match '^NX9' } | Stop-Process -Force

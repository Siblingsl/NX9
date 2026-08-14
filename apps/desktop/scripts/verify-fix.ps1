# NX9 打包产物验证（修复后）
# 1) win-unpacked：启动 → 等 runtime.json → 校验 /api/users/bootstrap 200（Prisma 修复）
#    校验数据目录 nx9.db 已播种、用户已创建
# 2) 清理
$ErrorActionPreference = 'SilentlyContinue'
$exe = 'F:\code\project\NX9\apps\desktop\release\win-unpacked\NX9 Studio.exe'

# 清理旧数据目录（模拟全新首次启动）
$dataDir = 'F:\code\project\NX9\apps\desktop\release\win-unpacked\nx9-data'
Get-Process | Where-Object { $_.ProcessName -match '^NX9' } | Stop-Process -Force
if (Test-Path $dataDir) { Remove-Item $dataDir -Recurse -Force }
Start-Sleep 2

"=== 验证开始 $(Get-Date -Format 'HH:mm:ss') ==="
$p = Start-Process -FilePath $exe -PassThru
"启动 pid=$($p.Id)"

# 等待 runtime.json（服务端就绪）
$ready = $false
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline -and -not $ready) {
  Start-Sleep 2
  $rj = Join-Path $dataDir 'runtime.json'
  if (Test-Path $rj) {
    $j = Get-Content $rj -Raw | ConvertFrom-Json
    if ($j.ready) {
      $ready = $true
      $port = $j.port
      "服务端就绪 port=$port"
      # --- 校验 ---
      "--- /api/status ---"
      try { $r = Invoke-RestMethod "http://127.0.0.1:$port/api/status" -TimeoutSec 10; "ok=$($r.ok) version=$($r.version)" } catch { "失败: $($_.Exception.Message)" }
      "--- /api/users/bootstrap (Prisma 修复验证) ---"
      try {
        $u = Invoke-RestMethod "http://127.0.0.1:$port/api/users/bootstrap" -TimeoutSec 10
        "成功! 用户 id=$($u.id) name=$($u.name)"
      } catch {
        "失败: $($_.Exception.Message)"
        try { "HTTP状态: $($_.Exception.Response.StatusCode.value__)" } catch {}
      }
      "--- /api/users (列表) ---"
      try { $ul = Invoke-RestMethod "http://127.0.0.1:$port/api/users" -TimeoutSec 10; "用户数: $($ul.Count)" } catch { "失败: $($_.Exception.Message)" }
      "--- nx9.db 播种检查 ---"
      "dataDir/nx9.db 大小: $((Get-Item (Join-Path $dataDir 'nx9.db') -ErrorAction SilentlyContinue).Length)"
      "--- 页面 ---"
      try { $pg = Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 10; "首页: $($pg.StatusCode) 含root=$($pg.Content -match 'id=\"root\"')" } catch { "失败: $($_.Exception.Message)" }
    }
  }
}
if (-not $ready) { "超时：服务端未就绪" }

# 结束进程
Get-Process | Where-Object { $_.ProcessName -match '^NX9' } | Stop-Process -Force
"=== 验证结束 $(Get-Date -Format 'HH:mm:ss') ==="

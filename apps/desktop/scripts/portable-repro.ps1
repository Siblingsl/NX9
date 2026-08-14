# NX9 便携版故障复现监控脚本
# 用途：受控运行便携 exe，高频采样应用进程/窗口/数据目录/端口/Electron日志，
#       并在桩进程清理临时目录前把 nx9-data 证据拷贝出来。
$ErrorActionPreference = 'SilentlyContinue'

$exe     = 'C:\Users\User\Desktop\NX9-Studio-Portable-0.1.0.exe'
$log     = 'C:\Users\User\Desktop\nx9-electron.log'
$capture = 'C:\Users\User\Desktop\nx9-captured'
$start   = Get-Date
$deadline = $start.AddSeconds(240)

# ---- 0) 清理遗留状态 ----
Get-Process | Where-Object { $_.ProcessName -match 'NX9' } | ForEach-Object {
  "kill leftover: $($_.ProcessName) pid=$($_.Id) cpu=$([math]::Round($_.CPU,1))"
  Stop-Process -Id $_.Id -Force
}
Remove-Item $capture -Recurse -Force
Remove-Item $log -Force
Start-Sleep 2

"=== 受控复现开始 $(Get-Date -Format 'HH:mm:ss') ==="
$env:ELECTRON_ENABLE_LOGGING = '1'
$p = Start-Process -FilePath $exe -ArgumentList '--enable-logging=file', "--log-file=$log" -PassThru
"launched stub pid=$($p.Id)"

$appSeen = $false
while ((Get-Date) -lt $deadline) {
  $apps  = @(Get-Process | Where-Object { $_.ProcessName -match '^NX9' })
  $main  = @($apps | Where-Object { $_.ProcessName -notmatch 'Portable' })
  $stubs = @($apps | Where-Object { $_.ProcessName -match 'Portable' })
  $ns    = @(Get-ChildItem $env:TEMP -Directory -Filter 'ns*.tmp' | Where-Object { $_.CreationTime -gt $start.AddSeconds(-5) } | Sort-Object CreationTime -Descending)

  $nsName  = if ($ns.Count) { $ns[0].Name } else { '-' }
  $nsCount = if ($ns.Count) { (Get-ChildItem $ns[0].FullName -Recurse -File -ErrorAction SilentlyContinue).Count } else { -1 }
  $nsData  = 'no'
  if ($ns.Count) {
    $dp = Join-Path $ns[0].FullName 'nx9-data'
    if (Test-Path $dp) {
      $nsData = 'YES'
      if (-not (Test-Path $capture)) {
        Copy-Item $dp $capture -Recurse
        "!! 已捕获数据目录 -> $capture (含nx9-server.log=$(Test-Path (Join-Path $capture 'nx9-server.log')) runtime.json=$(Test-Path (Join-Path $capture 'runtime.json')))"
      }
      $srvLog = Join-Path $dp 'nx9-server.log'
      if (Test-Path $srvLog) {
        "   [server日志尾部] $((Get-Content $srvLog -Tail 3) -join ' / ')"
      }
    }
  }

  $winTitle = if ($main.Count) { (($main | ForEach-Object { "$($_.Id):$($_.MainWindowTitle)" }) -join ',') } else { '-' }
  $mainIds  = if ($main.Count) { (($main | ForEach-Object Id) -join ',') } else { '-' }
  $ports    = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -ExpandProperty LocalPort | Sort-Object) -join ','
  $logInfo  = if (Test-Path $log) { "electronLog=$((Get-Item $log).Length)B" } else { 'electronLog=-' }

  if ($main.Count -and -not $appSeen) {
    $appSeen = $true
    $ld = Get-Item "$env:APPDATA\@nx9\desktop\Local State" -ErrorAction SilentlyContinue
    if ($ld) { "!! 应用启动! LocalState mtime=$($ld.LastWriteTime.ToString('HH:mm:ss.fff'))" }
  }
  if ($appSeen -and $main.Count -eq 0) {
    "!! 应用进程已消失(退出/崩溃) @ $(Get-Date -Format 'HH:mm:ss')"
    $appSeen = $false
  }

  "{0} stubs={1} main=[{2}] ns={3}({4}) nx9data={5} win=[{6}] ports=[{7}] {8}" -f (Get-Date -Format 'HH:mm:ss'), $stubs.Count, $mainIds, $nsName, $nsCount, $nsData, $winTitle, $ports, $logInfo
  Start-Sleep -Milliseconds 800
}

"=== 结束 $(Get-Date -Format 'HH:mm:ss') ==="
$remain = @(Get-Process | Where-Object { $_.ProcessName -match 'NX9' })
"剩余NX9进程: $($remain.Count)  ($(($remain | ForEach-Object { "$($_.ProcessName):$($_.Id)" }) -join ', '))"
if (Test-Path $capture) {
  "捕获目录内容:"
  Get-ChildItem $capture | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
}
